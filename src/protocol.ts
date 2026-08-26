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

/** 付表决的应答率门槛：npc 已投票数 / npc 编制 ≥ 2/3（协议 §4 R4）——整数交叉相乘判定. */
export const QUORUM_NUMERATOR = 2
export const QUORUM_DENOMINATOR = 3

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
  readonly stance: '赞成' | '反对' | '弃权'
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
 * 通过 = 赞成 > npc编制 ÷ 2（弃权计入分母不计入分子，算术上等同反对）；
 * full 验收的最终批准阶段改为 赞成 ≥ npc编制 × 2/3；
 * 应答率先行：已应答 npc 数未达编制 × 2/3 时降级为征询模式（仅供参考）。
 * 全部比率用整数交叉相乘判定，杜绝浮点与取整口径漂移.
 * @param ballots - 本阶段全部有效选票.
 * @param npcRoster - npc 编制人数.
 * @param majorMatter - 是否重大事项终批（full 验收的批准/终审阶段）.
 */
export function tally(ballots: readonly BallotSnapshot[], npcRoster: number, majorMatter: boolean): TallyResult {
  const aye = ballots.filter(ballot => ballot.stance === '赞成').length
  const nay = ballots.filter(ballot => ballot.stance === '反对').length
  const abstain = ballots.filter(ballot => ballot.stance === '弃权').length
  const responded = ballots.length
  const quorumMet = responded >= 1 && responded * QUORUM_DENOMINATOR >= npcRoster * QUORUM_NUMERATOR
  const mode: TallyResult['mode'] = quorumMet ? 'formal' : 'consultive'
  let passed: boolean
  let rule: string
  if (majorMatter) {
    // 重大事项终批：赞成 × 3 ≥ 编制 × 2（分母仍是全员编制，弃权等同反对）.
    passed = quorumMet && aye * 3 >= npcRoster * 2
    rule = `赞成(${aye}) ≥ npc编制(${npcRoster})×2/3`
  } else {
    // 普通事项：赞成 × 2 > 编制（宪法第64条实践口径）.
    passed = quorumMet && aye * 2 > npcRoster
    rule = `赞成(${aye}) > npc编制(${npcRoster})÷2`
  }
  return { aye, nay, abstain, rosterSize: npcRoster, responded, quorumMet, mode, passed, rule }
}

/**
 * 允许付表决的阶段（R4 只发生在这些阶段；LEG 的合议审议走三形态决定不计票，
 * 计票在公布批准环节——协议 §4 LEG 特例）.
 */
export const VOTE_STAGES: Readonly<Record<MeetingType, readonly string[]>> = {
  MIN: ['confirm'],
  RES: ['deliberation'],
  CON: ['deliberation'],
  PLA: ['approval'],
  STR: ['inner-review', 'final-approval'],
  LEG: ['publish'],
}

/** 重大事项终批阶段（full 验收下启用 ≥2/3 门槛）：仅 STR 外圈与 LEG 公布. */
export const MAJOR_MATTER_STAGES: Readonly<Partial<Record<MeetingType, readonly string[]>>> = {
  STR: ['final-approval'],
  LEG: ['publish'],
}

/**
 * 判定某会议某阶段是否重大事项终批.
 * @param type - 会议类型.
 * @param stage - 阶段标识.
 * @param validation - 会议验收模式.
 */
export function isMajorMatter(type: MeetingType, stage: string, validation: Validation): boolean {
  return validation === 'full' && (MAJOR_MATTER_STAGES[type] ?? []).includes(stage)
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
