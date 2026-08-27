/**
 * PandaClaw 协议常量与纯函数层（v2.4 实测校准版的代码化）.
 *
 * 本文件是系统的「宪法」：六类会议的阶段流、字数规约、表决公式、代字规则
 * 全部在此以纯函数与常量表达，不持有任何运行时状态、不做任何 IO。上层
 * （服务/工具）只能通过这里裁决协议问题，禁止内联第二份协议数字.
 *
 * 条款溯源见仓库 docs/协议校准底稿.md（M1-M17 裁决）.
 */

/** 会议类型代号. */
export type MeetingType = 'MIN' | 'RES' | 'CON' | 'PLA' | 'STR' | 'LEG'

/** 复杂度档位：cppcc 提案方人数 + npc 审查方人数. */
export type Tier = 'simple' | 'medium' | 'complex' | 'enterprise'

/** 验收模式. */
export type Validation = 'full' | 'key' | 'skip'

/** 记录种类（会议文书的最小单元）. */
export type RecordKind =
  | 'agenda'
  | 'issue'
  | 'opinion'
  | 'inquiry'
  | 'reply'
  | 'digest'
  | 'draft'
  | 'focus'
  | 'vote'
  | 'resolution'
  | 'ruling'
  | 'rebind'
  | 'warning'
  | 'supervision'
  | 'review'
  | 'review-reply'
  | 'review-event'

/** 席位：协商方 / 审查方 / 主持人. */
export type Seat = 'cppcc' | 'npc' | 'chair'

/** 一个阶段在其类型阶段流中的定义. */
export interface StageDef {
  /** 阶段标识（用于记录键与状态机迁移）. */
  readonly id: string
  /** 阶段显示名. */
  readonly label: string
  /**
   * 是否开协商回路（⭐）：允许成员提交 opinion/inquiry/reply 并付表决.
   * 非回路阶段由主持人直办，只接受 chair 的 record 登记.
   */
  readonly deliberative: boolean
}

/**
 * 六类会议的阶段流（协议 §1 矩阵）.
 * 顺序即合法迁移序列；状态机只允许沿序列前进（含原地停留），禁止跳步.
 */
export const STAGE_FLOWS: Readonly<Record<MeetingType, readonly StageDef[]>> = {
  MIN: [
    { id: 'record', label: '记录', deliberative: false },
    { id: 'organize', label: '整理', deliberative: false },
    { id: 'confirm', label: '确认', deliberative: true },
    { id: 'archive', label: '存档', deliberative: false },
  ],
  RES: [
    { id: 'initiate', label: '立项', deliberative: false },
    { id: 'drafting', label: '起草', deliberative: false },
    { id: 'deliberation', label: '审议', deliberative: true },
    { id: 'publish', label: '公布', deliberative: false },
  ],
  CON: [
    { id: 'initiate', label: '立项', deliberative: false },
    { id: 'research', label: '调研', deliberative: false },
    { id: 'drafting', label: '起草', deliberative: true },
    { id: 'solicit', label: '征求意见', deliberative: true },
    { id: 'deliberation', label: '审议', deliberative: true },
    { id: 'publish', label: '发布', deliberative: false },
  ],
  PLA: [
    { id: 'assess', label: '评估', deliberative: false },
    { id: 'research', label: '研究', deliberative: true },
    { id: 'compilation', label: '编制', deliberative: false },
    { id: 'solicit', label: '意见征求', deliberative: true },
    { id: 'coherence', label: '衔接论证闸门', deliberative: false },
    { id: 'prereview', label: '专委会预审', deliberative: false },
    { id: 'approval', label: '批准', deliberative: true },
    { id: 'publish', label: '发布', deliberative: false },
  ],
  STR: [
    { id: 'assess', label: '评估', deliberative: false },
    { id: 'research', label: '研究', deliberative: true },
    { id: 'plan-drafting', label: '规划起草', deliberative: false },
    { id: 'solicit', label: '意见征求', deliberative: true },
    { id: 'inner-review', label: '内圈审议', deliberative: true },
    { id: 'final-approval', label: '外圈终审批准', deliberative: true },
  ],
  LEG: [
    { id: 'initiate', label: '立项', deliberative: false },
    { id: 'drafting', label: '起草', deliberative: false },
    { id: 'solicit', label: '公开征意', deliberative: true },
    { id: 'expert-review', label: '专家论证', deliberative: true },
    { id: 'compliance', label: '合规审查', deliberative: true },
    { id: 'joint-deliberation', label: '合议审议', deliberative: true },
    { id: 'publish', label: '公布', deliberative: false },
    { id: 'filing', label: '备案归档', deliberative: false },
  ],
}

