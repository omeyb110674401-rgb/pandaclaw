/**
 * PandaClaw 服务：程序裁决中枢.
 *
 * 权威状态住在自有记录域（meetings/records/tallies 三张 KV 表）；本服务是
 * 唯一写入方。所有协议裁决——阶段迁移、回路轮次、准入硬项、表决前置门、
 * 机械计票——都在这里完成并抛出带错误码的 {@link PcError}，工具层只做转译.
 *
 * 身份信任边界（明示）：成员以「建会名单内的自报名」行使权利，首次提交即把
 * 名字绑定到其会话 id，此后异会话冒用同名被拒；该约束防止程序越界，不防
 * 同队成员主动互冒名——冒用会作为审计字段留在记录里供事后追责.
 */

import { Service, type Context } from '@deepseek-ai/cordis'
import type { Domain } from '@deepseek-ai/dsh-storage-domain'
import type { z } from 'zod'
import {
  type PcFact, type PcMeetingView, type PcMemberView,
  type PcRecordView, type PcReviewView, type PcTallyView,
} from './contract.ts'
import { PANDACLAW_DOMAIN, buildRecordId, tallyKey,
  type meetingSchema, type recordSchema, type tallySchema } from './domain.ts'
import { PcError } from './errors.ts'
import {
  MAX_ROUNDS_PER_STAGE, MAX_REVIEW_PER_DOC, REVIEW_FLOW, REVIEW_TIERS, REVIEW_OPINION_LIMIT,
  RULING_GATED_STAGES, STAGE_FLOWS, TIER_ROSTER, VOTE_STAGES, WORD_LIMITS,
  defaultValidation, hasOpinionStructure, passRuleFor, parseDocumentId, reviewPriority, stancesFor, tally as mechanicalTally,
  type MeetingType, type RecordKind, type ReviewFlag, type ReviewState, type Seat, type Tier, type Validation,
} from './protocol.ts'

type MeetingRow = z.infer<typeof meetingSchema>
type RecordRow = z.infer<typeof recordSchema>
type TallyRow = z.infer<typeof tallySchema>

/**
 * 主持人登记的锚点种类.
 * `warning`：关窗预告（监督窗口二阶段开启，ADR-0008）.
 * `supervision`：代录入板的用户监督意见或明示放弃（ADR-0006/0009，authorName='用户'）.
 * `review`：代录入板的用户复审意见（ADR-0010，authorName='用户'，触发复审流程开启）.
 */
const CHAIR_KINDS: readonly RecordKind[] = ['agenda', 'issue', 'digest', 'draft', 'focus', 'resolution', 'ruling', 'warning', 'supervision', 'review']

/** 成员可提交的种类与其法定席位. */
const MEMBER_KIND_SEATS: Readonly<Partial<Record<RecordKind, Exclude<Seat, 'chair'>>>> = {
  opinion: 'cppcc',
  inquiry: 'npc',
  reply: 'cppcc',
}

/** 单条文本的硬上限（入库截断防线；各文书的行为限值另见 WORD_LIMITS）. */
const MAX_TEXT_CHARS = 4000

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** PandaClaw 会议服务（行名 `pandaclaw`）. */
    pandaclaw: PandaClawService
  }
}

/** 建会请求. */
export interface ConveneRequest {
  readonly type: MeetingType
  readonly topic: string
  readonly tier?: Tier
  readonly validation?: Validation
  readonly cppccNames: readonly string[]
  readonly npcNames: readonly string[]
}

/**
 * 审查替身 spawn 钩子（ADR-0010 策略一：服务层全自动，不经任何 AI）。
 * 由宿主装配（index.ts）注入 `ctx.agents.create` 的真实实现；测试可注入桩。
 * 钩子只负责「派发」，不等待替身产出（替身异步直写服务层完成闭环）。
 */
export interface ReviewSpawner {
  /**
   * 派发一个审查替身（preset `pc-reviewer`，seed 空、setup 代码硬编码——只接收
   * 服务层构造的结构化审查包，不见任何原始自由文本）.
   * @param docId - 被审查案卷号（审查包内唯一自由化输入，由服务层校验格式）.
   * @param review - 结构化审查包（决议原文/票况/规约核对结果等代码选取字段）.
   */
  spawnReviewer(docId: string, review: Readonly<Record<string, unknown>>): Promise<void>
}

/**
 * 用户监督替身 spawn 钩子（ADR-0010 第 9 节，Q8-B：tally 门二受阻时服务层自动 spawn）.
 * 取代 ADR-0009「主持人经底座 spawn」的旧链路——派发完全脱离 AI 之手.
 */
export interface SupervisorSpawner {
  /**
   * 派发一个用户监督替身（preset `pc-supervisor-standin`，seed 空、setup 代码硬编码）.
   * @param docId - 当前 ⭐ 阶段所在案卷号.
   * @param stage - 拟计票阶段标识.
   * @param round - 拟计票轮次.
   */
  spawnSupervisor(docId: string, stage: string, round: number): Promise<void>
}

/** PandaClaw 服务（插件行 `pandaclaw`）. */
export class PandaClawService extends Service {
  private readonly opening: Promise<Domain<typeof PANDACLAW_DOMAIN>>
  private disposed = false
  /** 审查替身 spawn 钩子（ADR-0010 策略一）；缺省 no-op（测试/纯逻辑环境不派发）.*/
  private readonly spawner?: ReviewSpawner
  /** 监督替身 spawn 钩子（ADR-0010 第 9 节）；缺省 no-op. */
  private readonly supervisorSpawner?: SupervisorSpawner

  /**
   * @param ctx - 行上下文；`ctx.storageDomain` 已由 inject 保证在场.
   * @param options - 可选注入：审查替身/监督替身 spawn 钩子.
   */
  constructor(ctx: Context, options: { readonly spawner?: ReviewSpawner; readonly supervisorSpawner?: SupervisorSpawner } = {}) {
    super(ctx, 'pandaclaw')
    this.spawner = options.spawner
    this.supervisorSpawner = options.supervisorSpawner
    this.opening = ctx.storageDomain.open(PANDACLAW_DOMAIN)
    void this.opening.then(domain => {
      if (this.disposed) void domain.close()
    }, () => {
      // 打开失败在首个使用点暴露；这里无处可报，保持进程存活.
    })
  }

  /** @returns 释放记录域句柄（apply 经 effect 挂接）. */
  dispose(): void | Promise<void> {
    this.disposed = true
    return this.opening.then(domain => domain.close(), () => undefined)
  }

  // —— 内部读取 ——

  private async domain(): Promise<Domain<typeof PANDACLAW_DOMAIN>> {
    return this.opening
  }

  private async meetingOrThrow(docId: string): Promise<MeetingRow> {
    const meetings = (await this.domain()).table('meetings')
    const row = meetings.get(docId)
    if (row === undefined) throw new PcError('MEETING_NOT_FOUND', `文号 ${docId} 不存在：先用 pc_convene 建会，或核对文号拼写`)
    return row
  }

  private async recordsOf(docId: string): Promise<RecordRow[]> {
    const records = (await this.domain()).table('records')
    return [...records.entries()].map(([, value]) => value)
      .filter(record => record.docId === docId)
  }

  private stageIndex(row: MeetingRow, stageId: string): number {
    const index = row.stages.findIndex(stage => stage.id === stageId)
    if (index < 0) throw new PcError('BAD_STAGE', `阶段 ${stageId} 不属于会议 ${row.docId}`)
    return index
  }

  private assertOpen(row: MeetingRow): void {
    if (row.status !== 'open') {
      throw new PcError('NOT_OPEN', `会议 ${row.docId} 已${row.status === 'adjourned' ? '归档' : '终止'}，不能再产生任何记录`)
    }
  }

