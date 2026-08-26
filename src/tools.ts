/**
 * PandaClaw 模型工具面：主持人五件套 + 成员两件套.
 *
 * 工具描述即协议教学：模型只看得到这里与技能正文，因此每个工具的
 * description 自含使用时机与前后置。所有协议裁决在服务层完成，本文件
 * 只做参数转译、错误码翻译与结果渲染.
 */

import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { PcFact } from './contract.ts'
import { PcError } from './errors.ts'
import type { PandaClawService } from './service.ts'
import { TIER_ROSTER, WORD_LIMITS, MAX_ROUNDS_PER_STAGE, type MeetingType } from './protocol.ts'

/** 工具执行上下文里本插件消费的最小切片. */
interface Exec {
  readonly agent: Agent
  readonly signal: AbortSignal
}

/** 把协议错误翻译为带错误码的失败结果文本；其余异常原样上抛. */
function translate(error: unknown): never {
  if (error instanceof PcError) throw new Error(`[PANDACLAW/${error.code}] ${error.message}`)
  throw error
}

const TIER_HINT = Object.entries(TIER_ROSTER)
  .map(([tier, roster]) => `${tier}=${roster.cppcc}+${roster.npc}`).join('；')

/** PcFact 输出契约的 schema 类型（字面量收窄、enum 保持可变数组）. */
type FactSchema = {
  type: 'object'
  properties: { readonly [key: string]: { type: 'string'; enum: string[] } | { type: 'object' } }
  additionalProperties: false
}

/**
 * 工具输出值契约：PcFact 形状的宽松 JSON Schema.
 * @param tag - 事实判别标签（meeting/record/tally）.
 */
const FACT_SCHEMA = (tag: string): FactSchema => ({
  type: 'object',
  properties: { pc: { type: 'string', enum: [tag] }, [tag]: { type: 'object' } },
  additionalProperties: false,
})

/** 非事实型返回值（如 pc_inspect 档案详情）的宽松对象契约. */
const LOOSE_OBJECT: { type: 'object' } = { type: 'object' }

/** 主持人：建会（分配文号＋初始化阶段机）. */
export function conveneTool(svc: PandaClawService) {
  return {
    name: 'pc_convene',
    description:
      'PandaClaw 建会：宣布开会并为议题分配正式文号（PC-{类型}〔年〕{序号}号），初始化该类型的阶段状态机。'
      + `类型 MIN纪要/RES决议/CON协商/PLA规划/STR战略/LEG立法；编制档位 ${TIER_HINT}（cppcc 提案方+npc 审查方，人数必须与档位一致）。`
      + '先和用户确定类型/议题/档位再调用；建会后按返回的阶段表组织成员（成员创建与消息投递交给 team_* 底座工具，全部 managed）.',
    parameters: {
      type: { type: 'string', required: true, enum: ['MIN', 'RES', 'CON', 'PLA', 'STR', 'LEG'], description: '会议类型代号.' },
      topic: { type: 'string', required: true, description: '议题一句话（小切口原则）.' },
      tier: { type: 'string', enum: ['simple', 'medium', 'complex', 'enterprise'], description: `复杂度档位；缺省 medium.` },
      validation: { type: 'string', enum: ['full', 'key', 'skip'], description: '验收模式；缺省按类型默认（MIN/RES=skip，CON/PLA=key，STR/LEG=full）.' },
      cppccNames: { type: 'string', required: true, description: '政协委员名单，逗号分隔自报名（如「架构师,安全工程师」）；人数须等于档位 cppcc 编制.' },
      npcNames: { type: 'string', required: true, description: '人大代表名单，逗号分隔；人数须等于档位 npc 编制.' },
    },
    output: {
      schema: FACT_SCHEMA('meeting'),
      render: (_args: unknown, value: { pc: 'meeting'; meeting: { docId: string; type: MeetingType; stages: readonly { label: string; state: string }[] } }) => [{
        type: 'text',
        text: `已开会议 ${value.meeting.docId}（${value.meeting.type}）。当前阶段：${value.meeting.stages.find(stage => stage.state === 'active')?.label ?? '—'}。`
          + '下一步：用 team_spawn 按 persona 模板组建 managed 成员，然后推进流程（⭐ 阶段由成员 pc_submit 交产物、npc 用 pc_vote 表决）.',
      }],
      presentationMeta: (_args: unknown, value: PcFact) => value,
    },
    isConcurrencySafe: () => false,
    async execute(args: { readonly type: MeetingType; readonly topic: string; readonly tier?: 'simple' | 'medium' | 'complex' | 'enterprise'; readonly validation?: 'full' | 'key' | 'skip'; readonly cppccNames: string; readonly npcNames: string }, exec: Exec) {
      try {
        const splitNames = (raw: string): string[] => raw.split(/[,，、]/).map(name => name.trim()).filter(name => name.length > 0)
        return await svc.convene(String(exec.agent.id), {
          type: args.type,
          topic: args.topic,
          ...(args.tier !== undefined ? { tier: args.tier } : {}),
          ...(args.validation !== undefined ? { validation: args.validation } : {}),
          cppccNames: splitNames(args.cppccNames),
          npcNames: splitNames(args.npcNames),
        })
      } catch (error) {
        translate(error)
      }
    },
  }
}

