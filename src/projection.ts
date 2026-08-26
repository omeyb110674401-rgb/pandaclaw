/**
 * `pandaclaw` 会话投影单元：主机折叠一次，框架把值推给浏览器，
 * 客户端零折叠.
 */

import { z } from 'zod'
import { EMPTY_BOARD, type PcMeetingBoard } from './contract.ts'
import { applyPcEvent } from './fold.ts'

/**
 * 投影单元的结构类型。宿主的键映射是封闭联合（仅含内置键），第三方插件
 * 的自定义键无法通过其泛型约束；运行时注册器按 wire schema 做结构校验，
 * 因此这里以本结构为准，装配处以一次显式桥接交给注册器.
 */
export interface PcProjectionUnit {
  readonly key: 'pandaclaw'
  readonly stateSchema: z.ZodType<PcMeetingBoard>
  readonly init: () => PcMeetingBoard
  readonly apply: (state: PcMeetingBoard, event: unknown) => PcMeetingBoard
  readonly wire: {
    readonly viewSchema: z.ZodType<PcMeetingBoard>
    readonly view: (state: PcMeetingBoard) => PcMeetingBoard
  }
  readonly stateVersion: number
}

/** wire 校验：fold 状态、读侧与持久缓存往返共用一套形状. */
const boardSchema = z.object({
  meetings: z.array(z.object({
    docId: z.string(),
    type: z.string(),
    tier: z.string(),
    validation: z.string(),
    topic: z.string(),
    status: z.string(),
    members: z.array(z.object({ name: z.string(), seat: z.string() })),
    stages: z.array(z.object({
      id: z.string(),
      label: z.string(),
      deliberative: z.boolean(),
      state: z.string(),
      round: z.number().optional(),
    })),
    currentStage: z.string().optional(),
    createdAt: z.number(),
    closedAt: z.number().optional(),
  })),
  records: z.array(z.object({
    id: z.string(),
    docId: z.string(),
    kind: z.string(),
    stage: z.string(),
    round: z.number().optional(),
    seat: z.string(),
    authorName: z.string(),
    authorSessionId: z.string(),
    preview: z.string(),
    wordCount: z.number(),
    verdict: z.string().optional(),
    reason: z.string().optional(),
    at: z.number(),
  })),
  tallies: z.array(z.object({
    docId: z.string(),
    stage: z.string(),
    round: z.number(),
    aye: z.number(),
    nay: z.number(),
    abstain: z.number(),
    rosterSize: z.number(),
    responded: z.number(),
    mode: z.string(),
    passed: z.boolean(),
    rule: z.string(),
    at: z.number(),
  })),
}) as unknown as z.ZodType<PcMeetingBoard>

/**
 * 构建投影单元.
 * @returns 注册到 sessionProjections 的单元定义.
 */
export function pcProjection(): PcProjectionUnit {
  return {
    key: 'pandaclaw',
    stateSchema: boardSchema,
    init: () => EMPTY_BOARD,
    apply: (state, event) => applyPcEvent(state, event as Parameters<typeof applyPcEvent>[1]),
    // 状态即渲染输入：读侧恒等，不存在第二套形状.
    wire: { viewSchema: boardSchema, view: state => state },
    stateVersion: 1,
  }
}