  /** 名字席位绑定校验：名单成员 + 首用绑定会话；rebind 解锚后由新会话首提交认领（ADR-0007）. */
  private bindSeat(row: MeetingRow, seat: Exclude<Seat, 'chair'>, name: string, sessionId: string, priorRecords: readonly RecordRow[]): void {
    const roster = seat === 'cppcc' ? row.cppccNames : row.npcNames
    if (!roster.includes(name)) {
      throw new PcError('SEAT_FORBIDDEN', `「${name}」不在本场会议的${seat === 'cppcc' ? '政协委员' : '人大代表'}名单内（${roster.join('、')}）；核对身份或自报名`)
    }
    const relevant = priorRecords.filter(record => record.authorName === name)
    if (relevant.length === 0) return
    const lastRebindIndex = (() => {
      for (let index = relevant.length - 1; index >= 0; index -= 1) {
        if (relevant[index].kind === 'rebind') return index
      }
      return -1
    })()
    if (lastRebindIndex < 0) {
      const prior = relevant[0]
      if (prior.authorSessionId !== sessionId) {
        throw new PcError('NAME_TAKEN', `「${name}」已由另一会话（${prior.authorSessionId}）绑定；同队成员不得冒用他人名义提交。若系断线重启的新会话，请主持人核实后执行 pc_rebind 认证重绑`)
      }
      return
    }
    // 解锚语义：最近一次 rebind 作废旧绑定，此后首个以该名提交的会话接管席位；
    // 被解锚的原会话永久失效——崩溃恢复不能变成冒名后门.
    const beforeRebind = relevant.slice(0, lastRebindIndex)
    const oldBinder = [...beforeRebind].reverse().find(record => record.kind !== 'rebind')?.authorSessionId
    const newBinder = relevant.slice(lastRebindIndex + 1).find(record => record.kind !== 'rebind')?.authorSessionId
    if (sessionId === oldBinder && newBinder !== sessionId) {
      throw new PcError('NAME_TAKEN', `「${name}」已被主持人认证解锚转移；原会话（${oldBinder}）的绑定已失效，不得再以该名义提交`)
    }
    if (newBinder !== undefined && sessionId !== newBinder) {
      throw new PcError('NAME_TAKEN', `「${name}」在重绑后已由会话（${newBinder}）认领持有`)
    }
  }

  private nextSeq(priorRecords: readonly RecordRow[], prefixMatch: (record: RecordRow) => boolean): number {
    let seq = 0
    for (const record of priorRecords) if (prefixMatch(record)) seq += 1
    return seq + 1
  }

  private async putRecord(row: RecordRow): Promise<PcRecordView> {
    const records = (await this.domain()).table('records')
    await records.put(row.id, row)
    return toRecordView(row)
  }

  // —— 复审回告闭环（ADR-0010）：私有辅助 ——

  /** 读取会议行的复审视图；无 review 字段时返回全缺省（idle/无标记/0 条）. */
  private reviewOf(row: MeetingRow): PcReviewView {
    const review = row.review
    return {
      state: review?.state ?? 'idle',
      flag: review?.flag ?? 'none',
      count: review?.count ?? 0,
      ...(review?.choice !== undefined ? { choice: review.choice as PcReviewView['choice'] } : {}),
      ...(review?.revisedDocId !== undefined ? { revisedDocId: review.revisedDocId } : {}),
      ...(review?.interpretRecordId !== undefined ? { interpretRecordId: review.interpretRecordId } : {}),
      ...(review?.priority !== undefined ? { priority: review.priority } : {}),
    }
  }

  /** 原子推进复审状态（读改写：并发复审动作不丢状态）. */
  private async advanceReview(docId: string, mutate: (review: NonNullable<MeetingRow['review']>) => void): Promise<PcMeetingView> {
    const meetings = (await this.domain()).table('meetings')
    let view!: PcMeetingView
    await meetings.update(docId, row => {
      const current: NonNullable<MeetingRow['review']> = row.review ?? { state: 'idle', flag: 'none', count: 0 }
      mutate(current)
      row.review = current
      view = toMeetingView(row)
      return row
    })
    return view
  }

  /**
   * 构造结构化审查包（ADR-0010 Q9-B）：替身只收代码选取的结构化数据，
   * 决议原文/票况/规约核对——用户意见与监督意见的原始全文零进入.
   * @param row - 被审查会议行.
   * @returns 审查包（setup 注入替身的全部输入）.
   */
  private async buildReviewPackage(row: MeetingRow): Promise<Readonly<Record<string, unknown>>> {
    const [records, tallies] = await Promise.all([
      this.recordsOf(row.docId),
      (async () => [...(await this.domain()).table('tallies').entries()]
        .map(([, value]) => value).filter(entry => entry.docId === row.docId))(),
    ])
    const resolution = records.find(record => record.kind === 'resolution')
    return {
      docId: row.docId,
      type: row.type,
      validation: row.validation,
      topic: row.topic,
      status: row.status,
      resolutionText: resolution?.text ?? '',
      // 票况只取结构化字段（不含选票理由原文）.
      tallies: tallies.map(tally => ({
        stage: tally.stage, round: tally.round, aye: tally.aye, nay: tally.nay,
        abstain: tally.abstain, mode: tally.mode, passed: tally.passed, rule: tally.rule,
      })),
      // 程序完成度：阶段流完成情况（不含记录全文）.
      stagesDone: row.stages.filter(stage => stage.state === 'done').length,
      stagesTotal: row.stages.length,
      // 规约核对：主线规约是否成立（决议存在/全阶段完成）.
      hasResolution: resolution !== undefined,
      allStagesDone: row.stages.every(stage => stage.state === 'done'),
    }
  }

  /** 判定会议行是否处于「复审进行中」的某个可写状态（非 idle/closed）. */
  private reviewing(row: MeetingRow): boolean {
    const state = row.review?.state ?? 'idle'
    return state !== 'idle' && state !== 'closed'
  }

  /** 当前复审阶段索引（无则 -1）. */
  private reviewStageIndex(state: ReviewState): number {
    return REVIEW_FLOW.findIndex(def => def.id === state)
  }

  // —— 复审回告闭环（ADR-0010）：公开方法 ——

  /**
   * 待审池出审调度（ADR-0010 Q15/Q17：有备必审分层，零 AI 判断）.
   * 从待审池中按优先级（主力先于次级/弱档，同档降级标记优先）取出并推进
   * filed → accepted → reviewing，派发审查替身。可由宿主在归档后调用，
   * 也可作为服务方法供主持人（用户授意）批处理.
   * @param limit - 最多处理条数（缺省 1）.
   * @returns 本次出审的案卷号列表.
   */
  async reviewDispatch(limit = 1): Promise<readonly string[]> {
    const meetings = (await this.domain()).table('meetings')
    const pool: { readonly docId: string; readonly priority: number }[] = []
    for (const [, value] of meetings.entries()) {
      if (value.review?.state === 'filed') {
        pool.push({ docId: value.docId, priority: value.review.priority ?? 99 })
      }
    }
    pool.sort((a, b) => a.priority - b.priority)
    const chosen = pool.slice(0, Math.max(1, limit))
    const dispatched: string[] = []
    for (const entry of chosen) {
      const row = await this.meetingOrThrow(entry.docId)
      if (row.review?.state !== 'filed') continue
      await this.advanceReview(entry.docId, review => { review.state = 'accepted' })
      if (this.spawner !== undefined) {
        const fresh = await this.meetingOrThrow(entry.docId)
        void this.spawner.spawnReviewer(entry.docId, await this.buildReviewPackage(fresh))
      }
      const done = await this.advanceReview(entry.docId, review => { review.state = 'reviewing' })
      void done
      dispatched.push(entry.docId)
    }
    return dispatched
  }