/** 主持人：阶段机推进（advance 进入下一阶段 / round 回路开启新一轮）. */
export function stageTool(svc: PandaClawService) {
  return {
    name: 'pc_stage',
    description:
      'PandaClaw 阶段推进。action=advance：当前阶段收尾并进入下一阶段（只能沿阶段流前进，禁止跳步；离开 STR 内圈须先有 ruling 裁定锚点）；'
      + `action=round：当前 ⭐ 回路阶段打回重议开启新一轮（同一议题至多 ${MAX_ROUNDS_PER_STAGE} 轮，三审制上限）。`
      + '表决未通过时：先用 pc_record 登记 focus（反对焦点提炼），再调 pc_stage round 开新一轮.',
    parameters: {
      docId: { type: 'string', required: true, description: '文号.' },
      action: { type: 'string', required: true, enum: ['advance', 'round'], description: 'advance=进入下一阶段；round=当前回路阶段重开一轮.' },
    },
    output: {
      schema: FACT_SCHEMA('meeting'),
      render: (_args: unknown, value: { pc: 'meeting'; meeting: { docId: string; currentStage?: string; stages: readonly { id: string; label: string; state: string; round?: number }[] } }) => [{
        type: 'text',
        text: `${value.meeting.docId} 当前阶段：${
          (() => {
            const active = value.meeting.stages.find(stage => stage.state === 'active')
            return active === undefined ? '—' : `${active.label}${active.round === undefined ? '' : `（第 ${active.round} 轮）`}`
          })()
        }`,
      }],
      presentationMeta: (_args: unknown, value: PcFact) => value,
    },
    isConcurrencySafe: () => false,
    async execute(args: { readonly docId: string; readonly action: 'advance' | 'round' }, exec: Exec) {
      try {
        return await svc.stage(args.docId, args.action)
      } catch (error) {
        translate(error)
      }
    },
  }
}

