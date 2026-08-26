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
  type PcRecordView, type PcTallyView,
} from './contract.ts'
import { PANDACLAW_DOMAIN, buildRecordId, tallyKey,
  type meetingSchema, type recordSchema, type tallySchema } from './domain.ts'
import { PcError } from './errors.ts'
import {
  MAX_ROUNDS_PER_STAGE, RULING_GATED_STAGES, STAGE_FLOWS, TIER_ROSTER, VOTE_STAGES, WORD_LIMITS,
  defaultValidation, hasOpinionStructure, passRuleFor, parseDocumentId, stancesFor, tally as mechanicalTally,
  type MeetingType, type RecordKind, type Seat, type Tier, type Validation,
} from './protocol.ts'

type MeetingRow = z.infer<typeof meetingSchema>
type RecordRow = z.infer<typeof recordSchema>
type TallyRow = z.infer<typeof tallySchema>

/**
 * 主持人登记的锚点种类.
 * `warning`：关窗预告（监督窗口二阶段开启，ADR-0008）.
 * `supervision`：代录入板的用户监督意见或明示放弃（ADR-0006/0009，authorName='用户'）.
 */
const CHAIR_KINDS: readonly RecordKind[] = ['agenda', 'issue', 'digest', 'draft', 'focus', 'resolution', 'ruling', 'warning', 'supervision']

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

/** PandaClaw 服务（插件行 `pandaclaw`）. */
export class PandaClawService extends Service {
  private readonly opening: Promise<Domain<typeof PANDACLAW_DOMAIN>>
  private disposed = false

  /**
   * @param ctx - 行上下文；`ctx.storageDomain` 已由 inject 保证在场.
   */
  constructor(ctx: Context) {
    super(ctx, 'pandaclaw')
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
        throw new PcError('SUPERVISION_PENDING',
          `用户监督窗口未收束（r${round}）：用户在场→代录其监督意见或明示放弃（pc_record kind=supervision）；`
          + '用户缺席→按 ADR-0009 spawn「用户监督替身」，由其以 pc_supervise 提交监督意见（不算票，用户回来自动获追认/撤回权）')
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