  /**
   * 提交复审意见并开启复审流程（ADR-0010）。
   * 入口两路合一：主持人代录用户意见（actorSessionId=主持人会话，text=原汁原味）
   * 与「有备必审」自动入池（主力档归档即触发）。主力档（RES/LEG）归档自动进入，
   * 次级/弱档仅本方法显式触发（用户提意见）。
   * @param actorSessionId - 提交方会话 id（审计字段）.
   * @param input - 文号与意见全文.
   */
  async reviewRequest(actorSessionId: string, input: { readonly docId: string; readonly text: string }): Promise<PcFact> {
    const row = await this.meetingOrThrow(input.docId)
    if (row.status !== 'adjourned') {
      throw new PcError('REVIEW_UNAVAILABLE', `案卷 ${input.docId} 未归档（当前 ${row.status}）：复审只受理已归档的决议；会中监督意见请走监督窗口（pc_record kind=supervision）`)
    }
    if (row.type === 'MIN') {
      throw new PcError('REVIEW_UNAVAILABLE', '纪要型（MIN）不产生新决定（「记」非「决」），无复审对象；对纪要内容的异议走会内更正循环')
    }
    // 弱/次级档（CON/PLA/STR）仅用户显式提意见触发——这里即用户通道，直接放行；
    // 主力档（RES/LEG）归档即自动入池出审（adjourn 侧执行），本方法亦可再开.
    const prior = this.reviewOf(row)
    if (prior.state !== 'idle' && prior.state !== 'closed') {
      throw new PcError('REVIEW_STAGE_BLOCKED', `案卷 ${input.docId} 复审已在进行（${prior.state}）：本轮回合内不可重复开启`)
    }
    if (prior.count >= MAX_REVIEW_PER_DOC) {
      throw new PcError('REVIEW_EXHAUSTED', `案卷 ${input.docId} 复审意见已达上限 ${MAX_REVIEW_PER_DOC} 条：后续意见并入既有复审通道（逐条回告义务按已登记意见计）`)
    }
    if (input.text.trim().length === 0) {
      throw new PcError('STRUCTURE_FAIL', '复审意见为空')
    }
    if (input.text.length > MAX_TEXT_CHARS) {
      throw new PcError('WORD_LIMIT', `复审意见 ${input.text.length} 字超硬上限 ${MAX_TEXT_CHARS}`)
    }
    const records = await this.recordsOf(input.docId)
    // 复审意见落板：kind=review，authorName='用户'，标注代录来源（与监督意见同纪律）.
    const seq = this.nextSeq(records, record => record.kind === 'review')
    await this.putRecord({
      id: buildRecordId({ docId: input.docId, kind: 'review', stage: 'review', authorName: '用户', seq }),
      docId: input.docId,
      kind: 'review',
      stage: 'review',
      seat: 'chair',
      authorName: '用户',
      authorSessionId: actorSessionId,
      text: input.text,
      at: Date.now(),
    })
    // 状态机：idle → filed（登记）→ accepted（受理通过）→ reviewing（派发审查替身）.
    const flag: ReviewFlag = this.reviewFlagOf(row, records)
    const priority = reviewPriority(REVIEW_TIERS[row.type], flag)
    const view = await this.advanceReview(input.docId, review => {
      review.state = 'filed'
      review.flag = flag
      review.count = prior.count + 1
      review.priority = priority
      // 受理检查（机械，零 AI）：有效意见已落板 ⇒ 直接 accepted.
      review.state = 'accepted'
    })
    if (this.spawner !== undefined) {
      const fresh = await this.meetingOrThrow(input.docId)
      void this.spawner.spawnReviewer(input.docId, await this.buildReviewPackage(fresh))
    }
    const done = await this.advanceReview(input.docId, review => { review.state = 'reviewing' })
    return { pc: 'meeting', meeting: done }
  }

  /** 从会议行与记录推导协议降级标记（ADR-0010）：征询采信（决议文本标注）/ 验收 skip. */
  private reviewFlagOf(row: MeetingRow, records: readonly RecordRow[]): ReviewFlag {
    const consultive = records.some(record =>
      record.kind === 'resolution' && /征询采信|未达法定状态/.test(record.text))
    if (consultive) return 'consultive'
    if (row.validation === 'skip') return 'skip-validation'
    return 'none'
  }

  /**
 * 判定异议方名单（ADR-0010 Q12）：记录流里投过**反对票**的成员名集合.
 * 质询是 npc 审查方的流程内工作（R2 强制各提至少 1 个），不构成异议表达；
 * 异议方的现实语义＝明确反对决议的成员——只有反对票是机械可判的「提出异议」.
 */
  private dissentingNames(row: MeetingRow, records: readonly RecordRow[]): readonly string[] {
    return [...row.cppccNames, ...row.npcNames].filter(name => {
      const byName = records.filter(record => record.authorName === name)
      return byName.some(record => record.kind === 'vote' && record.stance === '反对')
    })
  }

  /**
   * 审查替身直写审查意见（ADR-0010 Q6/Q7：不经主持人代录）。
   * 只装给 `pc-reviewer` preset 的替身会话；服务层校验 authorName 约定.
   * @param actorSessionId - 审查替身会话 id（审计字段）.
   * @param input - 文号、审查结论（维持/建议修订/建议解释/建议驳回）与逐条处置清单.
   */
  async reviewVerdict(actorSessionId: string, input: { readonly docId: string; readonly verdict: string; readonly disposal: string }): Promise<PcFact> {
    const row = await this.meetingOrThrow(input.docId)
    const state = this.reviewOf(row).state
    if (state !== 'reviewing' && state !== 'accepted') {
      throw new PcError('REVIEW_STAGE_BLOCKED', `案卷 ${input.docId} 当前复审状态为 ${state}，不在审查阶段（③ reviewing）——审查替身只在该阶段直写审查意见`)
    }
    if (input.verdict.trim().length === 0) throw new PcError('STRUCTURE_FAIL', '审查意见为空')
    if (input.verdict.length > REVIEW_OPINION_LIMIT) {
      throw new PcError('WORD_LIMIT', `审查意见 ${input.verdict.length} 字超 ${REVIEW_OPINION_LIMIT} 上限：压缩后重提`)
    }
    const records = await this.recordsOf(input.docId)
    const seq = this.nextSeq(records, record => record.kind === 'review' && record.authorName === '审查主体')
    await this.putRecord({
      id: buildRecordId({ docId: input.docId, kind: 'review', stage: 'review', authorName: '审查主体', seq }),
      docId: input.docId,
      kind: 'review',
      stage: 'review',
      seat: 'chair',
      authorName: '审查主体',
      authorSessionId: actorSessionId,
      text: `【审查意见】${input.verdict}\n【处置清单】${input.disposal}`,
      at: Date.now(),
    })
    // 审查意见已落板：有异议方→进 hearing（被动陈述窗口）；无→直接 decidable（呈用户三选）.
    const dissenting = this.dissentingNames(row, records)
    const next: ReviewState = dissenting.length > 0 ? 'hearing' : 'decidable'
    const view = await this.advanceReview(input.docId, review => { review.state = next })
    if (next === 'decidable') {
      // 无异议方：审查意见即呈报用户——由主持人按呈现动作推进（工具侧呈现），这里标记可裁.
    }
    return { pc: 'meeting', meeting: view }
  }