/** 主持人：登记锚点产物（议程/出题/汇总/草案/焦点/决议）. */
export function recordTool(svc: PandaClawService) {
  return {
    name: 'pc_record',
    description:
      'PandaClaw 主持人锚点登记：把你在回路中产出的结构化节点写入会议档案——agenda 议题包 / issue 出题与意见汇总 / digest 质询汇总 / '
      + 'draft 草案 / focus 打回焦点清单 / resolution 决议或纪要成文要点 / ruling 三形态裁定（STR 内圈专用：原则通过／退回修改附意见清单／暂不讨论）。'
      + '这是阶段机的验收锚点：无 draft 不得付表决，内圈无 ruling 不得进入终审，无 resolution 不得归档.'
      + ' 内容取自板书结构化记录，禁止编造；全文入库供公文溯源.',
    parameters: {
      docId: { type: 'string', required: true, description: '文号.' },
      kind: { type: 'string', required: true, enum: ['agenda', 'issue', 'digest', 'draft', 'focus', 'resolution', 'ruling'], description: '锚点种类.' },
      text: { type: 'string', required: true, description: '登记内容（≤4000 字；决议至少含文号、票数明细、成文日期）.' },
      stage: { type: 'string', description: '归属阶段标识；缺省=当前活动阶段.' },
    },
    output: {
      schema: FACT_SCHEMA('record'),
      render: (_args: unknown, value: { pc: 'record'; record: { kind: string; stage: string } }) => [{
        type: 'text',
        text: `已登记 ${value.record.kind} 锚点（阶段 ${value.record.stage}）入档案.`,
      }],
      presentationMeta: (_args: unknown, value: PcFact) => value,
    },
    async execute(args: { readonly docId: string; readonly kind: 'agenda' | 'issue' | 'digest' | 'draft' | 'focus' | 'resolution'; readonly text: string; readonly stage?: string }, exec: Exec) {
      try {
        return await svc.chairRecord(String(exec.agent.id), {
          docId: args.docId,
          kind: args.kind,
          text: args.text,
          ...(args.stage !== undefined ? { stage: args.stage } : {}),
        })
      } catch (error) {
        translate(error)
      }
    },
  }
}

/** 主持人：机械计票（M1 公式＋应答率门槛，结果落库）. */
export function tallyTool(svc: PandaClawService) {
  return {
    name: 'pc_tally',
    description:
      'PandaClaw 机械计票：汇总本轮全部选票，验证 npc 应答率 ≥2/3，按 M1 公式裁决——'
      + '普通事项 通过=赞成>npc编制÷2（弃权计入分母，算术等同反对）；full 验收的终批阶段 改为赞成≥编制×2/3。'
      + '未达应答率⇒降级征询模式：该轮计票不构成表决（协议自定语义），须呈报用户三选裁定——采信归档／焦点再议一轮／终止议题；'
      + '法定表决未通过→提炼焦点→pc_stage round 重议。每轮只可计票一次.',
    parameters: {
      docId: { type: 'string', required: true, description: '文号.' },
    },
    output: {
      schema: FACT_SCHEMA('tally'),
      render: (_args: unknown, value: { pc: 'tally'; tally: { passed: boolean; mode: string; aye: number; nay: number; abstain: number; rule: string } }) => {
        const consultive = value.tally.mode === 'consultive'
        const verdict = consultive
          ? '征询模式（未达法定应答率，本计票不构成表决）'
          : value.tally.passed ? '通过' : '不通过'
        return [{
          type: 'text',
          text: `计票：赞成${value.tally.aye} / 反对${value.tally.nay} / 弃权${value.tally.abstain} —— ${value.tally.rule}`
            + ` ⇒ ${verdict}`
            + (consultive
              ? '。呈报用户三选：①采信＝pc_record resolution（正文强制标注「征询采信·未达法定状态」）后走完阶段收尾归档；'
                + '②再议＝pc_record focus 提炼缺席与分歧要点 → pc_stage round；③终止＝pc_adjourn terminate 附原因。'
              : value.tally.passed
                ? '。下一步：pc_record resolution 登记决议要点（含票数明细与成文日期），随后 pc_stage advance。'
                : '。下一步：从反对理由提炼质询焦点 → pc_record focus → pc_stage round 打回重议（三审制内）。'),
        }]
      },
      presentationMeta: (_args: unknown, value: PcFact) => value,
    },
    async execute(args: { readonly docId: string }, _exec: Exec) {
      try {
        return await svc.tally(args.docId)
      } catch (error) {
        translate(error)
      }
    },
  }
}

