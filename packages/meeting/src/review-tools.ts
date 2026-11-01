/**
 * PandaClaw 复审工具面（模块化 A 阶段：Q9-A 从 tools.ts 纯搬家，逻辑零改动）.
 *
 * 三个复审工具——pc_review（主持人全流程）、pc_review_verdict（审查替身直写）、
 * pc_review_statement（异议方陈述）——自成一文件；共享转译/契约原语从
 * tools.ts 导入，服务方法经熊猫爪会议服务壳转发访问.
 */

import type { PcFact } from './contract.ts'
import { PcError } from './errors.ts'
import { REVIEW_OPINION_LIMIT, WORD_LIMITS } from './protocol.ts'
import type { PandaClawService } from './service.ts'
import { FACT_SCHEMA, translate, type Exec } from './tools.ts'

/** 主持人：复审全流程工具（ADR-0010）——登记/出审/听证收窗/出口三选/回告/落地关联. */
export function reviewTool(svc: PandaClawService) {
  return {
    name: 'pc_review',
    description:
      'PandaClaw 复审回告闭环（ADR-0010 备案审查）：对已归档案卷的决议作事后纠错。'
      + 'action=request 登记用户复审意见（text 原汁原味；次级/弱档 PLA/STR/CON 由此开启，主力档 RES/LEG 归档已自动入池出审）；'
      + 'action=dispatch 专项出审（docIds 指定一批案卷——含次级/弱档批量开启；主力档已由归档泵自动出审，无需也不可重复）；'
      + 'action=close-hearing 结束沟通纠正窗口（异议方陈述未齐时的收窗逃生门，程序性）；'
      + 'action=adjudicate 出口三选（choice=revise 修订重议/interpret 解释性决议/dismiss 驳回并说明，note 为驳回说明）——'
      + '审查替身出建议性审查意见后呈用户，最终通过/修订永远由用户决定；'
      + 'action=batch-dismiss 分级批量驳回（docIds 指定多个待裁案卷，仅审查意见为「维持」的统一驳回；含修订/解释/驳回建议的自动跳过须逐件三选）；'
      + 'action=reply 逐条回告（text 处置结论与回告文本，每条意见逐条回执，齐备即闭环）；'
      + 'action=restart 重启复审（仅替身未产出审查意见的 reviewing/accepted 档案——替身卡死/死亡时废弃原替身立即重出审）；'
      + 'action=link 落地关联——修订后补 revisedDocId（新案卷号），或解释后补 interpretRecordId（原卷解释性 resolution 记录 id）.',
    parameters: {
      docId: { type: 'string', description: '被复审案卷号（request/close-hearing/adjudicate/reply/restart/link 时必填；dispatch/batch-dismiss 改用 docIds）.' },
      action: { type: 'string', required: true, enum: ['request', 'dispatch', 'close-hearing', 'adjudicate', 'batch-dismiss', 'reply', 'restart', 'link'], description: '复审动作.' },
      docIds: { type: 'string', description: 'dispatch/batch-dismiss 指定的案卷号列表，逗号分隔.' },
      text: { type: 'string', description: 'request=用户复审意见（原汁原味）；reply 语境=回告文本；其他动作忽略.' },
      choice: { type: 'string', enum: ['revise', 'interpret', 'dismiss'], description: 'adjudicate 时的出口三选.' },
      note: { type: 'string', description: 'adjudicate 时驳回说明；batch-dismiss 时统一驳回说明模板（缺省用标准说明）.' },
      revisedDocId: { type: 'string', description: 'link 时修订出口的新案卷号.' },
      interpretRecordId: { type: 'string', description: 'link 时解释出口的 resolution 记录 id.' },
    },
    output: {
      schema: FACT_SCHEMA('meeting'),
      render: (_args: unknown, value: { pc: 'meeting'; meeting: { docId: string; review?: { state: string; count: number; choice?: string } } }) => {
        const review = value.meeting.review
        const stateLabel: Record<string, string> = {
          filed: '已登记待出审', accepted: '已受理', reviewing: '审查中', hearing: '沟通纠正中',
          decidable: '待用户三选', feedback: '回告中', closed: '已闭环',
        }
        return [{
          type: 'text',
          text: `案卷 ${value.meeting.docId} 复审状态：${review === undefined ? '未进入' : `${stateLabel[review.state] ?? review.state}（已登记意见 ${review.count} 条${review.choice === undefined ? '' : `，出口=${review.choice}`}）`}`,
        }]
      },
      presentationMeta: (_args: unknown, value: PcFact) => value,
    },
    async execute(args: {
      readonly docId?: string; readonly action: 'request' | 'dispatch' | 'close-hearing' | 'adjudicate' | 'batch-dismiss' | 'reply' | 'restart' | 'link'
      readonly docIds?: string; readonly text?: string; readonly choice?: 'revise' | 'interpret' | 'dismiss'; readonly note?: string
      readonly revisedDocId?: string; readonly interpretRecordId?: string
    }, exec: Exec) {
      try {
        const splitIds = (raw: string): string[] => raw.split(/[,，、]/).map(id => id.trim()).filter(id => id.length > 0)
        switch (args.action) {
          case 'request': {
            if (args.docId === undefined) throw new PcError('STRUCTURE_FAIL', 'request 必须提供 docId')
            if (args.text === undefined || args.text.trim().length === 0) throw new PcError('STRUCTURE_FAIL', '登记复审意见必须提供 text（原汁原味不改写）')
            return await svc.reviewRequest(String(exec.agent.id), { docId: args.docId, text: args.text })
          }
          case 'dispatch': {
            if (args.docIds === undefined || args.docIds.trim().length === 0) throw new PcError('REVIEW_STAGE_BLOCKED', '专项出审必须提供 docIds（指定本批案卷）')
            const dispatched = await svc.reviewDispatch(splitIds(args.docIds))
            if (dispatched.length === 0) throw new PcError('REVIEW_STAGE_BLOCKED', '指定案卷均不在待审池（filed 状态）：主力档归档已自动出审，次级/弱档请确认状态')
            return { pc: 'meeting' as const, meeting: (await svc.inspect(dispatched[0])).meeting }
          }
          case 'close-hearing': {
            if (args.docId === undefined) throw new PcError('STRUCTURE_FAIL', 'close-hearing 必须提供 docId')
            return await svc.reviewCloseHearing(args.docId)
          }
          case 'adjudicate': {
            if (args.docId === undefined) throw new PcError('STRUCTURE_FAIL', 'adjudicate 必须提供 docId')
            if (args.choice === undefined) throw new PcError('REVIEW_CHOICE_INVALID', 'adjudicate 必须提供 choice（revise/interpret/dismiss）')
            return await svc.reviewAdjudicate(String(exec.agent.id), {
              docId: args.docId, choice: args.choice, ...(args.note !== undefined ? { note: args.note } : {}),
            })
          }
          case 'batch-dismiss': {
            if (args.docIds === undefined || args.docIds.trim().length === 0) throw new PcError('REVIEW_STAGE_BLOCKED', '批量驳回必须提供 docIds')
            const results = await svc.reviewBatchDismiss(String(exec.agent.id), {
              docIds: splitIds(args.docIds),
              ...(args.note !== undefined ? { note: args.note } : {}),
            })
            const first = results.find(result => result.state === 'feedback')
            if (first === undefined) {
              const skipped = results.map(result => result.docId).join('、')
              throw new PcError('REVIEW_STAGE_BLOCKED', `批量驳回无成功项：${skipped}（含修订/解释建议或非待裁状态，须逐件处理）`)
            }
            return { pc: 'meeting' as const, meeting: (await svc.inspect(first.docId)).meeting }
          }
          case 'reply': {
            if (args.docId === undefined) throw new PcError('STRUCTURE_FAIL', 'reply 必须提供 docId')
            if (args.text === undefined || args.text.trim().length === 0) throw new PcError('STRUCTURE_FAIL', '回告必须提供 text（处置结论与回告文本）')
            return await svc.reviewReply(String(exec.agent.id), { docId: args.docId, text: args.text })
          }
          case 'restart': {
            if (args.docId === undefined) throw new PcError('STRUCTURE_FAIL', 'restart 必须提供 docId')
            return await svc.reviewRestart(args.docId)
          }
          case 'link': {
            if (args.docId === undefined) throw new PcError('STRUCTURE_FAIL', 'link 必须提供 docId')
            return await svc.reviewLinkLanding(args.docId, {
              ...(args.revisedDocId !== undefined ? { revisedDocId: args.revisedDocId } : {}),
              ...(args.interpretRecordId !== undefined ? { interpretRecordId: args.interpretRecordId } : {}),
            })
          }
        }
      } catch (error) {
        translate(error)
      }
    },
  }
}