  /**
   * 异议方公民被动陈述（ADR-0010 Q12/Q13）：复审已触发时，保留会话的异议方
   * 以其原身份在 hearing 阶段陈述原异议论据；不主动开路、不参与裁量.
   * @param actorSessionId - 异议方会话 id（审计字段）.
   * @param input - 文号与陈述文本.
   */
  async reviewStatement(actorSessionId: string, input: { readonly docId: string; readonly name: string; readonly text: string }): Promise<PcFact> {
    const row = await this.meetingOrThrow(input.docId)
    const state = this.reviewOf(row).state
    if (state !== 'hearing') {
      throw new PcError('REVIEW_STAGE_BLOCKED', `案卷 ${input.docId} 当前复审状态为 ${state}，不在沟通纠正阶段（④ hearing）——异议方陈述只在该窗口受理`)
    }
    const records = await this.recordsOf(input.docId)
    const dissenting = this.dissentingNames(row, records)
    if (!dissenting.includes(input.name)) {
      throw new PcError('SEAT_FORBIDDEN', `「${input.name}」不在异议方名单（${dissenting.join('、') || '无'}）：只有原会议中提出过异议的成员可作被动陈述`)
    }
    if (input.text.trim().length === 0) throw new PcError('STRUCTURE_FAIL', '陈述为空')
    if (input.text.length > WORD_LIMITS.opinion) {
      throw new PcError('WORD_LIMIT', `异议方陈述 ${input.text.length} 字超 ${WORD_LIMITS.opinion} 上限：压缩后重提`)
    }
    const already = records.some(record =>
      record.kind === 'review' && record.authorName === input.name && record.stage === 'hearing')
    if (already) throw new PcError('ALREADY_RECORDED', `「${input.name}」已作异议方陈述；如需补充请由主持人代录`)
    const seq = this.nextSeq(records, record => record.kind === 'review' && record.stage === 'hearing')
    await this.putRecord({
      id: buildRecordId({ docId: input.docId, kind: 'review', stage: 'hearing', authorName: input.name, seq }),
      docId: input.docId,
      kind: 'review',
      stage: 'hearing',
      seat: 'chair',
      authorName: input.name,
      authorSessionId: actorSessionId,
      text: `【异议方陈述】${input.text}`,
      at: Date.now(),
    })
    // 收窗判定：全部异议方已陈述 → 呈用户三选（decidable）.
    const stated = new Set(records
      .filter(record => record.kind === 'review' && record.stage === 'hearing')
      .map(record => record.authorName))
    const pending = dissenting.filter(name => !stated.has(name))
    const next: ReviewState = pending.length > 0 ? 'hearing' : 'decidable'
    const view = await this.advanceReview(input.docId, review => { review.state = next })
    return { pc: 'meeting', meeting: view }
  }

  /**
   * 主持人（用户授意）结束听证窗口：异议方未能全部陈述时给收窗逃生门
   * （宿主未唤醒异议方/异议方永久缺席）。程序性动作，不替代用户三选.
   * @param docId - 文号.
   */
  async reviewCloseHearing(docId: string): Promise<PcFact> {
    const row = await this.meetingOrThrow(docId)
    const state = this.reviewOf(row).state
    if (state !== 'hearing') {
      throw new PcError('REVIEW_STAGE_BLOCKED', `案卷 ${docId} 不在沟通纠正阶段（${state}），无听证可收`)
    }
    const view = await this.advanceReview(docId, review => { review.state = 'decidable' })
    return { pc: 'meeting', meeting: view }
  }

  /**
   * 用户出口三选（ADR-0010 Q10/Q16）：修订重议／解释性决议／驳回并说明.
   * 审查替身出建议性审查意见后呈用户；最终通过/修订永远由用户决定.
   * @param actorSessionId - 用户/主持人会话 id（审计字段）.
   * @param input - 文号与三选值.
   */
  async reviewAdjudicate(actorSessionId: string, input: {
    readonly docId: string
    readonly choice: 'revise' | 'interpret' | 'dismiss'
    /** dismiss（驳回）时的逐条说明；revise/interpret 可为空. */
    readonly note?: string
  }): Promise<PcFact> {
    const row = await this.meetingOrThrow(input.docId)
    const state = this.reviewOf(row).state
    if (state !== 'decidable') {
      throw new PcError('REVIEW_STAGE_BLOCKED', `案卷 ${input.docId} 当前复审状态为 ${state}，不在决议出口（⑤ decidable）——先有审查意见并呈报用户后方可三选`)
    }
    if (!['revise', 'interpret', 'dismiss'].includes(input.choice)) {
      throw new PcError('REVIEW_CHOICE_INVALID', `出口三选只接受 revise（修订重议）/ interpret（解释性决议）/ dismiss（驳回并说明）；收到「${String(input.choice)}」`)
    }
    const records = await this.recordsOf(input.docId)
    const dissenting = this.dissentingNames(row, records)
    // 出口裁定落板（kind=review，authorName='用户'，标注三选）.
    const seq = this.nextSeq(records, record => record.kind === 'review' && record.authorName === '用户' && record.stage === 'adjudicate')
    await this.putRecord({
      id: buildRecordId({ docId: input.docId, kind: 'review', stage: 'adjudicate', authorName: '用户', seq }),
      docId: input.docId,
      kind: 'review',
      stage: 'adjudicate',
      seat: 'chair',
      authorName: '用户',
      authorSessionId: actorSessionId,
      text: `【复审出口·${input.choice === 'revise' ? '修订重议' : input.choice === 'interpret' ? '解释性决议' : '驳回并说明'}】${
        input.note !== undefined && input.note.trim().length > 0 ? `\n${input.note}` : ''
      }${dissenting.length > 0 ? `\n【涉异议方】${dissenting.join('、')}` : ''}`,
      at: Date.now(),
    })
    // 落地（Q16）：修订→新卷关联（revisedDocId 由后续 convene 填写，这里置 pending 标记）；
    // 解释→原卷追加解释性 resolution 由主持人按 pc_record 落板（interpretRecordId 后续关联）；
    // 驳回→直接进反馈回告.
    const view = await this.advanceReview(input.docId, review => {
      review.choice = input.choice
      review.state = 'feedback'
    })
    return { pc: 'meeting', meeting: view }
  }

  /**
   * 登记复审出口的落地关联（ADR-0010 Q16）：修订→新案卷号；解释→解释性 resolution 记录 id.
   * 由主持人（用户授意）在 convene 新卷/落解释决议后调用，补全落地关联字段.
   * @param docId - 被复审案卷号.
   * @param input - 关联字段.
   */
  async reviewLinkLanding(docId: string, input: { readonly revisedDocId?: string; readonly interpretRecordId?: string }): Promise<PcFact> {
    const row = await this.meetingOrThrow(docId)
    if ((input.revisedDocId === undefined) === (input.interpretRecordId === undefined)) {
      throw new PcError('REVIEW_CHOICE_INVALID', '落地关联只能填其一：修订→revisedDocId；解释→interpretRecordId')
    }
    if (input.revisedDocId !== undefined) {
      const revised = await this.meetingOrThrow(input.revisedDocId)
      if (!revised.docId.startsWith('PC-')) throw new PcError('BAD_DOCUMENT_ID', '修订案卷号非法')
    }
    const view = await this.advanceReview(docId, review => {
      if (input.revisedDocId !== undefined) review.revisedDocId = input.revisedDocId
      if (input.interpretRecordId !== undefined) review.interpretRecordId = input.interpretRecordId
    })
    return { pc: 'meeting', meeting: view }
  }