/** 主持人：查看会议档案（阶段机/文书全文/计票史）——公文成文与回顾的取数口. */
export function inspectTool(svc: PandaClawService) {
  return {
    name: 'pc_inspect',
    description:
      'PandaClaw 查看会议档案：返回会议的阶段机状态、全部文书的全文（意见书/质询/答辩/选票理由/决议要点）与历次计票明细。'
      + '生成正式公文（决议、纪要、答复）前必须调用本工具取数——内容一律以档案为准，禁止凭记忆编造字段.',
    parameters: {
      docId: { type: 'string', required: true, description: '文号.' },
    },
    output: {
      schema: LOOSE_OBJECT,
      render: (_args: unknown, value: { readonly detail: {
        readonly meeting: { readonly docId: string; readonly type: string; readonly status: string; readonly stages: readonly { label: string; state: string; round?: number }[] }
        readonly tallies: readonly { stage: string; round: number; aye: number; nay: number; abstain: number; passed: boolean; mode: string }[]
        readonly records: readonly { kind: string; authorName: string; round?: number; verdict?: string; text: string }[]
      } }) => {
        const d = value.detail
        const lines: string[] = [
          `档案 ${d.meeting.docId}（${d.meeting.status}）：`,
          ...d.meeting.stages.map(stage =>
            `  ${stage.state === 'done' ? '✔' : stage.state === 'active' ? '▶' : '·'} ${stage.label}${stage.round === undefined ? '' : ` r${stage.round}`}`),
        ]
        if (d.tallies.length > 0) {
          lines.push('计票史：')
          for (const tally of d.tallies) {
            lines.push(`  ${tally.stage} r${tally.round}：赞${tally.aye}/反${tally.nay}/弃${tally.abstain} ⇒ ${tally.passed ? '通过' : '未通过'}${tally.mode === 'consultive' ? '(征询模式·未构成表决)' : ''}`)
          }
        }
        lines.push('文书全文：')
        for (const record of d.records) {
          const cap = record.kind === 'opinion' || record.kind === 'inquiry' || record.kind === 'vote' || record.kind === 'reply' ? 400 : 800
          const body = record.text.length > cap ? record.text.slice(0, cap) + '…(截断)' : record.text
          lines.push(`  [${record.kind}]${record.authorName}${record.round === undefined ? '' : ` r${record.round}`}${record.verdict === undefined ? '' : `(${record.verdict})`}：${body}`)
        }
        return [{ type: 'text' as const, text: lines.join('\n') }]
      },
    },
    async execute(args: { readonly docId: string }, _exec: Exec) {
      try {
        return { detail: await svc.inspect(args.docId) }
      } catch (error) {
        translate(error)
      }
    },
  }
}

/** 主持人：散会归档（红线8 门禁）或搁置终止. */
export function adjournTool(svc: PandaClawService) {
  return {
    name: 'pc_adjourn',
    description:
      'PandaClaw 散会：全部阶段完成且已登记 resolution 成文方可正常归档（红线8）；'
      + 'terminate=true 为搁置终止（议题跨两个周期未推进的自动终止条款的人工触发，须附原因）。归档后会议只读.',
    parameters: {
      docId: { type: 'string', required: true, description: '文号.' },
      terminate: { type: 'boolean', description: 'true=搁置终止而非正常归档.' },
      reason: { type: 'string', description: '终止原因（terminate 时必填）.' },
    },
    output: {
      schema: FACT_SCHEMA('meeting'),
      render: (_args: unknown, value: { pc: 'meeting'; meeting: { docId: string; status: string } }) => [{
        type: 'text',
        text: `会议 ${value.meeting.docId} 已${value.meeting.status === 'terminated' ? '终止归档' : '归档'}。生成正式公文并解散团队（team_dismiss）.`,
      }],
      presentationMeta: (_args: unknown, value: PcFact) => value,
    },
    async execute(args: { readonly docId: string; readonly terminate?: boolean; readonly reason?: string }, _exec: Exec) {
      try {
        if (args.terminate === true && (args.reason === undefined || args.reason.trim().length === 0)) {
          throw new PcError('ADJOURN_BLOCKED', '搁置终止必须附原因（reason）')
        }
        return await svc.adjourn(args.docId, {
          ...(args.terminate === true ? { terminate: true } : {}),
          ...(args.reason !== undefined ? { reason: args.reason } : {}),
        })
      } catch (error) {
        translate(error)
      }
    },
  }
}