/** 各复杂度档位的编制（cppcc 人数, npc 人数）（协议 §2）. */
export const TIER_ROSTER: Readonly<Record<Tier, { readonly cppcc: number; readonly npc: number }>> = {
  simple: { cppcc: 2, npc: 1 },
  medium: { cppcc: 3, npc: 2 },
  complex: { cppcc: 4, npc: 3 },
  enterprise: { cppcc: 5, npc: 5 },
}

/**
 * 字数规约（协议 §3 P2 / §4 / M17；单位：字符）.
 * 定性为行为规约：超限由 pc_submit 当场拒收退回重提，原稿不入库.
 */
export const WORD_LIMITS = {
  opinion: 300,
  inquiry: 100,
  reply: 100,
  voteReason: 80,
  ask: 50,
  confirm: 60,
} as const

/** 同一议题（同会议同回路阶段）的总轮次上限（三审制，协议 §4）. */
export const MAX_ROUNDS_PER_STAGE = 3

/** 表决立场全集：选票三态（多数决类）∪ 确证书两态（MIN 核验类）. */
export type Stance = '赞成' | '反对' | '弃权' | '确认' | '更正'

/** 应答率门槛基数：npc 已投票数 / npc 编制 ≥ 2/3（协议 §4 R4）——整数交叉相乘判定. */
export const QUORUM_NUMERATOR = 2
export const QUORUM_DENOMINATOR = 3

/** 选票立场（除 MIN 外的全部收敛点）. */
export const BALLOT_STANCES: readonly ['赞成', '反对', '弃权'] = ['赞成', '反对', '弃权']

/** 确证书立场（仅 MIN 确认阶段；ADR-0002）. */
export const CERTIFY_STANCES: readonly ['确认', '更正'] = ['确认', '更正']

/**
 * 会议类型的立场集。
 * @param type - 会议类型.
 */
export function stancesFor(type: MeetingType): readonly Stance[] {
  return type === 'MIN' ? CERTIFY_STANCES : BALLOT_STANCES
}

/**
 * 允许付表决的阶段（R4 只发生在这些阶段；LEG 的合议审议走三形态决定不计票，
 * 计票在公布批准环节——协议 §4 LEG 特例）。STR 终审采一致同意（ADR-0003）.
 */
export const VOTE_STAGES: Readonly<Record<MeetingType, readonly string[]>> = {
  MIN: ['confirm'],
  RES: ['deliberation'],
  CON: ['deliberation'],
  PLA: ['approval'],
  STR: ['final-approval'],
  LEG: ['publish'],
}

/**
 * 收敛点的通过规则（ADR-0003 一般原理：收敛形式依被模拟机构的现实惯例）.
 * - `certify`：MIN 确证——无更正且应答率达标；
 * - `majority`：过半数（宪法第64条实践口径，弃权算术上等同反对）；
 * - `two-thirds`：重大事项 ≥2/3；
 * - `unanimous`：一致同意（党内审批链内核，STR 终审专用）.
 */
export type PassRule = 'certify' | 'majority' | 'two-thirds' | 'unanimous'

/**
 * 判定某会议某收敛点采用的通过规则.
 * @param type - 会议类型.
 * @param stage - 阶段标识.
 * @param validation - 会议验收模式.
 */
export function passRuleFor(type: MeetingType, stage: string, validation: Validation): PassRule {
  if (type === 'MIN') return 'certify'
  if (validation === 'full' && stage === 'final-approval') return 'unanimous'
  if (validation === 'full') return 'two-thirds'
  return 'majority'
}

/**
 * 推进出去之前必须已有 `ruling`（三形态裁定）锚点的阶段.
 * 依据 ADR-0003：内圈审议的产出是裁定而非票数，无裁定不得放行进入终审.
 */
export const RULING_GATED_STAGES: Readonly<Partial<Record<MeetingType, readonly string[]>>> = {
  STR: ['inner-review'],
}

/** 会议类型字（代字规则，docs/research/C-补-P12）. */
const TYPE_CHARACTERS: Readonly<Record<MeetingType, string>> = {
  MIN: 'MIN',
  RES: 'RES',
  CON: 'CON',
  PLA: 'PLA',
  STR: 'STR',
  LEG: 'LEG',
}

/**
 * 校验文号格式并拆解组成部分.
 * @param id - 待校验文号，形如 `PC-CON〔2026〕001号`.
 * @returns 拆解结果；格式非法返回 undefined.
 */
