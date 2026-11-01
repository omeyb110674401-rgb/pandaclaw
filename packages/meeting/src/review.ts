/**
 * PandaClaw 复审领域类（模块化 A 阶段：Q2 全量抽取 + Q3 富领域类）.
 *
 * 复审回告闭环（ADR-0010）与执行模型韧性（ADR-0011）的全部业务推导归本类：
 * 待审池状态机、审查替身派发（真实串行 + 失败回滚）、启动恢复、5B 兜底、
 * 出口三选、谱系对称入档、三分类批量。
 *
 * 依赖收敛：只依赖 {@link PandaClawStore}（纯数据访问）与 {@link AgentHost}
 * （底座装配抽象）——不触碰 ctx.agents/tools，底座可替换.
 */

import { buildRecordId } from './domain.ts'
import type { MeetingRow, RecordRow } from './domain.ts'
import { type PcFact, type PcReviewView } from './contract.ts'
import { PcError } from './errors.ts'
import { REVIEWER_PRESET, type AgentHost } from './host.ts'
import {
  MAX_REVIEW_PER_DOC, MAX_TEXT_CHARS, REVIEW_OPINION_LIMIT, REVIEW_TIERS,
  WORD_LIMITS, reviewPriority,
  type ReviewFlag, type ReviewState,
} from './protocol.ts'
import { toMeetingView, type PandaClawStore } from './store.ts'

/** 日志面（recoverReviews 的 Q11 loud 报错用；缺省静默）. */
export interface ReviewLogger {
  error(message: string): void
}

/**
 * 复审领域类.
 * @param store - 领域仓库（纯数据访问）.
 * @param host - 底座装配抽象（替身派发/清理）；缺省＝不派发（纯逻辑/测试环境）.
 * @param options - 可选日志面（Q11 全员失败 loud）.
 */
export class ReviewService {
  private readonly store: PandaClawStore
  private readonly host?: AgentHost
  private readonly logger?: ReviewLogger

  constructor(store: PandaClawStore, host?: AgentHost, options: { readonly logger?: ReviewLogger } = {}) {
    this.store = store
    this.host = host
    this.logger = options.logger
  }