  /**
   * 逐条回告落板（ADR-0010 Q5-C/§113）：每条复审意见关联处置结论与回告文本.
   * 回告齐备（≥ 已登记意见条数）后复审闭环（closed）.
   * @param actorSessionId - 主持人会话 id（审计字段；回告由主持人按决议/审查意见撰写）.
   * @param input - 文号与回告文本（可多条分批，按条累计）.
   */
  async reviewReply(actorSessionId: string, input: { readonly docId: string; readonly text: string }): Promise<PcFact> {
    const row = await this.meetingOrThrow(input.docId)
    const current = this.reviewOf(row)
    if (current.state !== 'feedback' && current.state !== 'decidable') {
      throw new PcError('REVIEW_STAGE_BLOCKED', `案卷 ${input.docId} 当前复审状态为 ${current.state}，不在反馈回告阶段（⑥ feedback）——回告在出口裁定后落板`)
    }
    if (input.text.trim().length === 0) throw new PcError('STRUCTURE_FAIL', '回告文本为空')
    if (input.text.length > MAX_TEXT_CHARS) {
      throw new PcError('WORD_LIMIT', `回告文本 ${input.text.length} 字超硬上限 ${MAX_TEXT_CHARS}`)
    }
    const records = await this.recordsOf(input.docId)
    const seq = this.nextSeq(records, record => record.kind === 'review-reply')
    await this.putRecord({
      id: buildRecordId({ docId: input.docId, kind: 'review-reply', stage: 'review', authorName: '主持人', seq }),
      docId: input.docId,
      kind: 'review-reply',
      stage: 'review',
      seat: 'chair',
      authorName: '主持人',
      authorSessionId: actorSessionId,
      text: input.text,
      at: Date.now(),
    })
    // 回告齐备判定：review-reply 条数 ≥ 已登记复审意见条数 → 闭环.
    // seq 即本次回告落板后的累计条数（nextSeq 在 putRecord 前基于旧记录计算）.
    const replies = seq
    const target = current.count
    const next: ReviewState = replies >= target ? 'closed' : 'feedback'
    const view = await this.advanceReview(input.docId, review => { review.state = next })
    return { pc: 'meeting', meeting: view }
  }

  // —— 主持人操作 ——

  /**
   * 建会：分配文号、初始化阶段机、落库.
   * @param _actorSessionId - 主持人会话 id（预留：建会审计字段，当前版本未落库）.
   * @param request - 建会参数.
   */
  async convene(_actorSessionId: string, request: ConveneRequest): Promise<PcFact> {
    if (!(Object.keys(STAGE_FLOWS) as MeetingType[]).includes(request.type)) {
      throw new PcError('BAD_DOCUMENT_ID', `未知会议类型 ${String(request.type)}`)
    }
    const tier = request.tier ?? 'medium'
    const validation = request.validation ?? defaultValidation(request.type)
    const expected = TIER_ROSTER[tier]
    const cppccNames = [...new Set(request.cppccNames)]
    const npcNames = [...new Set(request.npcNames)]
    if (cppccNames.length !== expected.cppcc || npcNames.length !== expected.npc) {
      throw new PcError('ROSTER_MISMATCH', `${tier} 档编制为 cppcc ${expected.cppcc} 名 + npc ${expected.npc} 名，实际给了 cppcc ${cppccNames.length} + npc ${npcNames.length}；按档补齐或换档`)
    }
    if (cppccNames.some(name => npcNames.includes(name))) {
      throw new PcError('ROSTER_MISMATCH', '同一人名不得同时出现在 cppcc 与 npc 名单（协商方与审查方必须分离）')
    }
    const meetings = (await this.domain()).table('meetings')
    const year = new Date().getFullYear()
    let seq = 0
    for (const [, existing] of meetings.entries()) {
      const parsedExisting = parseDocumentId(existing.docId)
      if (parsedExisting !== undefined && parsedExisting.type === request.type && parsedExisting.year === year) {
        seq = Math.max(seq, parsedExisting.seq)
      }
    }
    const docId = `PC-${request.type}〔${year}〕${String(seq + 1).padStart(3, '0')}号`
    const flow = STAGE_FLOWS[request.type]
    const row: MeetingRow = {
      docId,
      type: request.type,
      tier,
      validation,
      topic: request.topic.slice(0, 200),
      status: 'open',
      cppccNames,
      npcNames,
      stages: flow.map((def, index) => index === 0
        ? { id: def.id, state: 'active', ...(def.deliberative ? { round: 1 } : {}) }
        : { id: def.id, state: 'pending' }),
      createdAt: Date.now(),
    }
    await meetings.put(docId, row)
    return { pc: 'meeting', meeting: toMeetingView(row) }
  }

  /**
   * 推进阶段机（原子读改写：并发提交与推进不会丢状态）.
   * @param docId - 文号.
   * @param action - `advance`=进入下一阶段（当前阶段置 done）；`round`=当前回路阶段开启新一轮（三审制计数）.
   */
  async stage(docId: string, action: 'advance' | 'round'): Promise<PcFact> {
    const meetings = (await this.domain()).table('meetings')
    const snapshot = await this.meetingOrThrow(docId)
    if (action === 'advance') {
      // 三形态裁定门（ADR-0003）：离开裁定门阶段前必须已有 ruling 锚点.
      const currentIndex = snapshot.stages.findIndex(stage => stage.state === 'active')
      if (currentIndex >= 0) {
        const currentDef = STAGE_FLOWS[snapshot.type][currentIndex]
        if ((RULING_GATED_STAGES[snapshot.type] ?? []).includes(currentDef.id)) {
          const gatedRound = snapshot.stages[currentIndex].round ?? 1
          const hasRuling = (await this.recordsOf(docId)).some(record =>
            record.kind === 'ruling' && record.stage === currentDef.id && record.round === gatedRound)
          if (!hasRuling) {
            throw new PcError('RULING_REQUIRED',
              `「${currentDef.label}」是三形态裁定门：先以 pc_record 登记 ruling 裁定（原则通过／退回修改附意见清单／暂不讨论），才可推进进入终审`)
          }
        }
      }
    }
    let fact!: PcFact
    await meetings.update(docId, row => {
      this.assertOpen(row)
      const flow = STAGE_FLOWS[row.type]
      const currentIndex = row.stages.findIndex(stage => stage.state === 'active')
      if (currentIndex < 0) throw new PcError('BAD_STAGE', `会议 ${docId} 无活动阶段，状态异常`)
      if (action === 'advance') {
        if (currentIndex >= flow.length - 1) {
          throw new PcError('BAD_STAGE', `「${flow[currentIndex].label}」已是末阶段：全部阶段完成后用 pc_adjourn 归档散会`)
        }
        const nextDef = flow[currentIndex + 1]
        row.stages[currentIndex] = { ...row.stages[currentIndex], state: 'done' }
        row.stages[currentIndex + 1] = nextDef.deliberative
          ? { id: nextDef.id, state: 'active', round: 1 }
          : { id: nextDef.id, state: 'active' }
      } else {
        const def = flow[currentIndex]
        if (!def.deliberative) {
          throw new PcError('NOT_DELIBERATIVE', `「${def.label}」非协商回路阶段，无轮次可言；打回重议只发生在 ⭐ 阶段`)
        }
        const currentRound = row.stages[currentIndex].round ?? 1
        if (currentRound >= MAX_ROUNDS_PER_STAGE) {
          throw new PcError('ROUND_EXHAUSTED', `「${def.label}」已满 ${MAX_ROUNDS_PER_STAGE} 轮（三审制上限）：提取反对焦点后应终止议题或降级为征询意见存档，不再开新一轮`)
        }
        row.stages[currentIndex] = { ...row.stages[currentIndex], round: currentRound + 1 }
      }
      fact = { pc: 'meeting', meeting: toMeetingView(row) }
      return row
    })
    return fact
  }

