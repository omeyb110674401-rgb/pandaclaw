/**
 * AgentHost：PandaClaw 对 dsh 底座（agents/tools/team）的装配抽象面.
 *
 * 模块化 A 阶段（grilling Q17–Q23）：依赖可替换的契约显式化——业务层
 * （会议核心/复审领域类）只依赖本接口，把「装备工具、创建替身、枚举、
 * 清理」对底座的实现收敛到装配层（makeAgentHost）。替换底座实现＝换一个
 * 满足本契约的 AgentHost，业务代码零改动.
 *
 * makeAgentHost 收编：替身 spawn 注册表（Q10-A/Q10-C）、equip 机制
 * （agent/created 分发 + tools.register）、5B dispose 监听（Q5-B）、
 * 启动恢复钩子（Q1/Q11）与统一清理（Q23-A）.
 */

import type { Agent } from '@deepseek-ai/dsh-agent'
import type { Context } from '@deepseek-ai/cordis'
import type { PandaClawService } from './service.ts'

/** 审查替身专用 preset（ADR-0010）：服务层 spawn、seed 空、setup 代码注入结构化审查包. */
export const REVIEWER_PRESET = 'pc-reviewer'

/** 用户监督替身专用 preset（ADR-0009/0010）：只装监督工具面. */
export const SUPERVISOR_STANDIN_PRESET = 'pc-supervisor-standin'

/**
 * 审查替身 spawn 钩子（ADR-0010 策略一：服务层全自动，不经任何 AI）.
 * 旧装配面（index.ts stage≤4 / 测试桩注入）；`standinSpawnerHost` 将其
 * 适配为 {@link AgentHost}。钩子只负责「派发」，不等待替身产出
 * （替身异步直写服务层完成闭环）.
 */
export interface ReviewSpawner {
  /**
   * 派发一个审查替身（preset `pc-reviewer`，seed 空、setup 代码硬编码——只接收
   * 服务层构造的结构化审查包，不见任何原始自由文本）.
   * @param docId - 被审查案卷号（审查包内唯一自由化输入，由服务层校验格式）.
   * @param review - 结构化审查包（决议原文/票况/规约核对结果等代码选取字段）.
   */
  spawnReviewer(docId: string, review: Readonly<Record<string, unknown>>): Promise<void>
  /**
   * 销毁某案卷的审查替身会话（ADR-0011 Q10-A：交卷/回滚/废弃时服务层调用；
   * 底座 handle.dispose 幂等，并触发 `agent/disposed`——主动销毁时档案状态
   * 已离开 reviewing/accepted，5B 兜底条件天然不触发）.
   * @param docId - 案卷号（spawn 登记表的键）.
   */
  disposeReviewer(docId: string): Promise<void>
  /**
   * 清理全部替身死会话（ADR-0011 Q10-C：启动扫描调用；进程重启后必然无驱动者）.
   */
  disposeAllStandins?(): Promise<void>
}

/**
 * 用户监督替身 spawn 钩子（ADR-0010 第 9 节，Q8-B：tally 门二受阻时服务层自动 spawn）.
 * 旧装配面；`standinSpawnerHost` 适配为 {@link AgentHost}.
 */
export interface SupervisorSpawner {
  /**
   * 派发一个用户监督替身（preset `pc-supervisor-standin`，seed 空、setup 代码硬编码）.
   * @param docId - 当前 ⭐ 阶段所在案卷号.
   * @param stage - 拟计票阶段标识.
   * @param round - 拟计票轮次.
   */
  spawnSupervisor(docId: string, stage: string, round: number): Promise<void>
  /**
   * 销毁某案卷的监督替身会话（ADR-0011 Q12：门二窗口关闭/交卷后清理）.
   * @param docId - 案卷号.
   */
  disposeSupervisor?(docId: string): Promise<void>
  /**
   * 清理全部监督替身死会话（ADR-0011 Q10-C/Q12）.
   */
  disposeAllStandins?(): Promise<void>
}

