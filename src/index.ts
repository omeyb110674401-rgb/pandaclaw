/**
 * dsh-pandaclaw：民主协商多智能体会议系统（dsh-team 之上的伴生插件）.
 *
 * 一行装配四件事：会议服务（自有记录域）、`pandaclaw` 会话投影、主持人
 * 工具面（pc_convene/stage/record/tally/adjourn/inspect/rebind）、成员工具面（pc_submit/
 * pc_vote，装进每个子代理作用域，按建会名单放行）。成员创建与消息投递
 * 不归本插件——那底座的事；程序与裁决归本插件——谁也绕不过.
 */

import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-session-projection'
import type {} from '@deepseek-ai/dsh-system-prompt'
import type {} from '@deepseek-ai/dsh-tools'
import { PandaClawService } from './service.ts'
import { pcProjection } from './projection.ts'
import { adjournTool, conveneTool, inspectTool, recordTool, rebindTool, stageTool, submitTool, superviseTool, tallyTool, voteTool } from './tools.ts'

export const name = 'pandaclaw'

/**
 * `storageDomain` 是硬依赖（无记录域的会议系统没有约束力）；
 * `tools/systemPrompt` 声明使 Loader 顺序错误在装配期而非首个会话暴露.
 */
export const inject = ['agents', 'sessionProjections', 'storageDomain', 'tools', 'systemPrompt']

export { PandaClawService }

/** A team chair is any ordinary session; teammates submit and vote only. */
function leads(agent: Agent): boolean {
  return agent.session.header.origin !== 'subagent'
}

/**
 * 工具定义的桥接：宿主 ToolDefinition 的字面量联合约束对第三方工厂过窄，
 * 这里做显式桥接并守住「必备回调齐全」这条底线；深度形状由注册器自身的
 * schema 校验负责.
 */
function asTool(def: Record<string, unknown>): Parameters<Context['tools']['register']>[0] {
  const name = String(def.name ?? '<unnamed>')
  const output = def.output as { readonly schema?: unknown; readonly render?: unknown } | undefined
  if (typeof def.execute !== 'function' || output === undefined || output.schema === undefined || typeof output.render !== 'function') {
    throw new Error(`PandaClaw 工具定义不完整（缺 execute/output.schema/output.render）：${name}`)
  }
  return def as unknown as Parameters<Context['tools']['register']>[0]
}

type ToolFactory = (svc: PandaClawService) => Record<string, unknown>

/**
 * 把一组工具装进一个代理自己的作用域.
 * @param agent - 目标会话代理.
 * @param factories - 工具工厂（闭包持有服务句柄）.
 * @returns 卸载 disposer.
 */
function installTools(agent: Agent, factories: readonly ToolFactory[]): () => void {
  const svc = agent.ctx.pandaclaw
  const disposers = factories.map(factory => agent.ctx.tools.register(asTool(factory(svc))))
  return () => {
    for (const dispose of disposers.reverse()) dispose()
  }
}

/** 主持人工具面（普通会话专属；子代理永远不是主席台）. */
function leaderFactories(): readonly ToolFactory[] {
  return [conveneTool, stageTool, recordTool, tallyTool, adjournTool, inspectTool, rebindTool]
}

/** 成员工具面（子代理作用域；名单外调用在服务层被拒）. */
function memberFactories(): readonly ToolFactory[] {
  return [submitTool, voteTool]
}

/** 用户监督替身工具面（ADR-0009）：以 `pc-supervisor-standin` preset 创建的替身专用，只装监督工具，不碰投票/成员产物. */
const SUPERVISOR_STANDIN_PRESET = 'pc-supervisor-standin'

function supervisorFactories(): readonly ToolFactory[] {
  return [superviseTool]
}

/**
 * 为现有与后续的匹配会话装备工具，直到本注册被卸载.
 * @param ctx - 行上下文.
 * @param match - 会话准入判定.
 * @param factories - 工具工厂集.
 * @returns disposer：撤下所有存活会话上的工具.
 */
function equipSessions(ctx: Context, match: (agent: Agent) => boolean, factories: readonly ToolFactory[]): () => void {
  const equipped = new Map<string, () => void>()
  const equip = (agent: Agent): void => {
    if (!match(agent) || equipped.has(agent.id)) return
    equipped.set(agent.id, installTools(agent, factories))
  }
  ctx.on('agent/created', (payload: { readonly agent: Agent }) => { equip(payload.agent) })
  ctx.on('agent/disposed', (payload: { readonly agent: Agent }) => { equipped.delete(payload.agent.id) })
  for (const agent of ctx.agents.list()) equip(agent)
  return () => {
    for (const dispose of equipped.values()) dispose()
    equipped.clear()
  }
}

/**
 * 装配插件行.
 * @param ctx - 行上下文（inject 列出的服务均已就绪）.
 */
export function apply(ctx: Context): void {
  ctx.plugin(PandaClawService)
  ctx.inject(['pandaclaw'], (pc: Context) => {
    pc.effect(
      // 'pandaclaw' 是第三方自定义键，不在宿主封闭键映射内；运行时注册器
      // 按 wire schema 结构校验，此处一次显式桥接.
      () => pc.sessionProjections.register(pcProjection() as unknown as Parameters<typeof pc.sessionProjections.register>[0]),
      'pandaclaw: durable projection unit',
    )
    pc.effect(() => () => { void pc.pandaclaw.dispose() }, 'pandaclaw: domain release')
    pc.effect(
      () => equipSessions(pc, leads, leaderFactories()),
      'pandaclaw: leader tools',
    )
    // 用户监督替身（ADR-0009）：专用 preset 的子代理只装监督面，不进入成员面
    // （成员面会装 vote/submit，替身不是投票成员）.
    pc.effect(
      () => equipSessions(pc, agent => {
        if (leads(agent)) return false
        return agent.session.header.agentPreset === SUPERVISOR_STANDIN_PRESET
      }, supervisorFactories()),
      'pandaclaw: supervisor-standin tools',
    )
    pc.effect(
      () => equipSessions(pc, agent => {
        if (leads(agent)) return false
        return agent.session.header.agentPreset !== SUPERVISOR_STANDIN_PRESET
      }, memberFactories()),
      'pandaclaw: member tools',
    )
  })
}