  /**
   * 主持人登记锚点产物（agenda/issue/digest/draft/focus/resolution）.
   * @param actorSessionId - 主持人会话 id.
   * @param input - 登记内容.
   */
  async chairRecord(actorSessionId: string, input: {
    readonly docId: string
    readonly kind: RecordKind
    readonly text: string
    readonly stage?: string
  }): Promise<PcFact> {
    if (!CHAIR_KINDS.includes(input.kind)) {
      throw new PcError('SEAT_FORBIDDEN', `pc_record 只接受主持人锚点产物：${CHAIR_KINDS.join('/')}；成员产物请走各自通道`)
    }
    const row = await this.meetingOrThrow(input.docId)
    this.assertOpen(row)
    const stageId = input.stage ?? row.stages.find(stage => stage.state === 'active')?.id
    if (stageId === undefined || row.stages.every(stage => stage.id !== stageId)) {
      throw new PcError('BAD_STAGE', `阶段 ${String(input.stage)} 不在会议 ${row.docId} 的阶段表中`)
    }
    if (input.text.length > MAX_TEXT_CHARS) {
      throw new PcError('WORD_LIMIT', `登记文本 ${input.text.length} 字超硬上限 ${MAX_TEXT_CHARS}；请压缩为摘要`)
    }
    const priorRecords = await this.recordsOf(input.docId)
    const seq = this.nextSeq(priorRecords, record => record.kind === input.kind && record.stage === stageId && record.authorName === '主持人')
    // 裁定等回路锚点必须带轮次戳，供阶段门禁按 stage+round 精确核验.
    const stageRound = row.stages.find(stage => stage.id === stageId)?.round
    const record = await this.putRecord({
      id: buildRecordId({ docId: input.docId, kind: input.kind, stage: stageId, ...(stageRound !== undefined ? { round: stageRound } : {}), authorName: '主持人', seq }),
      docId: input.docId,
      kind: input.kind,
      stage: stageId,
      ...(stageRound !== undefined ? { round: stageRound } : {}),
      seat: 'chair',
      authorName: '主持人',
      authorSessionId: actorSessionId,
      text: input.text,
      at: Date.now(),
    })
    return { pc: 'record', record }
  }

  /**
   * 用户监督替身提交监督意见（ADR-0009 二阶段）：用户缺席且未作任何回应输入时，
   * 主持人经底座以专用 preset（`pc-supervisor-standin`）spawn 替身，替身以本方法
   * 在本轮 ⭐ 阶段登记一条监督意见（标注「代·替身」），不算票、不替代成员产物
   * 前置门计数；用户回来自动获得追认/撤回权（对替身意见的消息即为撤销依据）.
   * @param actorSessionId - 替身会话 id（审计字段）.
   * @param input - 文号与监督意见.
   */
  async superviseStandin(actorSessionId: string, input: { readonly docId: string; readonly text: string }): Promise<PcFact> {
    const row = await this.meetingOrThrow(input.docId)
    this.assertOpen(row)
    const flow = STAGE_FLOWS[row.type]
    const activeIndex = row.stages.findIndex(stage => stage.state === 'active')
    const activeStage = row.stages[activeIndex]
    if (activeStage === undefined || !flow[activeIndex].deliberative) {
      throw new PcError('NOT_DELIBERATIVE', `会议 ${input.docId} 当前不在协商回路阶段（⭐），不收监督意见（二阶段替身监督只发生在 ⭐ 阶段）`)
    }
    if (input.text.trim().length === 0) {
      throw new PcError('STRUCTURE_FAIL', '监督意见为空')
    }
    if (input.text.length > WORD_LIMITS.opinion) {
      throw new PcError('WORD_LIMIT', `替身监督意见 ${input.text.length} 字超 ${WORD_LIMITS.opinion} 字上限：压缩后重提`)
    }
    const round = activeStage.round ?? 1
    const priorRecords = await this.recordsOf(input.docId)
    const exists = priorRecords.some(record =>
      record.kind === 'supervision' && record.stage === activeStage.id && record.round === round && record.authorName === '用户替身')
    if (exists) {
      throw new PcError('ALREADY_RECORDED', `本轮（r${round}）用户替身已提交监督意见；如需补充请主持人代录或等下一轮`)
    }
    const seq = this.nextSeq(priorRecords, record => record.kind === 'supervision' && record.stage === activeStage.id)
    const record = await this.putRecord({
      id: buildRecordId({ docId: input.docId, kind: 'supervision', stage: activeStage.id, round, authorName: '用户替身', seq }),
      docId: input.docId,
      kind: 'supervision',
      stage: activeStage.id,
      round,
      seat: 'chair',
      authorName: '用户替身',
      authorSessionId: actorSessionId,
      text: `【代·替身】${input.text}`,
      at: Date.now(),
    })
    return { pc: 'record', record }
  }

  /**
   * 席位认证重绑（ADR-0007）：成员代理断线重启后，主持人核实身份并把该名字的
   * 绑定转移到当前新会话；写 rebind 锚点留痕，此后旧会话同名提交被拒.
   * @param actorSessionId - 发起重绑的主持人会话 id（审计字段）.
   * @param input - 文号与要重绑的成员名.
   */
  async rebind(actorSessionId: string, input: { readonly docId: string; readonly name: string }): Promise<PcFact> {
    const row = await this.meetingOrThrow(input.docId)
    this.assertOpen(row)
    const isCppcc = row.cppccNames.includes(input.name)
    if (!isCppcc && !row.npcNames.includes(input.name)) {
      throw new PcError('SEAT_FORBIDDEN', `「${input.name}」不在本场会议名册内：重绑只针对在册席位`)
    }
    const priorRecords = await this.recordsOf(input.docId)
    const stageId = row.stages.find(stage => stage.state === 'active')?.id ?? row.stages[0].id
    const relevant = priorRecords.filter(record => record.authorName === input.name)
    const previous = [...relevant].reverse().find(record => record.kind === 'rebind') ?? relevant[0]
    const seq = this.nextSeq(priorRecords, record => record.kind === 'rebind' && record.authorName === input.name)
    const record = await this.putRecord({
      id: buildRecordId({ docId: input.docId, kind: 'rebind', stage: stageId, authorName: input.name, seq }),
      docId: input.docId,
      kind: 'rebind',
      stage: stageId,
      seat: isCppcc ? 'cppcc' : 'npc',
      authorName: input.name,
      authorSessionId: actorSessionId,
      text: previous !== undefined
        ? `席位认证解锚：「${input.name}」的原绑定（会话 ${previous.authorSessionId}）经主持人核实断线重启后作废，待其新会话首次提交即接管席位`
        : `席位认证解锚：「${input.name}」的绑定清空（主持人发起），首个以该名提交的会话接管`,
      at: Date.now(),
    })
    return { pc: 'record', record }
  }

  // —— 成员操作 ——

  /**
   * 成员提交文书（意见书/质询/答辩），当场执行 M4 硬项与字限.
   * @param actorSessionId - 提交方会话 id.
   * @param input - 提交内容.
   */
  async submit(actorSessionId: string, input: {
    readonly docId: string
    readonly name: string
    readonly kind: 'opinion' | 'inquiry' | 'reply'
    readonly text: string
  }): Promise<PcFact> {
    const row = await this.meetingOrThrow(input.docId)
    this.assertOpen(row)
    const flow = STAGE_FLOWS[row.type]
    const activeIndex = row.stages.findIndex(stage => stage.state === 'active')
    const activeStage = row.stages[activeIndex]
    if (activeStage === undefined || !flow[activeIndex].deliberative) {
      throw new PcError('NOT_DELIBERATIVE', `会议 ${input.docId} 当前不在协商回路阶段（⭐），不收成员产物；当前阶段见会议视图`)
    }
    const seat = MEMBER_KIND_SEATS[input.kind]
    if (seat === undefined) throw new PcError('SEAT_FORBIDDEN', `pc_submit 不接受 ${input.kind}`)
    const priorRecords = await this.recordsOf(input.docId)
    this.bindSeat(row, seat, input.name, actorSessionId, priorRecords)
    const limit = input.kind === 'opinion' ? WORD_LIMITS.opinion : input.kind === 'inquiry' ? WORD_LIMITS.inquiry : WORD_LIMITS.reply
    if (input.text.length > limit) {
      throw new PcError('WORD_LIMIT', `${kindLabel(input.kind)} ${input.text.length} 字，超 ${limit} 字上限：退回重提（压缩后重新调用，原稿未入库不留痕）`)
    }
    if (input.text.trim().length === 0) {
      throw new PcError('STRUCTURE_FAIL', '提交内容为空')
    }
    const round = activeStage.round ?? 1
    let verdict: 'admitted' | 'rejected' | undefined
    let reason: string | undefined
    if (input.kind === 'opinion') {
      if (!hasOpinionStructure(input.text)) {
        throw new PcError('STRUCTURE_FAIL', '准入审查（M4）不通过：意见书须一事一案，「有情况/分析」且「有具体建议」（含相应表述段落）；补齐结构后重提')
      }
      const already = priorRecords.some(record =>
        record.kind === 'opinion' && record.stage === activeStage.id && record.round === round
        && record.authorName === input.name && record.verdict === 'admitted')
      if (already) {
        throw new PcError('ALREADY_RECORDED', `本轮（r${round}）你方意见书已收录在案：一事一案，如需补充请等下一轮打回重议时再提`)
      }
      verdict = 'admitted'
    }
    const seq = this.nextSeq(priorRecords, record => record.kind === input.kind && record.stage === activeStage.id && record.authorName === input.name)
    const record = await this.putRecord({
      id: buildRecordId({ docId: input.docId, kind: input.kind, stage: activeStage.id, round, authorName: input.name, seq }),
      docId: input.docId,
      kind: input.kind,
      stage: activeStage.id,
      round,
      seat,
      authorName: input.name,
      authorSessionId: actorSessionId,
      text: input.text,
      ...(verdict !== undefined ? { verdict } : {}),
      ...(reason !== undefined ? { reason } : {}),
      at: Date.now(),
    })
    return { pc: 'record', record }
  }

