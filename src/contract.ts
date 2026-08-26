/**
 * PandaClaw 主机/浏览器共享契约：事实（fact）、记录、投影视图.
 *
 * 本文件只含类型，无运行时代码；两侧经由它保持同一套字段名。所有形状都
 * 必须可无损过 JSON（投影值走 wire 推送）.
 */

import type { MeetingType, RecordKind, Seat, Tier, Validation } from './protocol.ts'

/** 投影里的一条会议记录（成员产物/主持人登记的锚点）. */
export interface PcRecordView {
  readonly id: string
  readonly docId: string
  readonly kind: RecordKind
  readonly stage: string
  /** 回路轮次；非回路阶段缺省. */
  readonly round?: number
  readonly seat: Seat
  /** 成员自报名（chair 登记为「主持人」）. */
  readonly authorName: string
  /** 提交方会话 id（审计链：同名单名的冒用在此暴露）. */
  readonly authorSessionId: string
  /** ≤180 字符预览. */
  readonly preview: string
  readonly wordCount: number
  /** M4 准入判定；仅 opinion 有. */
  readonly verdict?: 'admitted' | 'rejected'
  /** 拒收理由；仅 rejected 有. */
  readonly reason?: string
  readonly at: number
}

/** 阶段进度. */
export interface PcStageProgress {
  readonly id: string
  readonly label: string
  readonly deliberative: boolean
  readonly state: 'pending' | 'active' | 'done'
  /** 当前轮次；仅回路阶段且已激活时有. */
  readonly round?: number
}

/** 席位视图. */
export interface PcMemberView {
  readonly name: string
  readonly seat: Exclude<Seat, 'chair'>
}

/** 最近一次计票结果视图. */
export interface PcTallyView {
  readonly docId: string
  readonly stage: string
  readonly round: number
  readonly aye: number
  readonly nay: number
  readonly abstain: number
  readonly rosterSize: number
  readonly responded: number
  readonly mode: 'formal' | 'consultive'
  readonly passed: boolean
  readonly rule: string
  readonly at: number
}

/** 一场会议的完整视图（整体快照，非增量）. */
export interface PcMeetingView {
  readonly docId: string
  readonly type: MeetingType
  readonly tier: Tier
  readonly validation: Validation
  readonly topic: string
  readonly status: 'open' | 'adjourned' | 'terminated'
  readonly members: readonly PcMemberView[]
  readonly stages: readonly PcStageProgress[]
  readonly currentStage?: string
  readonly createdAt: number
  readonly closedAt?: number
}

/** 投影状态 = 浏览器渲染的全部输入. */
export interface PcMeetingBoard {
  readonly meetings: readonly PcMeetingView[]
  readonly records: readonly PcRecordView[]
  readonly tallies: readonly PcTallyView[]
}

/** 空面板. */
export const EMPTY_BOARD: PcMeetingBoard = { meetings: [], records: [], tallies: [] }

/**
 * 工具结果 presentationMeta 携带的持久事实（整体快照，非增量；
 * fold 只做覆盖式归并）。挂在 `{ pandaclaw: PcFact }` 名下.
 */
export type PcFact =
  | { readonly pc: 'meeting'; readonly meeting: PcMeetingView }
  | { readonly pc: 'record'; readonly record: PcRecordView }
  | { readonly pc: 'tally'; readonly tally: PcTallyView }