export function parseDocumentId(id: string): { readonly type: MeetingType; readonly year: number; readonly seq: number } | undefined {
  const match = /^PC-([A-Z]{3})〔(\d{4})〕(\d{1,3})号$/.exec(id)
  if (match === null) return undefined
  const type = (Object.keys(TYPE_CHARACTERS) as MeetingType[]).find(key => TYPE_CHARACTERS[key] === match[1])
  if (type === undefined) return undefined
  return { type, year: Number(match[2]), seq: Number(match[3]) }
}

/**
 * 计算会议类型的默认验收模式（协议 §1 矩阵列）.
 * @param type - 会议类型.
 */
export function defaultValidation(type: MeetingType): Validation {
  switch (type) {
    case 'MIN':
    case 'RES':
      return 'skip'
    case 'CON':
    case 'PLA':
      return 'key'
    case 'STR':
    case 'LEG':
      return 'full'
  }
}

/** 一次表决的输入快照（由服务从记录域汇出）. */
export interface BallotSnapshot {
  readonly stance: Stance
}

/** 计票结果（M1 机械输出，含门槛判定过程）. */
export interface TallyResult {
  readonly aye: number
  readonly nay: number
  readonly abstain: number
  /** npc 编制总数（分母基数）. */
  readonly rosterSize: number
  readonly responded: number
  /** 应答率是否达到 ≥2/3. */
  readonly quorumMet: boolean
  /** 未达应答率时的降级标记. */
  readonly mode: 'formal' | 'consultive'
  readonly passed: boolean
  /** 采用的公式描述（写入决议溯源）. */
  readonly rule: string
}

/**
 * 机械计票（M1 + R4 启动门槛）.
 *
 * 应答率先行：已应答 npc 数未达编制 × 2/3 时降级为征询模式（仅供参考）。
 * 通过线按 {@link PassRule} 四分：
 * - certify：无更正即确证（MIN，ADR-0002）；
 * - majority：赞成 × 2 > 编制（弃权计入分母，算术上等同反对）；
 * - two-thirds：赞成 × 3 ≥ 编制 × 2；
 * - unanimous：一致同意——赞成数 === 编制（STR 终审，ADR-0003）。
 * 全部比率用整数交叉相乘判定，杜绝浮点与取整口径漂移.
 * @param ballots - 本阶段全部有效选票/确证书.
 * @param npcRoster - npc 编制人数.
 * @param rule - 收敛点通过规则.
 */
export function tally(ballots: readonly BallotSnapshot[], npcRoster: number, rule: PassRule): TallyResult {
  const aye = ballots.filter(ballot => ballot.stance === '赞成' || ballot.stance === '确认').length
  const nay = ballots.filter(ballot => ballot.stance === '反对' || ballot.stance === '更正').length
  const abstain = ballots.filter(ballot => ballot.stance === '弃权').length
  const responded = ballots.length
  const quorumMet = responded >= 1 && responded * QUORUM_DENOMINATOR >= npcRoster * QUORUM_NUMERATOR
  const mode: TallyResult['mode'] = quorumMet ? 'formal' : 'consultive'
  let passed: boolean
  let ruleText: string
  switch (rule) {
    case 'certify':
      passed = quorumMet && nay === 0
      ruleText = `无更正(${nay})=0 且应答${responded}/${npcRoster}达标`
      break
    case 'majority':
      // 普通事项：赞成 × 2 > 编制（宪法第64条实践口径）.
      passed = quorumMet && aye * 2 > npcRoster
      ruleText = `赞成(${aye}) > npc编制(${npcRoster})÷2`
      break
    case 'two-thirds':
      // 重大事项终批：赞成 × 3 ≥ 编制 × 2（弃权等同反对）.
      passed = quorumMet && aye * 3 >= npcRoster * 2
      ruleText = `赞成(${aye}) ≥ npc编制(${npcRoster})×2/3`
      break
    case 'unanimous':
      // 一致同意（党内审批链内核）：经前置门后全员赞成，一票反对即阻断.
      passed = quorumMet && aye === npcRoster
      ruleText = `一致同意：赞成(${aye}) === npc编制(${npcRoster})`
      break
  }
  return { aye, nay, abstain, rosterSize: npcRoster, responded, quorumMet, mode, passed, rule: ruleText }
}

/**
 * 一事一案结构检查（M4 硬项的字段级近似）.
 * 意见书必须同时含有「情况/分析」与「具体建议」两类实质段落标记.
 * @param text - 意见书全文.
 */
export function hasOpinionStructure(text: string): boolean {
  const hasBasis = /(情况|现状|背景|分析|依据|问题)/.test(text)
  const hasProposal = /(建议|应当|采用|推行|设立|增加|减少|取消|改为)/.test(text)
  return hasBasis && hasProposal
}