  /**
   * 成员投票（npc 专属）：执行表决前置门与重复票防护.
   * @param actorSessionId - 投票方会话 id.
   * @param input - 选票.
   */
  async vote(actorSessionId: string, input: {
    readonly docId: string
    readonly name: string
    readonly stance: '赞成' | '反对' | '弃权'
    readonly reason: string
  }): Promise<PcFact> {
    const row = await this.meetingOrThrow(input.docId)
    this.assertOpen(row)
    const activeStage = row.stages.find(stage => stage.state === 'active')
    if (activeStage === undefined || !VOTE_STAGES[row.type].includes(activeStage.id)) {
      throw new PcError('VOTE_STAGE_ONLY', `会议 ${input.docId} 当前阶段不可付表决（表决只发生在：${VOTE_STAGES[row.type].join('/')}）`)
    }
    const priorRecords = await this.recordsOf(input.docId)
    this.bindSeat(row, 'npc', input.name, actorSessionId, priorRecords)
    // 立场集按会议类型切换：MIN=确证书两态，其余=选票三态（ADR-0002）.
    const allowedStances = stancesFor(row.type)
    if (!allowedStances.includes(input.stance)) {
      throw new PcError('STANCE_INVALID', `${row.type} 类会议的立场只允许：${allowedStances.join('/')}；收到「${input.stance}」`)
    }
    if (input.reason.length > WORD_LIMITS.voteReason) {
      throw new PcError('WORD_LIMIT', `选票理由 ${input.reason.length} 字超 ${WORD_LIMITS.voteReason} 字上限`)
    }
    const round = activeStage.round ?? 1
    if (row.type !== 'MIN') {
      if (priorRecords.some(record =>
        record.kind === 'vote' && record.stage === activeStage.id && record.round === round && record.authorName === input.name)) {
        throw new PcError('DUPLICATE_VOTE', `「${input.name}」本轮（r${round}）已投过票；一人一票不可更改`)
      }
      // 前置门（红线2）；若本收敛点紧随裁定门阶段，上游审议已蒸馏为 ruling，视为已满足.
      const currentIndex = row.stages.indexOf(activeStage)
      const previousDefinition = currentIndex > 0 ? STAGE_FLOWS[row.type][currentIndex - 1] : undefined
      const rulingWaived = previousDefinition !== undefined
        && (RULING_GATED_STAGES[row.type] ?? []).includes(previousDefinition.id)
      if (!rulingWaived) {
        const stageRoundRecords = priorRecords.filter(record => record.stage === activeStage.id && record.round === round)
        const hasOpinion = stageRoundRecords.some(record => record.kind === 'opinion' && record.verdict === 'admitted')
        const hasInquiry = stageRoundRecords.some(record => record.kind === 'inquiry')
        if (!hasOpinion || !hasInquiry) {
          throw new PcError('PRE_VOTE_GATE',
            `表决前置门未过（红线2）：本阶段须先有已收录的意见书${hasOpinion ? '' : '（缺意见书）'}与书面质询${hasInquiry ? '' : '（缺质询）'}；`
            + '请主持人先完成 R1 陈述与 R2 质询再发起投票')
        }
      }
    } else if (priorRecords.some(record =>
      record.kind === 'vote' && record.stage === activeStage.id && record.round === round && record.authorName === input.name)) {
      throw new PcError('DUPLICATE_VOTE', `「${input.name}」本轮（r${round}）已提交过确证书；如需改口请待主持人重新发起确证`)
    }
    const record = await this.putRecord({
      id: buildRecordId({ docId: input.docId, kind: 'vote', stage: activeStage.id, round, authorName: input.name, seq: 1 }),
      docId: input.docId,
      kind: 'vote',
      stage: activeStage.id,
      round,
      seat: 'npc',
      authorName: input.name,
      authorSessionId: actorSessionId,
      text: `【投票】${input.stance}\n【理由】${input.reason}`,
      stance: input.stance,
      at: Date.now(),
    })
    return { pc: 'record', record }
  }

  /**
   * 机械计票（M1）：汇总本轮选票、验应答率、套公式，结果落库.
   * @param docId - 文号.
   */
  async tally(docId: string): Promise<PcFact> {
    const row = await this.meetingOrThrow(docId)
    this.assertOpen(row)
    const activeStage = row.stages.find(stage => stage.state === 'active')
    if (activeStage === undefined || !VOTE_STAGES[row.type].includes(activeStage.id)) {
      throw new PcError('VOTE_STAGE_ONLY', `当前阶段不在表决环节（可表决阶段：${VOTE_STAGES[row.type].join('/')}）`)
    }
    const tallies = (await this.domain()).table('tallies')
    const round = activeStage.round ?? 1
    const key = tallyKey(docId, activeStage.id, round)
    if (tallies.get(key) !== undefined) {
      throw new PcError('ALREADY_RECORDED', `本轮（${activeStage.id} r${round}）已完成计票：未通过时请提炼反对焦点（pc_record focus）后用 pc_stage round 开新一轮`)
    }
    // 监督窗口双门（ADR-0008/0009）：仅在计票阶段 ⭐（征意回路）时生效；
    // MIN 确证豁免（其 ⭐ confirm 是核验语义的更正循环，非征意审议——不侵蚀
    // 轻量确证通道）；LEG 公布批准非 ⭐ 亦不在其列.
    const votingStageDef = STAGE_FLOWS[row.type].find(def => def.id === activeStage.id)
    if (votingStageDef !== undefined && votingStageDef.deliberative && row.type !== 'MIN') {
      const records = await this.recordsOf(docId)
      // 门一：关窗预告——拟计票前须先有 warning 记录，关窗由瞬时事件变为可预示事件.
      const hasWarning = records.some(record =>
        record.kind === 'warning' && record.stage === activeStage.id && record.round === round)
      if (!hasWarning) {
        throw new PcError('WARNING_REQUIRED',
          `拟对「${activeStage.id} r${round}」计票前须先向用户发出关窗预告：pc_record kind=warning 登记本阶段拟计票通报（此拍内用户仍可提监督质疑）`)
      }
      // 门二：监督应答——关窗前必须已有监督记录（本人意见/明示放弃/替身意见）.
      const hasSupervision = records.some(record =>
        record.kind === 'supervision' && record.stage === activeStage.id && record.round === round)
      if (!hasSupervision) {
        // Q8-B（ADR-0010 第 9 节）：用户缺席（无 supervision 记录）且计票受阻——
        // 服务层当场自动派发监督替身（seed 空、setup 硬编码，不经 AI），替身异步
        // 直写意见后再次计票放行；本人正常回应时永不抢答.
        if (this.supervisorSpawner !== undefined) {
          void this.supervisorSpawner.spawnSupervisor(docId, activeStage.id, round)
        }
        throw new PcError('SUPERVISION_PENDING',
          `用户监督窗口未收束（r${round}）：用户在场→代录其监督意见或明示放弃（pc_record kind=supervision）；`
          + '用户缺席→监督替身已自动派发（ADR-0010），待其以 pc_supervise 提交意见后重试计票'
          + (this.supervisorSpawner === undefined ? '（当前环境未装配替身派发，请代录用户意见或明示放弃）' : ''))
      }
    }
    const votes = (await this.recordsOf(docId))
      .filter(record => record.kind === 'vote' && record.stage === activeStage.id && record.round === round)
    if (votes.length === 0) throw new PcError('TALLY_EMPTY', '本轮尚无任何选票：先由 npc 成员逐一点名投票')
    const result = mechanicalTally(
      votes.map(record => ({
        // 结构化立场优先；旧数据回退到文本首行解析（仅选票三态，MIN 确证书无旧数据）.
        stance: record.stance
          ?? (/^【投票】赞成/.test(record.text) ? '赞成' : /^【投票】反对/.test(record.text) ? '反对' : '弃权'),
      })),
      row.npcNames.length,
      passRuleFor(row.type, activeStage.id, row.validation),
    )
    const tallyRow: TallyRow = {
      docId,
      stage: activeStage.id,
      round,
      aye: result.aye,
      nay: result.nay,
      abstain: result.abstain,
      rosterSize: result.rosterSize,
      responded: result.responded,
      mode: result.mode,
      passed: result.passed,
      rule: result.rule,
      at: Date.now(),
    }
    await tallies.put(key, tallyRow)
    // 征询模式（mode==='consultive'）：该轮不构成表决（ADR-0004）；出口＝主持人呈报用户三选裁定，引擎不加门禁.
    return { pc: 'tally', tally: toTallyView(tallyRow) }
  }

