/**
 * PandaClaw 记录域：会议与文书的最小持久层.
 *
 * 协议层的权威数据住在自己的 storage domain 表里，不寄生任何 agent-team
 * 底座的内部结构——底座负责组队与投递，PandaClaw 负责程序与裁决。域缺席时
 * 整个插件拒绝装配（硬依赖），因为无记录域的会议系统没有约束力可言.
 */

import { z } from 'zod'
import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain'
import type { MeetingType, RecordKind, ReviewFlag, ReviewState, Seat, Tier, Validation } from './protocol.ts'

/** 一场会议的存储行（行即实体整体，更新走覆盖写）. */
export const meetingSchema = z.object({
  docId: z.string(),
  type: z.string() as z.ZodType<MeetingType>,
  tier: z.string() as z.ZodType<Tier>,
  validation: z.string() as z.ZodType<Validation>,
  topic: z.string(),
  status: z.union([z.literal('open'), z.literal('adjourned'), z.literal('terminated')]),
  /** 建会名单：先到先得绑定席位会话. */
  cppccNames: z.array(z.string()),
  npcNames: z.array(z.string()),
  /** 阶段进度：与类型阶段流等长、同序. */
  stages: z.array(z.object({
    id: z.string(),
    state: z.union([z.literal('pending'), z.literal('active'), z.literal('done')]),
    round: z.number().optional(),
  })),
  /** 复审子状态（ADR-0010）：全字段非必填——既有档案行缺省即 idle/无标记，向前兼容. */
  review: z.object({
    state: z.string() as z.ZodType<ReviewState>,
    flag: z.string() as z.ZodType<ReviewFlag>,
    /** 复审意见条数（逐条回告的计数依据）. */
    count: z.number(),
    /** 出口三选裁定（decidable→closed 的落板值）：'revise' | 'interpret' | 'dismiss'. */
    choice: z.string().optional(),
    /** 修订出口：新案卷号（修订重议→新卷关联原卷）. */
    revisedDocId: z.string().optional(),
    /** 解释出口：原卷追加的解释性 resolution 记录 id. */
    interpretRecordId: z.string().optional(),
    /** 修订来源（Q14-A）：本卷系修订自哪个原卷（新卷侧谱系，`reviewLinkLanding` 对称落板）. */
    originDocId: z.string().optional(),
    /** 修订来源的上轮审查结论摘要（Q14-A：审查焦点＝修订是否消除原问题；注入审查包）. */
    sourceReviewNote: z.string().optional(),
    /** 待审池出审优先级（服务层机械排序字段）. */
    priority: z.number().optional(),
  }).optional(),
  createdAt: z.number(),
  closedAt: z.number().optional(),
})

/** 一条文书的存储行（全文入库，供公文成文溯源）. */
export const recordSchema = z.object({
  id: z.string(),
  docId: z.string(),
  kind: z.string() as z.ZodType<RecordKind>,
  stage: z.string(),
  round: z.number().optional(),
  seat: z.string() as z.ZodType<Seat>,
  authorName: z.string(),
  authorSessionId: z.string(),
  text: z.string(),
  /** 结构化表决立场（仅选票行有）：选票三态或确证书两态；计票读此字段，不再解析文本. */
  stance: z.enum(['赞成', '反对', '弃权', '确认', '更正']).optional(),
  verdict: z.union([z.literal('admitted'), z.literal('rejected')]).optional(),
  reason: z.string().optional(),
  at: z.number(),
})

/** 一次数计票的存储行（决议溯源的直接依据）. */
export const tallySchema = z.object({
  docId: z.string(),
  stage: z.string(),
  round: z.number(),
  aye: z.number(),
  nay: z.number(),
  abstain: z.number(),
  rosterSize: z.number(),
  responded: z.number(),
  mode: z.union([z.literal('formal'), z.literal('consultive')]),
  passed: z.boolean(),
  rule: z.string(),
  at: z.number(),
})

/** 会议存储行（store/service/review 三面共用的行类型，schema 邻位）. */
export type MeetingRow = z.infer<typeof meetingSchema>

/** 文书存储行. */
export type RecordRow = z.infer<typeof recordSchema>

/** 计票存储行. */
export type TallyRow = z.infer<typeof tallySchema>

/** PandaClaw 拥有的域：三张表，主键分别为文号、记录 id、计票复合键. */
export const PANDACLAW_DOMAIN = defineDomain({
  name: 'pandaclaw',
  version: 1,
  tables: {
    meetings: domainTable<string, z.infer<typeof meetingSchema>>(meetingSchema),
    records: domainTable<string, z.infer<typeof recordSchema>>(recordSchema),
    tallies: domainTable<string, z.infer<typeof tallySchema>>(tallySchema),
  },
})

/** 计票行的复合主键：一场会议一个阶段一轮至多一次计票. */
export function tallyKey(docId: string, stage: string, round: number): string {
  return `${docId}::${stage}::r${round}`
}

/** 文书行的复合主键要素：种类+文号+阶段+轮次+作者（重提以版本号区分）. */
export function buildRecordId(parts: {
  readonly docId: string
  readonly kind: string
  readonly stage: string
  readonly round?: number
  readonly authorName: string
  readonly seq: number
}): string {
  const roundPart = parts.round === undefined ? '' : `-r${parts.round}`
  return `${parts.kind}:${parts.docId}:${parts.stage}${roundPart}:${parts.authorName}#${parts.seq}`
}