/** 审查替身：直写审查意见（ADR-0010 Q6/Q7，只装给 `pc-reviewer` preset 会话）. */
export function verdictTool(svc: PandaClawService) {
  return {
    name: 'pc_review_verdict',
    description:
      `PandaClaw 审查替身专用：依据下发的结构化审查包，对已归档案卷作出审查判断——维持／建议修订／建议解释（三分类；`
      + `认为应撤销原决议的并入「建议修订重议」并在处置清单注明「建议废止」，不再产出「建议驳回」——`
      + `「建议驳回」与用户出口「驳回并说明」语义相反，同词异义已废止）`
      + `并给出逐条处置清单。审查结论是建议性意见（用户三选最终裁量）；`
      + `只依据审查包数据判断，不猜测案卷记录流其他内容。直写服务层，不经主持人代录.`,
    parameters: {
      docId: { type: 'string', required: true, description: '被审查案卷号（来自审查包）.' },
      verdict: { type: 'string', required: true, description: `审查结论（维持/建议修订/建议解释＋逐条理由，≤${REVIEW_OPINION_LIMIT}字）.'` },
      disposal: { type: 'string', required: true, description: '逐条处置清单（对每条复审意见的处置：采纳/部分采纳/存疑留办/不采纳＋理由）.' },
    },
    output: {
      schema: FACT_SCHEMA('meeting'),
      render: (_args: unknown, value: { pc: 'meeting'; meeting: { docId: string } }) => [{
        type: 'text',
        text: `审查意见已登记，案卷 ${value.meeting.docId} 进入下阶段（沟通纠正/待用户三选）.`,
      }],
      presentationMeta: (_args: unknown, value: PcFact) => value,
    },
    async execute(args: { readonly docId: string; readonly verdict: string; readonly disposal: string }, exec: Exec) {
      try {
        return await svc.reviewVerdict(String(exec.agent.id), { docId: args.docId, verdict: args.verdict, disposal: args.disposal })
      } catch (error) {
        translate(error)
      }
    },
  }
}