/**
 * 对 dsh 底座的装配抽象（Q19-Q23）：装备工具 + 创建替身 + 枚举会话 + 统一清理.
 * 实现（makeAgentHost）收编 spawn 注册表、equip 机制、5B dispose 监听与
 * 启动恢复钩子；业务层只调用本接口，不触碰 ctx.agents/tools.
 */
export interface AgentHost {
  /**
   * 装备一组工具到一个代理作用域（一次性安装）.
   * @param agent - 目标会话代理.
   * @param factories - 工具工厂（闭包持有服务句柄）.
   * @returns 撤装 disposer.
   */
  equip(agent: Agent, factories: readonly ToolFactory[]): () => void
  /**
   * 注册装备策略：今后创建的匹配会话自动获得工具面（含现存会话补装）.
   * @param match - 会话准入判定.
   * @param factories - 工具工厂集.
   * @returns 注销 disposer（撤下全部已装工具并停止后续分发；Q23 清注册）.
   */
  registerEquip(match: (agent: Agent) => boolean, factories: readonly ToolFactory[]): () => void
  /**
   * 创建替身会话（审查/监督；seed 空、setup 代码注入，不经任何 AI）.
   * @param kind - 替身种类（决定标准简报与 preset 缺省值）.
   * @param docId - 所属案卷号.
   * @param opts - preset（缺省按 kind）、简报覆写与结构化载荷.
   * @returns 可销毁 handle（宿主同时登记，按案卷可整批清理）.
   */
  createStandin(kind: 'reviewer' | 'supervisor', docId: string, opts: {
    readonly preset?: string
    readonly brief?: string
    readonly payload?: Readonly<Record<string, unknown>>
  }): Promise<{ dispose(): Promise<void> }>
  /**
   * 销毁某案卷的替身会话（Q10-A：交卷/回滚/废弃时调用；幂等）.
   * @param docId - 案卷号（spawn 登记表的键）.
   * @param kind - 缺省两类都销毁.
   */
  disposeStandin(docId: string, kind?: 'reviewer' | 'supervisor'): Promise<void>
  /** 清理全部替身死会话（ADR-0011 Q10-C：启动扫描调用；进程重启后必然无驱动者）. */
  disposeAllStandins(): Promise<void>
  /** 枚举现存替身（启动清理/恢复用与测试）. */
  listStandins(): readonly { readonly sessionId: string; readonly kind: 'reviewer' | 'supervisor'; readonly docId: string }[]
  /**
   * 注册替身会话意外销毁回调（5B 兜底：agent/disposed 时宿主转发；仅审查替身触发）.
   * @param cb - 回调查看：kind（恒 reviewer）与 docId.
   * @returns 注销 disposer.
   */
  onStandinDisposed(cb: (info: { readonly kind: 'reviewer'; readonly docId: string }) => void): () => void
  /** 统一清理：销毁全部替身 + 撤全部装备注册 + 移除监听（Q23-A）. */
  dispose(): Promise<void>
}

/** 工具工厂签名（equip 机制的类型依据；闭包持有会议服务句柄）. */
export type ToolFactory = (svc: PandaClawService) => Record<string, unknown>

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

/** 无 node 依赖的会话 id 后缀（第三方插件不引 @types/node）. */
function shortId(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
}

/** 审查替身标准简报（提示词属装配层机制；opts.brief 可覆写）. */
function reviewerBrief(payload: Readonly<Record<string, unknown>>): string {
  return '你是 PandaClaw 备案审查复审判卷的审查替身（`pc-reviewer`）。'
    + '职责：依据下发的结构化审查包，对已归档案卷的决议作出审查判断——'
    + '维持／建议修订／建议解释（三分类；认为应撤销的决议并入「建议修订重议」并在处置清单注明），'
    + '并给出逐条处置清单。只审查下发数据，绝不猜测案卷记录流里的其他内容；'
    + '审查结论是建议性意见，最终由用户三选裁量。完成后调用 pc_review_verdict 直写审查意见（≤600 字）。\n\n'
    + `【结构化审查包】\n${JSON.stringify(payload)}`
}

