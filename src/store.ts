/**
 * PandaClaw 领域仓库（模块化 A 阶段：Q3-A 贫血门面 + Q4-B/Q5-A 域存取全量下沉）.
 *
 * 本层只做纯数据访问与机械数据整形（视图映射），不做任何业务推导——
 * 协议裁决、复审状态机、优先级计算等富逻辑全部留在会议核心（service）
 * 与复审领域类（review）。store 持有域句柄，是 service/review 访问
 * meetings/records/tallies 三张表的唯一通道.
 */

import type { Domain } from '@deepseek-ai/dsh-storage-domain'
import type { z } from 'zod'
import {
  type PcMeetingView, type PcMemberView, type PcRecordView, type PcTallyView,
} from './contract.ts'
import { PANDACLAW_DOMAIN, buildRecordId, type MeetingRow, type RecordRow, type TallyRow } from './domain.ts'
import { PcError } from './errors.ts'
import { STAGE_FLOWS, type ReviewState } from './protocol.ts'

/**
 * 领域仓库门面：纯数据访问（Q5-A 粒度），无业务推导（Q3-A）.
 * `advanceReview/advanceReviewIf/recordReviewEvent` 是复审状态机的原子
 * 读写原语（谓词在域存储的读改写回调内求值），语义归数据层、决策归调用方.
 */
export interface PandaClawStore {
  /** 读取会议行；不存在抛 MEETING_NOT_FOUND. */
  meeting(docId: string): Promise<MeetingRow>
  /** 落一行会议（建会/新建修订卷）. */
  putMeeting(row: MeetingRow): Promise<void>
  /** 原子读改写会议行（并发推进不丢状态）；返回更新后的行. */
  updateMeeting(docId: string, mutate: (row: MeetingRow) => MeetingRow): Promise<MeetingRow>
  /** 全量会议行（文号编号扫描/待审池扫描/启动恢复扫描）. */
  allMeetings(): Promise<MeetingRow[]>
  /** 某案卷的全部文书行（按表序，即落板序）. */
  records(docId: string): Promise<RecordRow[]>
  /** 落一条文书行；返回其记录视图（会议核心直接转发给调用方）. */
  putRecord(row: RecordRow): Promise<PcRecordView>
  /** 按前缀匹配统计既有条数 +1（纯函数）. */
  nextSeq(priorRecords: readonly RecordRow[], prefixMatch: (record: RecordRow) => boolean): number
  /** 某案卷的全部计票行. */
  tallies(docId: string): Promise<TallyRow[]>
  /** 落一行计票. */
  putTally(row: TallyRow): Promise<void>
  /** 原子推进复审状态（读改写，并发复审动作不丢状态）；返回视图. */
  advanceReview(docId: string, mutate: (review: NonNullable<MeetingRow['review']>) => void): Promise<PcMeetingView>
  /** 条件推进复审状态（ADR-0011 Q4-B CAS）；谓词在 update 回调内求值，不满足返回 false. */
  advanceReviewIf(docId: string, predicate: (state: ReviewState) => boolean, mutate: (review: NonNullable<MeetingRow['review']>) => void): Promise<boolean>
  /** 恢复/失败动作落板为系统事件（ADR-0011 Q7-A：kind='review-event'，authorName='系统'）. */
  recordReviewEvent(docId: string, text: string): Promise<void>
}

/**
 * 以域句柄装配仓库实现.
 * @param opening - `ctx.storageDomain.open(PANDACLAW_DOMAIN)` 的结果（调用方持有释放权）.
 */
