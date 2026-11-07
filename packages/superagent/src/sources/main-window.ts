/**
 * Main-window Source: tasks the operator dispatches from their own DeepSeek Harness Session through the local management
 * API (`POST dispatch`). It polls nothing, has no channel and needs no account, so a dispatched task reaches the Engine as
 * a Trigger of this kind and every other part of dsh-superagent works unchanged.
 *
 * No `scope` on purpose: a kind without one listens to everything it produces (see kind.ts), and the operator who writes
 * through loopback already authorized the work.
 */
import type { Context } from '@deepseek-ai/cordis'
import { z } from 'zod'
import type { SourceKind } from './kind.ts'

/** Stable kind id; it appears in Trigger `source`, Thread-key prefixes and the settings block. */
export const MAIN_WINDOW = 'main-window'
/** No settings: everything this kind carries arrives in the dispatched Trigger itself. */
const ConfigSchema = z.object({}).strict()
export type MainWindowConfig = z.infer<typeof ConfigSchema>

export const mainWindowKind: SourceKind<MainWindowConfig> = {
  kind: MAIN_WINDOW,
  title: { zh: '主窗口', en: 'Main window' },
  description: {
    zh: '由主会话通过管理接口直接派发的任务；不轮询通道，也不需要账号。',
    en: 'Tasks the main Session dispatches over the management API; polls no channel and needs no account.',
  },
  schema: ConfigSchema,
  fields: [],
  // Nothing reports health for this kind: it has no loop that can stall, so it must not occupy a health entry.
  health: [],
}

export const name = 'dsh-superagent-main-window'
export const inject = ['orchestrator']
export function apply(ctx: Context): void {
  ctx.effect(() => ctx.orchestrator.sources.register(mainWindowKind), 'main-window: source kind')
}