// —— 复审回告闭环（ADR-0010）——

/** 复审子状态：已归档案卷上跑的六阶段状态机（不占 `status`，原卷保持归档）. */
export type ReviewState =
  | 'idle'          // 未进入复审（默认）
  | 'filed'         // ① 登记：review 记录已落板，等待受理
  | 'accepted'      // ② 受理：服务层完成有效性检查
  | 'reviewing'     // ③ 审查：审查替身已派发，产出审查意见中
  | 'hearing'       // ④ 沟通纠正：异议方陈述窗口（被动陈述人）
  | 'decidable'     // ⑤ 决议出口：审查意见已呈用户，等待三选
  | 'feedback'      // ⑥ 反馈：出口已裁，逐条回告落板中
  | 'closed'        // 复审完毕（出口落板、回告齐备）

/**
 * 协议标记的「待验证放行」降级态（Q4 修正）.
 * 降级态唯一＝征询采信（`consultive`）：应答率不足却由用户三选采信归档（ADR-0004
 * 明文标注「未达法定状态」）——真正「协议盖章放行但留了尾巴」.
 * `skip-validation` 保留仅为旧数据兼容（v1.6.0 前产物）；验收 skip 是 RES 默认档的
 * 正常产物而非降级态，新计算不再产出（其检验由主力档自动复审覆盖）.
 */
export type ReviewFlag =
  | 'none'               // 无降级标记
  | 'consultive'         // 征询采信·未达法定状态（ADR-0004），泵优先执行
  | 'skip-validation'    // 旧数据兼容（不再产出）

/**
 * 复审类型分层（Q17：「有备必审」按类型效力分层出审）.
 * 复审审的是「决定对不对」——效力等级决定复审必要性与出审次序：
 * `main`＝主力（RES/LEG，备案审查直接同构，入池即自动出审）；
 * `secondary`＝次级（PLA/STR，轮候或用户/专项触发）；
 * `weak`＝弱（CON，仅用户提意见触发）；
 * `none`＝不入池（MIN，无新决定，「记」非「决」，异议走会内更正循环）.
 */
export const REVIEW_TIERS: Readonly<Record<MeetingType, 'main' | 'secondary' | 'weak' | 'none'>> = {
  MIN: 'none',
  RES: 'main',
  CON: 'weak',
  PLA: 'secondary',
  STR: 'secondary',
  LEG: 'main',
}

/**
 * 复审出审优先级的机械排序依据（服务层零 AI 判断）.
 * 主力档先于次级/弱档；同档内降级标记优先于无标记.
 * @param tier - 类型分层（'main' | 'secondary' | 'weak' | 'none'）.
 * @param flag - 协议降级标记.
 */
export function reviewPriority(tier: 'main' | 'secondary' | 'weak' | 'none', flag: ReviewFlag): number {
  const tierBase = tier === 'main' ? 0 : tier === 'secondary' ? 10 : 20
  const flagBonus = flag === 'none' ? 0 : 1
  return tierBase + flagBonus
}

/** 复审六阶段标签（ADR-0010 第 2 节，与监督法 §38-45 逐段同构）. */
export const REVIEW_FLOW: readonly { readonly id: ReviewState; readonly label: string }[] = [
  { id: 'filed', label: '登记' },
  { id: 'accepted', label: '受理' },
  { id: 'reviewing', label: '审查' },
  { id: 'hearing', label: '沟通纠正' },
  { id: 'decidable', label: '决议出口' },
  { id: 'feedback', label: '反馈回告' },
]

/** 复审意见的条数上限（逐条回告义务的机械边界；超限的后续意见并入前条处置）. */
export const MAX_REVIEW_PER_DOC = 10

/** 复审审查意见的字数上限（审查替身产出，代码硬编码的 setup 规约）. */
export const REVIEW_OPINION_LIMIT = 600

/**
 * 审查意见三分类（Q19-A 收敛）：维持／建议修订／建议解释。
 * 「建议驳回」不再产出——同词异义（替身的「建议驳回」按备案审查同构＝建议撤销原决议，
 * 与用户出口「驳回并说明」＝驳回审查建议、维持原决议方向相反）且批量驳回会把
 * 「建议撤销」一键「维持」——方向性错误；撤销作为修订子形态经重议产出.
 * 旧数据中的「建议驳回」记录保留（兼容读取），batch-dismiss 对含该词的档案逐件三选.
 */
export const REVIEW_VERDICTS: readonly string[] = ['维持', '建议修订', '建议解释']
