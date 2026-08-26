/**
 * dsh-pandaclaw：民主协商多智能体会议系统（dsh-team 之上的伴生插件）.
 *
 * 一行装配四件事：会议服务（自有记录域）、`pandaclaw` 会话投影、主持人
 * 工具面（pc_convene/stage/record/tally/adjourn/inspect/rebind）、成员工具面（pc_submit/
 * pc_vote，装进每个子代理作用域，按建会名单放行）。成员创建与消息投递
 * 不归本插件——那底座的事；程序与裁决归本插件——谁也绕不过.
 *
 * 替身派发（ADR-0010 策略一）：审查替身与监督替身均由服务层 spawn——插件装配
 * 时把 `ctx.agents.create` 以硬编码参数（seed 空 + setup 代码注入）桥接给服务层
 * 的 spawn 钩子；任何 AI（主持人/用户会话）都不生成替身的提示词或参数。
 */

import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-session-projection'
import type {} from '@deepseek-ai/dsh-system-prompt'
import type {} from '@deepseek-ai/dsh-tools'
import { PandaClawService } from './service.ts'
import { pcProjection } from './projection.ts'
import { adjournTool, conveneTool, inspectTool, recordTool, rebindTool, reviewStatementTool, reviewTool, stageTool, submitTool, superviseTool, tallyTool, verdictTool, voteTool } from './tools.ts'

export const name = 'pandaclaw'

/** 无 node 依赖的会话 id 后缀（第三方插件不引 @types/node）. */
function shortId(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
}

/**
 * `storageDomain` 是硬依赖（无记录域的会议系统没有约束力）；
 * `tools/systemPrompt` 声明使 Loader 顺序错误在装配期而非首个会话暴露.
 */
export const inject = ['agents', 'sessionProjections', 'storageDomain', 'tools', 'systemPrompt', 'session']

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
  return [conveneTool, stageTool, recordTool, tallyTool, adjournTool, inspectTool, rebindTool, reviewTool]
}

/** 成员工具面（子代理作用域；名单外调用在服务层被拒）. */
function memberFactories(): readonly ToolFactory[] {
  return [submitTool, voteTool, reviewStatementTool]
}

/** 用户监督替身工具面（ADR-0009）：以 `pc-supervisor-standin` preset 创建的替身专用，只装监督工具，不碰投票/成员产物. */
const SUPERVISOR_STANDIN_PRESET = 'pc-supervisor-standin'

function supervisorFactories(): readonly ToolFactory[] {
  return [superviseTool]
}

/** 审查替身专用 preset（ADR-0010）：服务层 spawn、seed 空、setup 代码注入结构化审查包. */
const REVIEWER_PRESET = 'pc-reviewer'

/** 审查替身工具面：只装审查意见直写工具，不碰成员/监督面. */
function reviewerFactories(): readonly ToolFactory[] {
  return [verdictTool]
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
  // 服务层 spawn 钩子（ADR-0010 策略一）：审查替身/监督替身一律由宿主机械创建——
  // seed 空、setup 代码注入，任何 AI 都不生成替身参数.
  ctx.plugin(PandaClawService, {
    spawner: {
      async spawnReviewer(docId, review) {
        const sessionId = `subagent-review-${docId}-${shortId()}` as never
        await ctx.agents.create({
          sessionId,
          meta: { origin: 'subagent', agentPreset: REVIEWER_PRESET },
          setup: agentCtx => {
            const payload = JSON.stringify(review)
            agentCtx.systemPrompt.section({
              name: 'pandaclaw-reviewer-brief',
              order: 10,
              text: '你是 PandaClaw 备案审查复审判卷的审查替身（`pc-reviewer`）。'
                + '职责：依据下发的结构化审查包，对已归档案卷的决议作出审查判断——维持／建议修订／建议解释／建议驳回，'
                + '并给出逐条处置清单。只审查下发数据，绝不猜测案卷记录流里的其他内容；'
                + '审查结论是建议性意见，最终由用户三选裁量。完成后调用 pc_review_verdict 直写审查意见（≤600 字）。\n\n'
                + `【结构化审查包】\n${payload}`,
            })
          },
        })
      },
    },
    supervisorSpawner: {
      async spawnSupervisor(docId, _stage, _round) {
        const sessionId = `subagent-supervisor-${docId}-${shortId()}` as never
        await ctx.agents.create({
          sessionId,
          meta: { origin: 'subagent', agentPreset: SUPERVISOR_STANDIN_PRESET },
          setup: agentCtx => {
            agentCtx.systemPrompt.section({
              name: 'pandaclaw-supervisor-brief',
              order: 10,
              text: '你是 PandaClaw 用户监督替身（`pc-supervisor-standin`）：用户缺席该轮 ⭐ 阶段的监督窗口（无本人回应），'
                + '你以其民众监督者立场对当前阶段议题提一条监督质疑。只提监督质疑（风险/遗漏/程序关切），'
                + '禁止代替用户表达赞成或反对立场；意见不算票、可被用户追认或撤回。'
                + `当前案卷：${docId}。完成后调用 pc_supervise 直写（≤300 字）。`,
            })
          },
        })
      },
    },
  })
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
    // 用户监督替身（ADR-0009/0010）：专用 preset 的子代理只装监督面，不进入成员面
    // （成员面会装 vote/submit，替身不是投票成员）；spawn 由服务层在 tally 门二受阻时自动完成.
    pc.effect(
      () => equipSessions(pc, agent => {
        if (leads(agent)) return false
        return agent.session.header.agentPreset === SUPERVISOR_STANDIN_PRESET
      }, supervisorFactories()),
      'pandaclaw: supervisor-standin tools',
    )
    // 审查替身（ADR-0010）：`pc-reviewer` preset 只装审查意见直写工具，进不了成员面/监督面.
    pc.effect(
      () => equipSessions(pc, agent => {
        if (leads(agent)) return false
        return agent.session.header.agentPreset === REVIEWER_PRESET
      }, reviewerFactories()),
      'pandaclaw: reviewer tools',
    )
    pc.effect(
      () => equipSessions(pc, agent => {
        if (leads(agent)) return false
        const preset = agent.session.header.agentPreset
        return preset !== SUPERVISOR_STANDIN_PRESET && preset !== REVIEWER_PRESET
      }, memberFactories()),
      'pandaclaw: member tools',
    )
  })
}