/** 监督替身标准简报（提示词属装配层机制；opts.brief 可覆写）. */
function supervisorBrief(docId: string): string {
  return '你是 PandaClaw 用户监督替身（`pc-supervisor-standin`）：用户缺席该轮 ⭐ 阶段的监督窗口（无本人回应），'
    + '你以其民众监督者立场对当前阶段议题提一条监督质疑。只提监督质疑（风险/遗漏/程序关切），'
    + '禁止代替用户表达赞成或反对立场；意见不算票、可被用户追认或撤回。'
    + `当前案卷：${docId}。完成后调用 pc_supervise 直写（≤300 字）。`
}

/**
 * 以行上下文装配真实 AgentHost（Q21-A：装配层函数）.
 *
 * 收编 spawn 注册表（sessionId→{kind,docId,dispose}）、equip 机制（agent/created
 * 分发 + 现存会话补装 + agent/disposed 撤装）、5B dispose 监听（agent/disposed
 * 时审查替身触发 {@link AgentHost.onStandinDisposed}，两类都清簿记）、启动恢复
 * 钩子（options.onStartup 延迟一拍执行一次）与统一清理（Q23-A）.
 * @param ctx - 行上下文（agents/tools 已由插件 inject 保证在场）.
 * @param options - 可选启动恢复回调（装配完成后延迟一拍执行一次，主机可惰性
 * 访问已挂载服务，如 `ctx.pandaclaw.recoverReviews`）.
 */
export function makeAgentHost(ctx: Context, options: { readonly onStartup?: () => void } = {}): AgentHost {
  /** 替身登记表：sessionId → 注册项（Q10-A 主动销毁 / Q10-C 整批清理 / 5B 反查）. */
  const standins = new Map<string, {
    readonly kind: 'reviewer' | 'supervisor'
    readonly docId: string
    dispose(): Promise<void>
  }>()
  /** 装备策略（Q22-A：机制在本层，策略由调用方 registerEquip 注入）. */
  const equips: Array<{
    readonly match: (agent: Agent) => boolean
    readonly factories: readonly ToolFactory[]
    equipped: Map<string, () => void>
  }> = []
  /** 5B 兜底回调集（仅审查替身触发）. */
  const disposedCbs = new Set<(info: { readonly kind: 'reviewer'; readonly docId: string }) => void>()
  let started = false
  let startTimer: ReturnType<typeof setTimeout> | undefined

  const equipAgent = (agent: Agent): void => {
    for (const policy of equips) {
      if (!policy.match(agent) || policy.equipped.has(agent.id)) continue
      policy.equipped.set(agent.id, installTools(agent, policy.factories))
    }
  }

  const createdDisposer = ctx.on('agent/created', (payload: { readonly agent: Agent }) => { equipAgent(payload.agent) })
  // 5B dispose 兜底（ADR-0011 Q5-B）：审查替身会话意外销毁（非主动 dispose）时
  // 清簿记并通知服务层回滚重泵；主动 dispose（交卷/restart）时档案状态已离开
  // reviewing/accepted，服务层条件天然不触发。监督替身只清簿记（门二可重试）.
  const disposedDisposer = ctx.on('agent/disposed', (payload: { readonly agent: Agent }) => {
    const entry = standins.get(String(payload.agent.id))
    if (entry === undefined) return
    standins.delete(String(payload.agent.id))
    if (entry.kind === 'reviewer') {
      for (const cb of disposedCbs) {
        try {
          cb({ kind: 'reviewer', docId: entry.docId })
        } catch {
          // 回调失败不影响簿记清理；服务层兜底自带错误吞没（catch → undefined）.
        }
      }
    }
  })

  if (options.onStartup !== undefined) {
    // 启动恢复（ADR-0011 Q1/Q11）：装配完成后延迟一拍执行（agents/preset 就绪）；
    // 全员失败 loud 由服务层负责.
    startTimer = setTimeout(() => {
      started = true
      try {
        options.onStartup?.()
      } catch {
        // 启动钩子失败静默（服务层自含 loud 与回滚语义）.
      }
    }, 0)
  }

  return {
    equip(agent, factories) {
      return installTools(agent, factories)
    },

    registerEquip(match, factories) {
      const policy: (typeof equips)[number] = { match, factories, equipped: new Map() }
      equips.push(policy)
      for (const agent of ctx.agents.list()) equipAgent(agent) // 现存会话补装
      return () => {
        const index = equips.indexOf(policy)
        if (index >= 0) equips.splice(index, 1)
        for (const [, dispose] of policy.equipped) dispose()
        policy.equipped.clear()
      }
    },

    async createStandin(kind, docId, opts) {
      const preset = opts.preset ?? (kind === 'reviewer' ? REVIEWER_PRESET : SUPERVISOR_STANDIN_PRESET)
      const sessionId = `subagent-${kind === 'reviewer' ? 'review' : 'supervisor'}-${docId}-${shortId()}` as never
      const handle = await ctx.agents.create({
        sessionId,
        meta: { origin: 'subagent', agentPreset: preset },
        setup: agentCtx => {
          agentCtx.systemPrompt.section({
            name: kind === 'reviewer' ? 'pandaclaw-reviewer-brief' : 'pandaclaw-supervisor-brief',
            order: 10,
            text: opts.brief ?? (kind === 'reviewer'
              ? reviewerBrief(opts.payload ?? {})
              : supervisorBrief(docId)),
          })
        },
      })
      const registered = { kind, docId, dispose: () => handle.dispose() }
      standins.set(String(sessionId), registered)
      return { dispose: () => handle.dispose() }
    },

    async disposeStandin(docId, kind) {
      for (const [sessionId, entry] of standins) {
        if (entry.docId !== docId) continue
        if (kind !== undefined && entry.kind !== kind) continue
        standins.delete(sessionId)
        await entry.dispose()
      }
    },

    async disposeAllStandins() {
      for (const [, entry] of standins) await entry.dispose()
      standins.clear()
    },

    listStandins() {
      return [...standins.entries()].map(([sessionId, entry]) => ({
        sessionId, kind: entry.kind, docId: entry.docId,
      }))
    },

    onStandinDisposed(cb) {
      disposedCbs.add(cb)
      return () => { disposedCbs.delete(cb) }
    },

    async dispose() {
      await this.disposeAllStandins()
      for (const policy of equips) {
        for (const [, dispose] of policy.equipped) dispose()
        policy.equipped.clear()
      }
      equips.length = 0
      disposedCbs.clear()
      createdDisposer()
      disposedDisposer()
      if (startTimer !== undefined) clearTimeout(startTimer)
      started = true
    },
  }
}