/** 异议方公民：被动陈述（ADR-0010 Q12/Q13；成员面一并装配，服务层校验异议方名单）. */
export function reviewStatementTool(svc: PandaClawService) {
  return {
    name: 'pc_review_statement',
    description:
      'PandaClaw 异议方陈述（复审沟通纠正阶段专用）：你是原会议中提出过异议（反对票/质询/未采信意见）的成员，'
      + '复审已触发时以其原身份陈述当初的异议论据（为什么该决议有问题、当初的质询为什么成立）。'
      + '只陈述既有异议观点，不主动开启复审、不参与出口裁量；仅当案卷复审处于沟通纠正（hearing）阶段时受理.',
    parameters: {
      docId: { type: 'string', required: true, description: '被复审案卷号.' },
      name: { type: 'string', required: true, description: '你的成员自报名（须在异议方名单内）.' },
      text: { type: 'string', required: true, description: `异议方陈述（≤${WORD_LIMITS.opinion}字，一事一案）.'` },
    },
    output: {
      schema: FACT_SCHEMA('meeting'),
      render: (_args: unknown, value: { pc: 'meeting'; meeting: { docId: string } }) => [{
        type: 'text',
        text: `异议方陈述已登记；案卷 ${value.meeting.docId} 复审继续.`,
      }],
      presentationMeta: (_args: unknown, value: PcFact) => value,
    },
    async execute(args: { readonly docId: string; readonly name: string; readonly text: string }, exec: Exec) {
      try {
        return await svc.reviewStatement(String(exec.agent.id), args)
      } catch (error) {
        translate(error)
      }
    },
  }
}