  // —— 私有辅助 ——

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
      ...(review?.originDocId !== undefined ? { originDocId: review.originDocId } : {}),
      ...(review?.sourceReviewNote !== undefined ? { sourceReviewNote: review.sourceReviewNote } : {}),
      ...(review?.priority !== undefined ? { priority: review.priority } : {}),
    }
  }

  /** 从记录推导协议降级标记（ADR-0010 Q4 修正；会议核心归档入池亦单点调用本方法）. */
  reviewFlagOf(records: readonly RecordRow[]): ReviewFlag {
    const consultive = records.some(record =>
      record.kind === 'resolution' && /征询采信|未达法定状态/.test(record.text))
    return consultive ? 'consultive' : 'none'
  }

  /**
   * 构造结构化审查包（ADR-0010 Q9-B）：替身只收代码选取的结构化数据，
   * 决议原文/票况/规约核对——用户意见与监督意见的原始全文零进入.
   * @param row - 被审查会议行.
   * @returns 审查包（setup 注入替身的全部输入）.
   */
  private async buildReviewPackage(row: MeetingRow): Promise<Readonly<Record<string, unknown>>> {
    const [records, tallies] = await Promise.all([
      this.store.records(row.docId),
      this.store.tallies(row.docId),
    ])
    const resolution = records.find(record => record.kind === 'resolution')
    const flag = this.reviewFlagOf(records)
    return {
      docId: row.docId,
      type: row.type,
      validation: row.validation,
      topic: row.topic,
      status: row.status,
      // 降级标记（Q4：唯一 consultive=征询采信）：审查替身识别「留了尾巴」的档案，重点核验采信是否合理.
      reviewFlag: flag,
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
      // 修订谱系（Q14-A）：本卷系修订自哪个原卷＋上轮审查结论摘要——审查焦点＝修订是否消除原问题.
      ...(row.review?.originDocId !== undefined ? { originDocId: row.review.originDocId } : {}),
      ...(row.review?.sourceReviewNote !== undefined ? { sourceReviewNote: row.review.sourceReviewNote } : {}),
      // 解释核验（Q15-A）：本卷此前已有解释性决议——核验解释是否与原决议冲突/引入新问题.
      ...(row.review?.interpretRecordId !== undefined ? { hasInterpretiveResolution: true } : {}),
    }
  }

  /**
   * 单件出审启动（Q3 泵/专项调用，ADR-0011 Q2/Q4）：filed → accepted → reviewing，
   * 并 await 派发审查替身（真串行：成功才推进 reviewing）.
   * 对尚未入池的档案（弱/次级档专项开启，review 字段缺省）先初始化入池再启动；
   * spawn 失败回滚 filed 留池（自动语境静默，用户语境抛错——ADR-0011 Q8-A）.
   * @param docId - 待出审案卷号.
   * @param userInitiated - 用户在场语境（dispatch/request/restart）：失败抛错给发起人.
   * @returns 是否实际出审（非 filed 且推进成功）.
   */
  private async startReview(docId: string, userInitiated = false): Promise<boolean> {
    const row = await this.store.meeting(docId)
    if (row.review !== undefined && row.review.state !== 'filed') return false
    if (row.review === undefined) {
      // 尚未入池（用户在场档专项开启）：CAS 初始化 filed（谓词=当前 idle），flag/priority 按协议计算.
      const records = await this.store.records(docId)
      const flag = this.reviewFlagOf(records)
      const initialized = await this.store.advanceReviewIf(docId, state => state === 'idle', review => {
        review.state = 'filed'
        review.flag = flag
        review.count = 0
        review.priority = reviewPriority(REVIEW_TIERS[row.type], flag)
      })
      if (!initialized) return false
    }
    // filed → accepted（CAS：并发时只有一个胜出）.
    const accepted = await this.store.advanceReviewIf(docId, state => state === 'filed', review => { review.state = 'accepted' })
    if (!accepted) return false
    // await spawn（真串行：前一个创建完成才继续）.
    if (this.host !== undefined) {
      try {
        const fresh = await this.store.meeting(docId)
        await this.host.createStandin('reviewer', docId, {
          preset: REVIEWER_PRESET,
          payload: await this.buildReviewPackage(fresh),
        })
      } catch (error) {
        // 失败回滚 filed 留池 + 系统事件留痕（Q7）；自动语境静默、用户语境抛错（Q8）.
        await this.store.advanceReview(docId, review => { review.state = 'filed' })
        await this.store.recordReviewEvent(docId, `审查替身派发失败，已回滚待审池：${String(error instanceof Error ? error.message : error)}`)
        if (userInitiated) {
          throw new PcError('REVIEW_SPAWN_FAILED', `案卷 ${docId} 出审失败：审查替身未能创建，已回滚待审池，请检查底座装配（pc-reviewer preset）后重试`)
        }
        return false
      }
    }
    // accepted → reviewing（CAS 兜底竞态：理论不可达，静默返回 false）.
    const reviewing = await this.store.advanceReviewIf(docId, state => state === 'accepted', review => { review.state = 'reviewing' })
    return reviewing
  }

  /**
   * 归档位点批量泵（Q3-B）：扫描待审池中全部**主力档**（RES/LEG）filed 案卷，
   * 按 priority 排序（征询采信优先）逐个 spawn 审查替身（串行：前一个创建完成
   * 才创建下一个）；用户在场档（次级/弱）不在泵内，留在池里等用户 request/专项.
   * 会议核心在归档位点单点调用本方法（Q8-A）.
   * @returns 本次泵出的案卷号列表.
   */
  async pumpMainReview(): Promise<readonly string[]> {
    const meetings = await this.store.allMeetings()
    const pool: { readonly docId: string; readonly priority: number }[] = []
    for (const value of meetings) {
      if (value.review?.state === 'filed' && REVIEW_TIERS[value.type] === 'main') {
        pool.push({ docId: value.docId, priority: value.review.priority ?? 99 })
      }
    }
    pool.sort((a, b) => a.priority - b.priority)
    const pumped: string[] = []
    for (const entry of pool) {
      if (await this.startReview(entry.docId)) pumped.push(entry.docId)
    }
    return pumped
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

  // —— 复审回告闭环（ADR-0010）：公开方法 ——

  /**
   * 待审池专项出审（ADR-0010 Q1″/Q2：手动窗口）.
   * 用户明确指定一批案卷（`docIds`）出审——可含任意档位（次级/弱档因此可由
   * 用户在场批量开启）；主力档已由归档位点批量泵自动出审，无需也不会被本方法
   * 重复启动（其状态已非 filed）。
   * @param docIds - 用户指定的案卷号列表（专项批次的唯一依据，必填非空）.
   * @returns 实际出审的案卷号列表.
   */
  async reviewDispatch(docIds: readonly string[]): Promise<readonly string[]> {
    if (docIds.length === 0) {
      throw new PcError('REVIEW_STAGE_BLOCKED', '专项出审必须指定案卷（docIds）：要审哪些档案由用户明确点名')
    }
    const dispatched: string[] = []
    for (const docId of docIds) {
      const row = await this.store.meeting(docId)
      if (row.status !== 'adjourned') {
        throw new PcError('REVIEW_UNAVAILABLE', `案卷 ${docId} 未归档，不可出审`)
      }
      if (row.type === 'MIN') continue
      if (await this.startReview(docId, true)) dispatched.push(docId)
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
    const row = await this.store.meeting(input.docId)
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
    const records = await this.store.records(input.docId)
    // 复审意见落板：kind=review，authorName='用户'，标注代录来源（与监督意见同纪律）.
    const seq = this.store.nextSeq(records, record => record.kind === 'review')
    await this.store.putRecord({
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
    // 状态机：idle → filed（登记+计数）——受理与派发交给 startReview（CAS/await/回滚统一路径）.
    const flag: ReviewFlag = this.reviewFlagOf(records)
    const priority = reviewPriority(REVIEW_TIERS[row.type], flag)
    await this.store.advanceReview(input.docId, review => {
      review.state = 'filed'
      review.flag = flag
      review.count = prior.count + 1
      review.priority = priority
    })
    // 受理→派发→审查（用户语境：失败抛错给发起人，ADR-0011 Q8-A；意见已落板，回滚后仍留池待重新出审）.
    await this.startReview(input.docId, true)
    const done = await this.store.meeting(input.docId)
    return { pc: 'meeting', meeting: toMeetingView(done) }
  }

  /**
   * 审查替身直写审查意见（ADR-0010 Q6/Q7：不经主持人代录）。
   * 只装给 `pc-reviewer` preset 的替身会话；服务层校验 authorName 约定.
   * @param actorSessionId - 审查替身会话 id（审计字段）.
   * @param input - 文号、审查结论（维持/建议修订/建议解释）与逐条处置清单.
   */
  async reviewVerdict(actorSessionId: string, input: { readonly docId: string; readonly verdict: string; readonly disposal: string }): Promise<PcFact> {
    const row = await this.store.meeting(input.docId)
    const state = this.reviewOf(row).state
    if (state !== 'reviewing' && state !== 'accepted') {
      throw new PcError('REVIEW_STAGE_BLOCKED', `案卷 ${input.docId} 当前复审状态为 ${state}，不在审查阶段（③ reviewing）——审查替身只在该阶段直写审查意见`)
    }
    if (input.verdict.trim().length === 0) throw new PcError('STRUCTURE_FAIL', '审查意见为空')
    if (input.verdict.length > REVIEW_OPINION_LIMIT) {
      throw new PcError('WORD_LIMIT', `审查意见 ${input.verdict.length} 字超 ${REVIEW_OPINION_LIMIT} 上限：压缩后重提`)
    }
    const records = await this.store.records(input.docId)
    const seq = this.store.nextSeq(records, record => record.kind === 'review' && record.authorName === '审查主体')
    await this.store.putRecord({
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
    const view = await this.store.advanceReview(input.docId, review => { review.state = next })
    // 交卷即销毁替身会话（ADR-0011 Q10-A：使命完成，主动 dispose 释放资源；
    // 此时状态已离开 reviewing/accepted，5B 兜底条件不触发）.
    if (this.host !== undefined) await this.host.disposeStandin(input.docId, 'reviewer')
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
    const row = await this.store.meeting(input.docId)
    const state = this.reviewOf(row).state
    if (state !== 'hearing') {
      throw new PcError('REVIEW_STAGE_BLOCKED', `案卷 ${input.docId} 当前复审状态为 ${state}，不在沟通纠正阶段（④ hearing）——异议方陈述只在该窗口受理`)
    }
    const records = await this.store.records(input.docId)
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
    const seq = this.store.nextSeq(records, record => record.kind === 'review' && record.stage === 'hearing')
    await this.store.putRecord({
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
    const view = await this.store.advanceReview(input.docId, review => { review.state = next })
    return { pc: 'meeting', meeting: view }
  }

  /**
   * 主持人（用户授意）结束听证窗口：异议方未能全部陈述时给收窗逃生门
   * （宿主未唤醒异议方/异议方永久缺席）。程序性动作，不替代用户三选.
   * @param docId - 文号.
   */
  async reviewCloseHearing(docId: string): Promise<PcFact> {
    const row = await this.store.meeting(docId)
    const state = this.reviewOf(row).state
    if (state !== 'hearing') {
      throw new PcError('REVIEW_STAGE_BLOCKED', `案卷 ${docId} 不在沟通纠正阶段（${state}），无听证可收`)
    }
    const view = await this.store.advanceReview(docId, review => { review.state = 'decidable' })
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
    const row = await this.store.meeting(input.docId)
    const state = this.reviewOf(row).state
    if (state !== 'decidable') {
      throw new PcError('REVIEW_STAGE_BLOCKED', `案卷 ${input.docId} 当前复审状态为 ${state}，不在决议出口（⑤ decidable）——先有审查意见并呈报用户后方可三选`)
    }
    if (!['revise', 'interpret', 'dismiss'].includes(input.choice)) {
      throw new PcError('REVIEW_CHOICE_INVALID', `出口三选只接受 revise（修订重议）/ interpret（解释性决议）/ dismiss（驳回并说明）；收到「${String(input.choice)}」`)
    }
    const records = await this.store.records(input.docId)
    const dissenting = this.dissentingNames(row, records)
    // 出口裁定落板（kind=review，authorName='用户'，标注三选）.
    const seq = this.store.nextSeq(records, record => record.kind === 'review' && record.authorName === '用户' && record.stage === 'adjudicate')
    await this.store.putRecord({
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
    const view = await this.store.advanceReview(input.docId, review => {
      review.choice = input.choice
      review.state = 'feedback'
    })
    return { pc: 'meeting', meeting: view }
  }

  /**
   * 登记复审出口的落地关联（ADR-0010 Q16，ADR-0011 Q14/Q15）：
   * 修订→新案卷号（对称谱系：新卷记 originDocId＋上轮审查结论摘要）；
   * 解释→解释性 resolution 记录 id（同效力同义务：同卷复审状态机再开一轮）.
   * 由主持人（用户授意）在 convene 新卷/落解释决议后调用，补全落地关联字段.
   * @param docId - 被复审案卷号.
   * @param input - 关联字段.
   */
  async reviewLinkLanding(docId: string, input: { readonly revisedDocId?: string; readonly interpretRecordId?: string }): Promise<PcFact> {
    const row = await this.store.meeting(docId)
    if ((input.revisedDocId === undefined) === (input.interpretRecordId === undefined)) {
      throw new PcError('REVIEW_CHOICE_INVALID', '落地关联只能填其一：修订→revisedDocId；解释→interpretRecordId')
    }
    if (input.revisedDocId !== undefined) {
      const revised = await this.store.meeting(input.revisedDocId)
      if (!revised.docId.startsWith('PC-')) throw new PcError('BAD_DOCUMENT_ID', '修订案卷号非法')
    }
    const view = await this.store.advanceReview(docId, review => {
      if (input.revisedDocId !== undefined) review.revisedDocId = input.revisedDocId
      if (input.interpretRecordId !== undefined) review.interpretRecordId = input.interpretRecordId
    })
    if (input.revisedDocId !== undefined) {
      // Q14-A 修订谱系对称：新卷记「修订来源 originDocId＋上轮审查结论摘要」——
      // 摘要取原卷记录流最新审查主体意见（截断），新卷出审时注入审查包核验焦点.
      const records = await this.store.records(docId)
      const sourceOpinion = [...records].reverse().find(record =>
        record.kind === 'review' && record.authorName === '审查主体')
      const sourceNote = sourceOpinion?.text !== undefined
        ? sourceOpinion.text.slice(0, 400)
        : ''
      await this.store.advanceReview(input.revisedDocId, review => {
        review.originDocId = docId
        review.sourceReviewNote = sourceNote
      })
      await this.store.recordReviewEvent(docId, `复审出口·修订重议：决议关联新卷 ${input.revisedDocId}（谱系已对称入档）`)
    } else if (input.interpretRecordId !== undefined) {
      // Q15-A 解释性决议同效力同义务：解释落板即同卷复审状态机再开一轮
      // （count 累计保留；主力档自动泵/弱档用户在场，出口仍用户三选）.
      await this.store.advanceReview(docId, review => { review.state = 'filed' })
      await this.store.recordReviewEvent(docId, `复审出口·解释性决议：解释落板（记录 ${input.interpretRecordId}），复审同卷再开一轮（同效力同义务）`)
      await this.pumpMainReview()
    }
    const fresh = await this.store.meeting(docId)
    return { pc: 'meeting', meeting: toMeetingView(fresh) }
  }

  /**
   * 逐条回告落板（ADR-0010 Q5-C/§113）：每条复审意见关联处置结论与回告文本.
   * 回告齐备（≥ 已登记意见条数）后复审闭环（closed）.
   * @param actorSessionId - 主持人会话 id（审计字段；回告由主持人按决议/审查意见撰写）.
   * @param input - 文号与回告文本（可多条分批，按条累计）.
   */
  async reviewReply(actorSessionId: string, input: { readonly docId: string; readonly text: string }): Promise<PcFact> {
    const row = await this.store.meeting(input.docId)
    const current = this.reviewOf(row)
    if (current.state !== 'feedback' && current.state !== 'decidable') {
      throw new PcError('REVIEW_STAGE_BLOCKED', `案卷 ${input.docId} 当前复审状态为 ${current.state}，不在反馈回告阶段（⑥ feedback）——回告在出口裁定后落板`)
    }
    if (input.text.trim().length === 0) throw new PcError('STRUCTURE_FAIL', '回告文本为空')
    if (input.text.length > MAX_TEXT_CHARS) {
      throw new PcError('WORD_LIMIT', `回告文本 ${input.text.length} 字超硬上限 ${MAX_TEXT_CHARS}`)
    }
    const records = await this.store.records(input.docId)
    const seq = this.store.nextSeq(records, record => record.kind === 'review-reply')
    await this.store.putRecord({
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
    const view = await this.store.advanceReview(input.docId, review => { review.state = next })
    return { pc: 'meeting', meeting: view }
  }

  /**
   * 分级批量驳回（ADR-0010 Q5-A，Q19-A 三分类收敛）：审查意见为「维持」的
   * decidable 档案一键批量驳回（驳回=认可维持原决议，出口仍需用户决定但可批量确认）；
   * 含「建议修订/建议解释/（旧数据）建议驳回」的档案必须逐件三选（实质变更不批量化）.
   * @param actorSessionId - 用户/主持人会话 id（审计字段）.
   * @param docIds - 待批量驳回的案卷号列表（须均为 decidable 且审查意见可批量）.
   * @param note - 统一的驳回说明模板（每条回告均携带；缺省用标准说明）.
   * @returns 各案卷的处理结果（成功驳回或跳过原因）.
   */
  async reviewBatchDismiss(actorSessionId: string, input: {
    readonly docIds: readonly string[]
    readonly note?: string
  }): Promise<ReadonlyArray<{ readonly docId: string; readonly state: ReviewState; readonly note?: string }>> {
    if (input.docIds.length === 0) {
      throw new PcError('REVIEW_STAGE_BLOCKED', '批量驳回必须指定至少一个案卷（docIds）')
    }
    const defaultNote = input.note ?? '批量复审处置：经审查维持原决议，未见需修订事项；逐条处置清单已随审查意见入档。'
    const results: Array<{ readonly docId: string; readonly state: ReviewState; readonly note?: string }> = []
    for (const docId of input.docIds) {
      const row = await this.store.meeting(docId)
      const current = this.reviewOf(row)
      if (current.state !== 'decidable') {
        results.push({ docId, state: current.state, note: `非待裁状态（${current.state}），跳过` })
        continue
      }
      const records = await this.store.records(docId)
      const verdict = [...records].reverse().find(record =>
        record.kind === 'review' && record.authorName === '审查主体')
      const verdictText = verdict?.text ?? ''
      // Q19-A 三分类收敛：仅「维持」可批量——含修订/解释/（旧数据）建议驳回的档案逐件三选
      // （「建议驳回」旧数据按方向性语义＝建议撤销，批量维持会方向性出错，必须逐件）.
      if (/建议修订|建议解释|建议驳回|修订重议|解释性/.test(verdictText)) {
        results.push({ docId, state: current.state, note: '审查意见含修订/解释/驳回建议，须逐件三选（不批量化）' })
        continue
      }
      // 可批量：驳回并说明（先落出口裁定，再进 feedback，由后续回告闭环）.
      await this.reviewAdjudicate(actorSessionId, { docId, choice: 'dismiss', note: defaultNote })
      results.push({ docId, state: 'feedback', note: defaultNote })
    }
    return results
  }

  /**
   * 启动恢复（ADR-0011 Q1/Q3/Q9/Q10-C/Q11）：服务装配完成后延迟一拍执行一次。
   * 三步闭环：①清理替身死会话（Q10-C，进程重启后必然无驱动者）；②重建全档位
   * reviewing/accepted 档案（Q3/Q9：有审查意见→按意见推进，无→回滚 filed 重泵）；
   * ③泵主力档 filed（含刚回滚出的）。
   * 全池出审零成功时 loud 报错（Q11：配置错误显式暴露，临时故障仍走静默回滚）.
   * @returns 泵出与重建详情（供启动日志）.
   */
  async recoverReviews(): Promise<{ readonly pumped: readonly string[]; readonly rebuilt: readonly string[]; readonly rolledBack: readonly string[] }> {
    // Q10-C：清理替身死会话（审查/监督两路，均幂等）.
    await this.host?.disposeAllStandins()
    const meetings = await this.store.allMeetings()
    const rebuilt: string[] = []
    const rolledBack: string[] = []
    for (const row of meetings) {
      const state = row.review?.state
      if (state !== 'reviewing' && state !== 'accepted') continue
      const records = await this.store.records(row.docId)
      const reviewerOpinion = records.some(record =>
        record.kind === 'review' && record.authorName === '审查主体')
      if (reviewerOpinion) {
        // 有审查意见而状态仍在 reviewing/accepted（进程崩溃掉在落板与推进之间）：按意见推进.
        const dissenting = this.dissentingNames(row, records)
        await this.store.advanceReview(row.docId, review => { review.state = dissenting.length > 0 ? 'hearing' : 'decidable' })
        await this.store.recordReviewEvent(row.docId, '启动重建：检测到审查意见已落板而状态未推进，已按意见推进'
          + `（${dissenting.length > 0 ? '沟通纠正（有异议方）' : '决议出口（无异议方）'}）`)
        rebuilt.push(row.docId)
      } else {
        // 无审查意见：替身已死且未产出——回滚 filed 重新泵（Q3）.
        await this.store.advanceReview(row.docId, review => { review.state = 'filed' })
        await this.store.recordReviewEvent(row.docId, '启动重建：审查替身已死且未产出审查意见，回滚待审池重新出审')
        rolledBack.push(row.docId)
      }
    }
    const pumped = await this.pumpMainReview()
    // Q11：池非空而无一出审成功 → loud（配置错误显式暴露）.
    if (this.host !== undefined && pumped.length === 0 && rolledBack.length === 0) {
      const pending = meetings.filter(value => value.review?.state === 'filed').length
      if (pending > 0) {
        this.logger?.error(`[pandaclaw] 待审池全员出审失败（${pending} 件 filed 未动）：检查审查替身 preset（pc-reviewer）装配与底座 agents 服务`)
      }
    }
    return { pumped, rebuilt, rolledBack }
  }

  /**
   * 审查替身会话销毁兜底（ADR-0011 Q5-B）：spawn 成功后替身被 dispose（意外死亡/被杀）
   * 而档案仍在 reviewing/accepted 且无审查意见 → 回滚 filed 自动重泵。
   * 主动 dispose（交卷/restart 前状态已离开 reviewing/accepted）天然不触发.
   * @param docId - 替身所属案卷号（由宿主解析 sessionId 前缀得出）.
   */
  async handleStandinDisposed(docId: string): Promise<void> {
    const row = await this.store.meeting(docId)
    const state = row.review?.state
    if (state !== 'reviewing' && state !== 'accepted') return
    const records = await this.store.records(docId)
    if (records.some(record => record.kind === 'review' && record.authorName === '审查主体')) return
    await this.store.advanceReview(docId, review => { review.state = 'filed' })
    await this.store.recordReviewEvent(docId, '审查替身会话意外销毁且未产出审查意见，回滚待审池自动重泵')
    await this.pumpMainReview()
  }

  /**
   * 复审重启逃生门（ADR-0011 Q5-C/Q6-A）：用户（主持人授意）废弃当前审查替身的工作，
   * 立即重开审查——回滚 filed 后当场走完 startReview（不等泵）.
   * 适用状态仅 reviewing/accepted（hearing 走 close-hearing、decidable 直接 adjudicate、
   * feedback 直接 reply——各有其道）.
   * @param docId - 文号.
   */
  async reviewRestart(docId: string): Promise<PcFact> {
    const row = await this.store.meeting(docId)
    const state = row.review?.state ?? 'idle'
    if (state !== 'reviewing' && state !== 'accepted') {
      throw new PcError('REVIEW_STAGE_BLOCKED', `案卷 ${docId} 当前复审状态为 ${state}，不在审查阶段——只有替身未产出审查意见的档案可重启复审（reviewing/accepted）；`
        + 'hearing 走 close-hearing 收窗、decidable 直接三选、feedback 直接回告')
    }
    // 废弃旧替身（Q10-A）：dispose 幂等；spawn 注册表无此档案时静默.
    if (this.host !== undefined) await this.host.disposeStandin(docId, 'reviewer')
    await this.store.advanceReview(docId, review => { review.state = 'filed' })
    await this.store.recordReviewEvent(docId, '用户重启复审：废弃原审查替身工作，重新出审')
    await this.startReview(docId, true)
    const fresh = await this.store.meeting(docId)
    return { pc: 'meeting', meeting: toMeetingView(fresh) }
  }
}