/**
 * 旧 spawn 钩子 → AgentHost 适配（Q11-A 测试兼容 / 旧装配面过渡）.
 * 缺 hook 的种类在 createStandin 时抛错（由调用方按约束捕获）.
 * @param spawner - 审查替身钩子（可缺）.
 * @param supervisorSpawner - 监督替身钩子（可缺）.
 */
export function standinSpawnerHost(spawner?: ReviewSpawner, supervisorSpawner?: SupervisorSpawner): AgentHost {
  return {
    equip() {
      return () => undefined
    },
    registerEquip() {
      return () => undefined
    },
    async createStandin(kind, docId, opts) {
      if (kind === 'reviewer') {
        if (spawner === undefined) throw new Error('审查替身钩子未装配（spawner）')
        await spawner.spawnReviewer(docId, opts.payload ?? {})
        return { dispose: async () => undefined }
      }
      if (supervisorSpawner === undefined) throw new Error('监督替身钩子未装配（supervisorSpawner）')
      await supervisorSpawner.spawnSupervisor(docId, '', 0)
      return { dispose: async () => undefined }
    },
    async disposeStandin(docId, kind) {
      if (kind !== 'supervisor' && spawner !== undefined) await spawner.disposeReviewer(docId)
      if (kind !== 'reviewer' && supervisorSpawner?.disposeSupervisor !== undefined) await supervisorSpawner.disposeSupervisor(docId)
    },
    async disposeAllStandins() {
      await spawner?.disposeAllStandins?.()
      await supervisorSpawner?.disposeAllStandins?.()
    },
    listStandins() {
      return []
    },
    onStandinDisposed() {
      return () => undefined
    },
    async dispose() {
      await this.disposeAllStandins()
    },
  }
}