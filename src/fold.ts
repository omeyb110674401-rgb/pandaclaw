/**
 * PandaClaw 折叠器：会话日志 → 会议看板视图.
 *
 * 与底座插件同一纪律：不发明会话事件类型。全部持久事实搭本插件工具结果的
 * `presentationMeta.pandaclaw` 通行，fold 对外来数据逐字段校验而非信任.
 */

import type { SessionEvent } from '@deepseek-ai/dsh-session'
import { EMPTY_BOARD, type PcFact, type PcMeetingBoard } from './contract.ts'

/** 单侧容量上限：记录流与计票史各留最近 N 条，防长会话无界增长. */
const MAX_RECORDS = 400
const MAX_TALLIES = 100

/** 粗校验一条 meta 名下的 PandaClaw 事实（深度形状由投影 wire schema 把关）. */
function readPcFact(meta: unknown): PcFact | undefined {
  if (typeof meta !== 'object' || meta === null) return undefined
  const candidate = (meta as Record<string, unknown>).pandaclaw
  if (typeof candidate !== 'object' || candidate === null) return undefined
  const fact = candidate as Record<string, unknown>
  if (fact.pc !== 'meeting' && fact.pc !== 'record' && fact.pc !== 'tally') return undefined
  return candidate as PcFact
}

/**
 * 向看板归并一条日志事件携带的事实（整体快照语义：同键覆盖、新纪录追加）.
 * @param state - 当前看板.
 * @param event - 任一会话事件；非本插件工具结果原样返回.
 */
export function applyPcEvent(state: PcMeetingBoard, event: SessionEvent): PcMeetingBoard {
  if (event.type !== 'tool/result') return state
  const data = event.data as { readonly meta?: unknown }
  const fact = readPcFact(data.meta)
  if (fact === undefined) return state
  switch (fact.pc) {
    case 'meeting': {
      const rest = state.meetings.filter(meeting => meeting.docId !== fact.meeting.docId)
      return { ...state, meetings: [...rest, fact.meeting] }
    }
    case 'record': {
      const records = [...state.records, fact.record]
      return { ...state, records: records.length > MAX_RECORDS ? records.slice(records.length - MAX_RECORDS) : records }
    }
    case 'tally': {
      const rest = state.tallies.filter(tally =>
        !(tally.docId === fact.tally.docId && tally.stage === fact.tally.stage && tally.round === fact.tally.round))
      const tallies = [...rest, fact.tally]
      return { ...state, tallies: tallies.length > MAX_TALLIES ? tallies.slice(tallies.length - MAX_TALLIES) : tallies }
    }
  }
}

/** 空看板再导出，供客户端初始化复用. */
export { EMPTY_BOARD }