/** 成员：提交文书（意见书/质询/答辩），当场过 M4 准入与字限. */
export function submitTool(svc: PandaClawService) {
  return {
    name: 'pc_submit',
    description:
      `PandaClaw 成员提交通道（仅限会议成员）：opinion 意见书（cppcc，≤${WORD_LIMITS.opinion}字，一事一案：有情况分析+有具体建议）/`
      + ` inquiry 书面质询（npc，≤${WORD_LIMITS.inquiry}字）/ reply 答辩（cppcc，≤${WORD_LIMITS.reply}字）。`
      + '超限或缺结构的提交会被当场拒收退回（原稿不入库）：压缩重写后重新调用。name 必须用建会名单里的自报名，首次提交即绑定身份.',
    parameters: {
      docId: { type: 'string', required: true, description: '文号.' },
      name: { type: 'string', required: true, description: '你的成员自报名（须在建会名单内）.' },
      kind: { type: 'string', required: true, enum: ['opinion', 'inquiry', 'reply'], description: '文书种类.' },
      text: { type: 'string', required: true, description: '文书全文（结论先行；各种类字限见描述）.' },
    },
    output: {
      schema: FACT_SCHEMA('record'),
      render: (_args: unknown, value: { pc: 'record'; record: { kind: string; verdict?: string } }) => [{
        type: 'text',
        text: `你的${value.record.kind === 'opinion' ? '意见书' : value.record.kind === 'inquiry' ? '质询' : '答辩'}已收录${value.record.verdict === 'admitted' ? '（准入审查通过）' : ''}，等主持人合议.`,
      }],
      presentationMeta: (_args: unknown, value: PcFact) => value,
    },
    async execute(args: { readonly docId: string; readonly name: string; readonly kind: 'opinion' | 'inquiry' | 'reply'; readonly text: string }, exec: Exec) {
      try {
        return await svc.submit(String(exec.agent.id), args)
      } catch (error) {
        translate(error)
      }
    },
  }
}

/** 成员：投票（npc 专属，前置门机械校验）. */
export function voteTool(svc: PandaClawService) {
  return {
    name: 'pc_vote',
    description:
      `PandaClaw 收敛通道（仅限 npc 人大代表），语义按会议类型自动切换：`
      + '决议类会议＝选票（赞成/反对/弃权；须过前置门——本阶段已有已收录意见书与书面质询）；'
      + 'MIN 纪要型＝确证书（确认/更正；回答「这份记录是否如实」，无需意见书与质询，更正内容写入理由）。'
      + `理由≤${WORD_LIMITS.voteReason}字；一人一票不可更改。`,
    parameters: {
      docId: { type: 'string', required: true, description: '文号.' },
      name: { type: 'string', required: true, description: '你的 npc 名单自报名.' },
      stance: { type: 'string', required: true, enum: ['赞成', '反对', '弃权', '确认', '更正'], description: '立场：决议类用赞成/反对/弃权；MIN 用确认/更正.' },
      reason: { type: 'string', required: true, description: `理由（≤${WORD_LIMITS.voteReason}字；MIN 更正时写明失真处）.` },
    },
    output: {
      schema: FACT_SCHEMA('record'),
      render: (_args: unknown, value: { pc: 'record'; record: { authorName: string } }) => [{
        type: 'text',
        text: `「${value.record.authorName}」的选票已录入，等待计票.`,
      }],
      presentationMeta: (_args: unknown, value: PcFact) => value,
    },
    async execute(args: { readonly docId: string; readonly name: string; readonly stance: '赞成' | '反对' | '弃权'; readonly reason: string }, exec: Exec) {
      try {
        return await svc.vote(String(exec.agent.id), args)
      } catch (error) {
        translate(error)
      }
    },
  }
}