export function makeStore(opening: Promise<Domain<typeof PANDACLAW_DOMAIN>>): PandaClawStore {
  const domain = async (): Promise<Domain<typeof PANDACLAW_DOMAIN>> => opening

  const store: PandaClawStore = {
    async meeting(docId) {
      const meetings = (await domain()).table('meetings')
      const row = meetings.get(docId)
      if (row === undefined) throw new PcError('MEETING_NOT_FOUND', `文号 ${docId} 不存在：先用 pc_convene 建会，或核对文号拼写`)
      return row
    },

    async putMeeting(row) {
      const meetings = (await domain()).table('meetings')
      await meetings.put(row.docId, row)
    },

    async updateMeeting(docId, mutate) {
      const meetings = (await domain()).table('meetings')
      return meetings.update(docId, mutate)
    },

    async allMeetings() {
      const meetings = (await domain()).table('meetings')
      return [...meetings.entries()].map(([, value]) => value)
    },

    async records(docId) {
      const records = (await domain()).table('records')
      return [...records.entries()].map(([, value]) => value)
        .filter(record => record.docId === docId)
    },

    async putRecord(row) {
      const records = (await domain()).table('records')
      await records.put(row.id, row)
      return toRecordView(row)
    },

    nextSeq(priorRecords, prefixMatch) {
      let seq = 0
      for (const record of priorRecords) if (prefixMatch(record)) seq += 1
      return seq + 1
    },

    async tallies(docId) {
      const tallies = (await domain()).table('tallies')
      return [...tallies.entries()].map(([, value]) => value).filter(entry => entry.docId === docId)
    },

    async putTally(row) {
      const tallies = (await domain()).table('tallies')
      await tallies.put(tallyKeyOf(row.docId, row.stage, row.round), row)
    },

    async advanceReview(docId, mutate) {
      const meetings = (await domain()).table('meetings')
      let view!: PcMeetingView
      await meetings.update(docId, row => {
        const current: NonNullable<MeetingRow['review']> = row.review ?? { state: 'idle', flag: 'none', count: 0 }
        mutate(current)
        row.review = current
        view = toMeetingView(row)
        return row
      })
      return view
    },

    async advanceReviewIf(docId, predicate, mutate) {
      const meetings = (await domain()).table('meetings')
      let applied = false
      await meetings.update(docId, row => {
        const current: NonNullable<MeetingRow['review']> = row.review ?? { state: 'idle', flag: 'none', count: 0 }
        if (!predicate(current.state)) return row
        mutate(current)
        row.review = current
        applied = true
        return row
      })
      return applied
    },

    async recordReviewEvent(docId, text) {
      const records = await store.records(docId)
      const seq = store.nextSeq(records, record => record.kind === 'review-event')
      await store.putRecord({
        id: buildRecordId({ docId, kind: 'review-event', stage: 'review', authorName: '系统', seq }),
        docId,
        kind: 'review-event',
        stage: 'review',
        seat: 'chair',
        authorName: '系统',
        authorSessionId: 'system',
        text,
        at: Date.now(),
      })
    },
  }

  return store
}

/** 计票行主键（domain.ts `tallyKey` 的本地别名，避免 store 暴露复合键拼装细节）. */
function tallyKeyOf(docId: string, stage: string, round: number): string {
  return `${docId}::${stage}::r${round}`
}

// —— 视图映射（机械数据整形；单一归属本层，service/review 复用，避免循环依赖）——

function toMeetingView(row: MeetingRow): PcMeetingView {
  const flow = STAGE_FLOWS[row.type]
  const members: PcMemberView[] = [
    ...row.cppccNames.map(name => ({ name, seat: 'cppcc' as const })),
    ...row.npcNames.map(name => ({ name, seat: 'npc' as const })),
  ]
  const activeStage = row.stages.find(stage => stage.state === 'active')
  const review = row.review
  return {
    docId: row.docId,
    type: row.type,
    tier: row.tier,
    validation: row.validation,
    topic: row.topic,
    status: row.status,
    members,
    stages: row.stages.map((stage, index) => ({
      id: stage.id,
      label: flow[index].label,
      deliberative: flow[index].deliberative,
      state: stage.state,
      ...(stage.round !== undefined ? { round: stage.round } : {}),
    })),
    ...(activeStage !== undefined ? { currentStage: activeStage.id } : {}),
    ...(review !== undefined ? { review: {
      state: review.state,
      flag: review.flag,
      count: review.count,
      ...(review.choice !== undefined ? { choice: review.choice as 'revise' | 'interpret' | 'dismiss' } : {}),
      ...(review.revisedDocId !== undefined ? { revisedDocId: review.revisedDocId } : {}),
      ...(review.interpretRecordId !== undefined ? { interpretRecordId: review.interpretRecordId } : {}),
      ...(review.originDocId !== undefined ? { originDocId: review.originDocId } : {}),
      ...(review.sourceReviewNote !== undefined ? { sourceReviewNote: review.sourceReviewNote } : {}),
      ...(review.priority !== undefined ? { priority: review.priority } : {}),
    } } : {}),
    createdAt: row.createdAt,
    ...(row.closedAt !== undefined ? { closedAt: row.closedAt } : {}),
  }
}

function toRecordView(row: RecordRow): PcRecordView {
  return {
    id: row.id,
    docId: row.docId,
    kind: row.kind,
    stage: row.stage,
    ...(row.round !== undefined ? { round: row.round } : {}),
    seat: row.seat,
    authorName: row.authorName,
    authorSessionId: row.authorSessionId,
    preview: row.text.length > 180 ? row.text.slice(0, 180) + '…' : row.text,
    wordCount: row.text.length,
    ...(row.stance !== undefined ? { stance: row.stance } : {}),
    ...(row.verdict !== undefined ? { verdict: row.verdict } : {}),
    ...(row.reason !== undefined ? { reason: row.reason } : {}),
    at: row.at,
  }
}

function toTallyView(row: TallyRow): PcTallyView {
  return { ...row }
}

// 供 service/review 复用（本层单一归属）.
export { toMeetingView, toRecordView, toTallyView }