/**
 * dsh-pandaclaw：民主协商多智能体会议系统（dsh-team 之上的伴生插件）.
 *
 * 一行装配四件事：会议服务（自有记录域）、`pandaclaw` 会话投影、主持人
 * 工具面（pc_convene/stage/record/tally/adjourn/inspect/rebind 与复审
 * 工具面）、成员工具面（pc_submit/pc_vote/pc_review_statement，装进每个
 * 子代理作用域，按建会名单放行）。成员创建与消息投递不归本插件——那底座
 * 的事；程序与裁决归本插件——谁也绕不过.
 *
 * 底座装配抽象（模块化 A 阶段）：工具装备策略与替身派发全部收编进
 * AgentHost（makeAgentHost）——本文件只注册四组装备策略（策略留，
 * 机制进 host；Q22-A）与启动恢复桥接.
 */

import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-session-projection'
import type {} from '@deepseek-ai/dsh-system-prompt'
import type {} from '@deepseek-ai/dsh-tools'
import { PandaClawService } from './service.ts'
import { pcProjection } from './projection.ts'
import { reviewStatementTool, reviewTool, verdictTool } from './review-tools.ts'
import { adjournTool, conveneTool, inspectTool, recordTool, rebindTool, stageTool, submitTool, superviseTool, tallyTool, voteTool } from './tools.ts'
import {
  REVIEWER_PRESET, SUPERVISOR_STANDIN_PRESET, makeAgentHost, type ToolFactory,
} from './host.ts'

export const name = 'pandaclaw'

/**
 * `storageDomain` 是硬依赖（无记录域的会议系统没有约束力）；
 * `tools/systemPrompt` 声明使 Loader 顺序错误在装配期而非首个会话暴露.
 */
export const inject = ['agents', 'sessionProjections', 'storageDomain', 'tools', 'systemPrompt', 'session']

export { PandaClawService } from './service.ts'
export { ReviewService } from './review.ts'
export {
  REVIEWER_PRESET, SUPERVISOR_STANDIN_PRESET, makeAgentHost, standinSpawnerHost,
  type AgentHost, type ToolFactory, type ReviewSpawner, type SupervisorSpawner,
} from './host.ts'

/**
 * 工具工厂面（B′ 预设目录拼装复用；机制归宿主插件，策略随本导出供 preset 引用）.
 */
export function leaderFactories(): readonly ToolFactory[] {
  return [conveneTool, stageTool, recordTool, tallyTool, adjournTool, inspectTool, rebindTool, reviewTool]
}

/** A team chair is any ordinary session; teammates submit and vote only. */
function leads(agent: Agent): boolean {
  return agent.session.header.origin !== 'subagent'
}

/** 成员工具面（子代理作用域；名单外调用在服务层被拒）. */
export function memberFactories(): readonly ToolFactory[] {
  return [submitTool, voteTool, reviewStatementTool]
}

/** 用户监督替身工具面（ADR-0009）：`pc-supervisor-standin` preset 专用，只装监督工具. */
export function supervisorFactories(): readonly ToolFactory[] {
  return [superviseTool]
}

/** 审查替身工具面：只装审查意见直写工具，不碰成员/监督面. */
export function reviewerFactories(): readonly ToolFactory[] {
  return [verdictTool]
}

/**
 * 装配插件行.
 * @param ctx - 行上下文（inject 列出的服务均已就绪）.
 */
export function apply(ctx: Context): void {
  // 底座装配面（模块化 A 阶段 Q21-Q23）：替身派发/工具装备/5B 监听/启动恢复
  // 全在 AgentHost；本行只注册装备策略与桥接回调.
  const host = makeAgentHost(ctx, {
    // 启动恢复（ADR-0011 Q1/Q11）：装配完成后延迟一拍执行（agents/preset 就绪）；
    // 全员失败 loud 由 ReviewService 负责（此处惰性访问已挂载的服务）.
    onStartup: () => void ctx.pandaclaw.recoverReviews().catch(() => undefined),
  })
  ctx.plugin(PandaClawService, { host })
  ctx.effect(() => () => void host.dispose(), 'pandaclaw: agent host cleanup')
  ctx.inject(['pandaclaw'], (pc: Context) => {
    pc.effect(
      // 'pandaclaw' 是第三方自定义键，不在宿主封闭键映射内；运行时注册器
      // 按 wire schema 结构校验，此处一次显式桥接.
      () => pc.sessionProjections.register(pcProjection() as unknown as Parameters<typeof pc.sessionProjections.register>[0]),
      'pandaclaw: durable projection unit',
    )
    pc.effect(() => () => { void pc.pandaclaw.dispose() }, 'pandaclaw: domain release')
    // 5B dispose 兜底（ADR-0011 Q5-B）：宿主 agent/disposed 监听仅审查替身触发
    // 回调，桥接到服务层（服务层条件不满足时静默）.
    pc.effect(
      () => host.onStandinDisposed(info => {
        void pc.pandaclaw.handleStandinDisposed(info.docId).catch(() => undefined)
      }),
      'pandaclaw: reviewer dispose fallback',
    )
    // 装备策略（Q22-A：机制进 host，策略留本层）——四组：主持人/监督替身/
    // 审查替身/成员面；registerEquip 自带现存会话补装与 agent/created 分发.
    pc.effect(
      () => host.registerEquip(leads, leaderFactories()),
      'pandaclaw: leader tools',
    )
    // 用户监督替身（ADR-0009/0010）：专用 preset 的子代理只装监督面，不进入成员面
    // （成员面会装 vote/submit，替身不是投票成员）；spawn 由服务层在 tally 门二受阻时自动完成.
    pc.effect(
      () => host.registerEquip(agent => {
        if (leads(agent)) return false
        return agent.session.header.agentPreset === SUPERVISOR_STANDIN_PRESET
      }, supervisorFactories()),
      'pandaclaw: supervisor-standin tools',
    )
    // 审查替身（ADR-0010）：`pc-reviewer` preset 只装审查意见直写工具，进不了成员面/监督面.
    pc.effect(
      () => host.registerEquip(agent => {
        if (leads(agent)) return false
        return agent.session.header.agentPreset === REVIEWER_PRESET
      }, reviewerFactories()),
      'pandaclaw: reviewer tools',
    )
    pc.effect(
      () => host.registerEquip(agent => {
        if (leads(agent)) return false
        const preset = agent.session.header.agentPreset
        return preset !== SUPERVISOR_STANDIN_PRESET && preset !== REVIEWER_PRESET
      }, memberFactories()),
      'pandaclaw: member tools',
    )
  })
}