  /**
   * 散会归档（红线8：全部阶段完成且已有决议锚点方可归档；搁置终止随时可宣布）.
   * 决议检查先行于任何状态变更；阶段收尾走原子读改写.
   * @param docId - 文号.
   * @param options - terminate=true 为搁置终止（附原因）.
   */
  async adjourn(docId: string, options: { readonly terminate?: boolean; readonly reason?: string } = {}): Promise<PcFact> {
    const row = await this.meetingOrThrow(docId)
    this.assertOpen(row)
    if (options.terminate !== true) {
      const records = await this.recordsOf(docId)
      if (!records.some(record => record.kind === 'resolution')) {
        throw new PcError('ADJOURN_BLOCKED', '红线8：未见任何 resolution 锚点记录——先用 pc_record 登记决议/纪要成文，再归档')
      }
    }
    const meetings = (await this.domain()).table('meetings')
    let fact!: PcFact
    await meetings.update(docId, current => {
      this.assertOpen(current)
      if (options.terminate === true) {
        current.status = 'terminated'
        current.closedAt = Date.now()
        fact = { pc: 'meeting', meeting: toMeetingView(current) }
        return current
      }
      const pending = current.stages.filter(stage => stage.state !== 'done')
      const lastIndexOf = current.stages.length - 1
      if (pending.length === 1 && current.stages.indexOf(pending[0]) === lastIndexOf) {
        // 仅剩末阶段在活动：散会即视为完成末段（存档动作本身就是收尾）.
        pending[0].state = 'done'
      } else if (pending.length > 0) {
        throw new PcError('ADJOURN_BLOCKED', `尚有 ${pending.length} 个阶段未完成（${pending.map(stage => stage.id).join('、')}）：走完流程再归档；确要放弃请用 terminate 终止并说明原因`)
      }
      current.status = 'adjourned'
      current.closedAt = Date.now()
      // 有备必审入池（ADR-0010 Q17）：主力档（RES/LEG）归档即自动进入复审待审池——
      // 状态置 filed（登记位点），由后续出审调度推进到 accepted/reviewing.
      if (REVIEW_TIERS[current.type] === 'main' && current.review === undefined) {
        const flag: ReviewFlag = current.validation === 'skip' ? 'skip-validation' : 'none'
        current.review = {
          state: 'filed',
          flag,
          count: 0,
          priority: reviewPriority('main', flag),
        }
      }
      fact = { pc: 'meeting', meeting: toMeetingView(current) }
      return current
    })
    return fact
  }

  /**
   * 读取一场会议的全部视图数据（UI 与公文成文的取数口）.
   * @param docId - 文号.
   */
  async inspect(docId: string): Promise<{
    readonly meeting: PcMeetingView
    readonly records: readonly PcRecordView[]
    readonly tallies: readonly PcTallyView[]
  }> {
    const row = await this.meetingOrThrow(docId)
    const [records, tallies] = await Promise.all([
      this.recordsOf(docId),
      (async () => [...(await this.domain()).table('tallies').entries()].map(([, value]) => value).filter(entry => entry.docId === docId))(),
    ])
    return {
      meeting: toMeetingView(row),
      records: records.map(toRecordView),
      tallies: tallies.map(toTallyView),
    }
  }
}

// —— 视图映射 ——

function toMeetingView(row: MeetingRow): PcMeetingView {
  const flow = STAGE_FLOWS[row.type]
  const members: PcMemberView[] = [
    ...row.cppccNames.map(name => ({ name, seat: 'cppcc' as const })),
    ...row.npcNames.map(name => ({ name, seat: 'npc' as const })),
  ]
  const activeStage = row.stages.find(stage => stage.state === 'active')
  const review = row.review
  return {
    docId: row.docId,
    type: row.type,
    tier: row.tier,
    validation: row.validation,
    topic: row.topic,
    status: row.status,
    members,
    stages: row.stages.map((stage, index) => ({
      id: stage.id,
      label: flow[index].label,
      deliberative: flow[index].deliberative,
      state: stage.state,
      ...(stage.round !== undefined ? { round: stage.round } : {}),
    })),
    ...(activeStage !== undefined ? { currentStage: activeStage.id } : {}),
    ...(review !== undefined ? { review: {
      state: review.state,
      flag: review.flag,
      count: review.count,
      ...(review.choice !== undefined ? { choice: review.choice as 'revise' | 'interpret' | 'dismiss' } : {}),
      ...(review.revisedDocId !== undefined ? { revisedDocId: review.revisedDocId } : {}),
      ...(review.interpretRecordId !== undefined ? { interpretRecordId: review.interpretRecordId } : {}),
      ...(review.priority !== undefined ? { priority: review.priority } : {}),
    } } : {}),
    createdAt: row.createdAt,
    ...(row.closedAt !== undefined ? { closedAt: row.closedAt } : {}),
  }
}

function toRecordView(row: RecordRow): PcRecordView {
  return {
    id: row.id,
    docId: row.docId,
    kind: row.kind,
    stage: row.stage,
    ...(row.round !== undefined ? { round: row.round } : {}),
    seat: row.seat,
    authorName: row.authorName,
    authorSessionId: row.authorSessionId,
    preview: row.text.length > 180 ? row.text.slice(0, 180) + '…' : row.text,
    wordCount: row.text.length,
    ...(row.stance !== undefined ? { stance: row.stance } : {}),
    ...(row.verdict !== undefined ? { verdict: row.verdict } : {}),
    ...(row.reason !== undefined ? { reason: row.reason } : {}),
    at: row.at,
  }
}

function toTallyView(row: TallyRow): PcTallyView {
  return { ...row }
}

function kindLabel(kind: 'opinion' | 'inquiry' | 'reply'): string {
  return kind === 'opinion' ? '意见书' : kind === 'inquiry' ? '质询' : '答辩'
}
