/**
 * ReviewService 独立单测（模块化 A 阶段，Q11-A：边界快速迭代不经过会议流程装饰）.
 *
 * 直测复审领域类边界：CAS 并发出审、spawn 失败回滚、restart 逃生门、
 * dispose 兜底、启动恢复（rebuilt/rolledBack/loud）、修订谱系对称、
 * 解释同卷再开轮、三分类批量、交卷销毁替身。
 *
 * 手段：内存 fake store（PandaClawStore 全量实现）＋内存 fake host
 * （记录 spawn/dispose 调用、可配置抛错、可手动触发 5B 回调），手造
 * MeetingRow 种子绕过 convene.
 *
 * 运行：`node tests/review.unit.mjs`（预先 `pnpm run build`）.
 */

import assert from 'node:assert/strict'
import { ReviewService } from '../dist/index.js'

/** 内存 KvTable 假体（与 storage-domain 的表契约同形；读取即解耦快照）. */
function makeTable() {
  const map = new Map()
  const clone = value => value === undefined ? undefined : structuredClone(value)
  return {
    get: key => clone(map.get(key)),
    entries: () => [...map.entries()].map(([key, value]) => [key, clone(value)]).values(),
    put: async (key, value) => { map.set(key, clone(value)) },
    delete: async key => map.delete(key),
    update: async (key, fn) => {
      const next = fn(clone(map.get(key)))
      map.set(key, clone(next))
      return clone(next)
    },
  }
}

/** 内存 PandaClawStore 假体. */
function makeFakeStore() {
  const tables = { meetings: makeTable(), records: makeTable(), tallies: makeTable() }
  const store = {
    async meeting(docId) {
      const row = tables.meetings.get(docId)
      if (row === undefined) throw Object.assign(new Error(`文号 ${docId} 不存在`), { code: 'MEETING_NOT_FOUND' })
      return row
    },
    async putMeeting(row) { await tables.meetings.put(row.docId, row) },
    async updateMeeting(docId, mutate) { return tables.meetings.update(docId, mutate) },
    async allMeetings() { return [...tables.meetings.entries()].map(([, value]) => value) },
    async records(docId) {
      return [...tables.records.entries()].map(([, value]) => value).filter(record => record.docId === docId)
    },
    async putRecord(row) { await tables.records.put(row.id, row); return row },
    nextSeq(priorRecords, prefixMatch) {
      let seq = 0
      for (const record of priorRecords) if (prefixMatch(record)) seq += 1
      return seq + 1
    },
    async tallies(docId) {
      return [...tables.tallies.entries()].map(([, value]) => value).filter(entry => entry.docId === docId)
    },
    async putTally(row) { await tables.tallies.put(`${row.docId}::${row.stage}::r${row.round}`, row) },
    async advanceReview(docId, mutate) {
      let view
      await tables.meetings.update(docId, row => {
        const current = row.review ?? { state: 'idle', flag: 'none', count: 0 }
        mutate(current)
        row.review = current
        view = row
        return row
      })
      return view
    },
    async advanceReviewIf(docId, predicate, mutate) {
      let applied = false
      await tables.meetings.update(docId, row => {
        const current = row.review ?? { state: 'idle', flag: 'none', count: 0 }
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
        id: `review-event:${docId}:review:系统#${seq}`,
        docId, kind: 'review-event', stage: 'review', seat: 'chair',
        authorName: '系统', authorSessionId: 'system', text, at: Date.now(),
      })
    },
  }
  return store
}

/** 内存 AgentHost 假体：记录 spawn/dispose/清理调用；可配置抛错；可手动触发 5B 回调. */
function makeFakeHost() {
  const host = {
    spawned: [], // { kind, docId, opts }
    disposed: [], // { kind, docId }
    disposeAllCount: 0,
    failSpawn: false,
    cbs: new Set(),
    async createStandin(kind, docId, opts) {
      if (host.failSpawn) throw new Error('底座未就绪')
      host.spawned.push({ kind, docId, opts })
      return { dispose: async () => undefined }
    },
    async disposeStandin(docId, kind) { host.disposed.push({ kind, docId }) },
    async disposeAllStandins() { host.disposeAllCount += 1 },
    listStandins() { return [] },
    equip() { return () => undefined },
    registerEquip() { return () => undefined },
    onStandinDisposed(cb) { host.cbs.add(cb); return () => host.cbs.delete(cb) },
    async dispose() { await host.disposeAllStandins() },
    /** 模拟审查替身会话意外销毁（5B）：触发全部已注册回调. */
    fireDisposed(docId) { for (const cb of host.cbs) cb({ kind: 'reviewer', docId }) },
  }
  return host
}

/** 手造会议行种子（绕过 convene；review 逻辑只用得到字段子集）. */
async function seed(store, overrides = {}) {
  const row = {
    docId: 'PC-RES〔2026〕001号',
    type: 'RES',
    tier: 'simple',
    validation: 'skip',
    topic: '单测种子',
    status: 'adjourned',
    cppccNames: ['a', 'b'],
    npcNames: ['c'],
    stages: [{ id: 'publish', state: 'done' }],
    createdAt: Date.now(),
    ...overrides,
  }
  await store.putMeeting(row)
  return row.docId
}

/** 种子审查主体意见记录（batch-dismiss/谱系/recover 判定用）. */
async function seedReviewOpinion(store, docId, verdictText) {
  await store.putRecord({
    id: `review:${docId}:审查主体#1`,
    docId, kind: 'review', stage: 'review', seat: 'chair',
    authorName: '审查主体', authorSessionId: 's', text: `【审查意见】${verdictText}\n【处置清单】无`,
    at: Date.now(),
  })
}

let passed = 0

async function expectError(code, promise) {
  try {
    await promise
  } catch (error) {
    assert.equal(error.code, code, `期望错误码 ${code}，实际：[${error.code}] ${error.message}`)
    passed += 1
    return
  }
  throw new Error(`应当抛出 ${code}，但成功了`)
}

function ok(label) {
  passed += 1
  console.log(`  ✅ ${label}`)
}

// —— 用例 1：CAS 并发出审 ——
{
  const store = makeFakeStore()
  const host = makeFakeHost()
  const review = new ReviewService(store, host)
  await seed(store, { review: { state: 'filed', flag: 'none', count: 0, priority: 0 } })
  const [r1, r2] = await Promise.all([review.reviewDispatch(['PC-RES〔2026〕001号']), review.reviewDispatch(['PC-RES〔2026〕001号'])])
  assert.equal(r1.length + r2.length, 1, '并发 dispatch 只有一个出审成功（CAS）')
  assert.equal(host.spawned.length, 1, '并发下只 spawn 一次审查替身')
  assert.equal((await store.meeting('PC-RES〔2026〕001号')).review.state, 'reviewing')
  ok('CAS 并发：同档案并发出审只有一个胜出（filed→accepted→reviewing 单一推进）')
}

// —— 用例 2：spawn 失败回滚（自动语境静默 / 用户语境抛错）——
{
  const store = makeFakeStore()
  const host = makeFakeHost()
  host.failSpawn = true
  const review = new ReviewService(store, host)
  const docId = await seed(store, { review: { state: 'filed', flag: 'none', count: 0, priority: 0 } })
  // 用户语境 dispatch：抛错并回滚 filed 留池
  await expectError('REVIEW_SPAWN_FAILED', review.reviewDispatch([docId]))
  assert.equal((await store.meeting(docId)).review.state, 'filed', '失败应回滚 filed 留池')
  const records = await store.records(docId)
  assert.ok(records.some(record => record.kind === 'review-event' && record.text.includes('派发失败')), '失败应有 review-event 留痕')
  // 自动语境（泵）：静默回滚不抛
  const pumped = await review.recoverReviews()
  assert.equal(pumped.pumped.length, 0, '全员失败泵不出')
  assert.equal((await store.meeting(docId)).review.state, 'filed', '自动语境静默回滚仍留池')
  ok('spawn 失败回滚：用户语境抛 REVIEW_SPAWN_FAILED、自动语境静默；均回滚 filed＋review-event 留痕')
}

// —— 用例 3：restart 逃生门 ——
{
  const store = makeFakeStore()
  const host = makeFakeHost()
  const review = new ReviewService(store, host)
  const docId = await seed(store, { review: { state: 'reviewing', flag: 'none', count: 0 } })
  const fact = await review.reviewRestart(docId)
  assert.equal(fact.meeting.review?.state, 'reviewing', 'restart 应立即重出审')
  assert.ok(host.disposed.some(entry => entry.kind === 'reviewer' && entry.docId === docId), 'restart 应废弃旧替身')
  const again = await review.reviewRestart(docId)
  assert.equal(again.meeting.review?.state, 'reviewing', 'restart 可重复')
  const idleId = await seed(store, { docId: 'PC-RES〔2026〕099号' }) // 无 review（idle）
  await expectError('REVIEW_STAGE_BLOCKED', review.reviewRestart(idleId))
  ok('restart 逃生门：reviewing 废弃旧替身立即重出审、可重复；非审查态拒 restart')
}

// —— 用例 4：dispose 兜底（5B）——
{
  const store = makeFakeStore()
  const host = makeFakeHost()
  const review = new ReviewService(store, host)
  const docId = await seed(store, { review: { state: 'reviewing', flag: 'none', count: 0 } })
  const spawnBefore = host.spawned.length
  await review.handleStandinDisposed(docId)
  assert.equal((await store.meeting(docId)).review.state, 'reviewing', '兜底应回滚并重泵回 reviewing')
  assert.equal(host.spawned.length, spawnBefore + 1, '兜底重泵（回滚后 pump 主档再 spawn 一次）')
  const records = await store.records(docId)
  assert.ok(records.some(record => record.kind === 'review-event' && record.text.includes('意外销毁')), '兜底应有 review-event 留痕')
  // 已有审查意见：不触发兜底
  const doneId = await seed(store, { docId: 'PC-RES〔2026〕002号', review: { state: 'reviewing', flag: 'none', count: 0 } })
  await seedReviewOpinion(store, doneId, '维持：核验无误')
  const spawnBefore2 = host.spawned.length
  await review.handleStandinDisposed(doneId)
  assert.equal(host.spawned.length, spawnBefore2, '已有审查意见不触发重泵')
  ok('dispose 兜底（5B）：无意见→回滚重泵＋留痕；已有意见→不动')
}

// —— 用例 5：启动恢复（rebuilt / rolledBack / loud）——
{
  const store = makeFakeStore()
  const host = makeFakeHost()
  const logs = []
  const review = new ReviewService(store, host, { logger: { error: msg => logs.push(msg) } })
  // 有审查意见而状态滞留 reviewing → rebuilt（decidable，无异议方）
  const hasOpinionId = await seed(store, { docId: 'PC-RES〔2026〕003号', review: { state: 'reviewing', flag: 'none', count: 0 } })
  await seedReviewOpinion(store, hasOpinionId, '维持：核验无误')
  // 无审查意见而滞留 reviewing → rolledBack 重泵
  const noOpinionId = await seed(store, { docId: 'PC-RES〔2026〕004号', review: { state: 'reviewing', flag: 'none', count: 0 } })
  const result = await review.recoverReviews()
  assert.ok(result.rebuilt.includes(hasOpinionId), '有意见应 rebuilt')
  assert.equal((await store.meeting(hasOpinionId)).review.state, 'decidable')
  assert.ok(result.rolledBack.includes(noOpinionId), '无意见应 rolledBack')
  assert.equal((await store.meeting(noOpinionId)).review.state, 'reviewing', '回滚后泵重出审')
  assert.equal(host.disposeAllCount, 1, '启动恢复先清理替身死会话')
  // loud：池非空而无一出审成功（host 失败）
  const loudStore = makeFakeStore()
  const loudHost = makeFakeHost()
  loudHost.failSpawn = true
  const reviewLoud = new ReviewService(loudStore, loudHost, { logger: { error: msg => logs.push(msg) } })
  const docLoud = await seed(loudStore, { review: { state: 'filed', flag: 'none', count: 0, priority: 0 } })
  await reviewLoud.recoverReviews()
  assert.ok(logs.some(msg => msg.includes('全员出审失败')), '全员失败 loud 报错')
  assert.equal((await loudStore.meeting(docLoud)).review.state, 'filed')
  ok('启动恢复：rebuilt/rolledBack＋死会话清理；全员失败 loud（Q11）')
}

// —— 用例 6：修订谱系对称 ＋ 解释同卷再开轮 ——
{
  const store = makeFakeStore()
  const host = makeFakeHost()
  const review = new ReviewService(store, host)
  const origId = 'PC-RES〔2026〕005号'
  await seed(store, { docId: origId, review: { state: 'feedback', flag: 'none', count: 1, choice: 'revise' } })
  await seedReviewOpinion(store, origId, '建议修订：缺回滚阈值参数')
  const revisedId = 'PC-RES〔2026〕006号'
  await seed(store, { docId: revisedId })
  await review.reviewLinkLanding(origId, { revisedDocId: revisedId })
  const orig = await store.meeting(origId)
  assert.equal(orig.review.revisedDocId, revisedId, '原卷应记修订去向')
  const revised = await store.meeting(revisedId)
  assert.equal(revised.review.originDocId, origId, '新卷应记修订来源')
  assert.ok(revised.review.sourceReviewNote.includes('建议修订'), '新卷应记上轮审查结论摘要')
  // 解释：同卷复审再开一轮（filed → 泵）
  const interpId = 'PC-RES〔2026〕007号'
  await seed(store, { docId: interpId, review: { state: 'feedback', flag: 'none', count: 1, choice: 'interpret' } })
  const spawnBefore = host.spawned.length
  await review.reviewLinkLanding(interpId, { interpretRecordId: 'review:PC-RES:review:主持人#1' })
  assert.equal((await store.meeting(interpId)).review.state, 'reviewing', '解释落板应同卷再开一轮并泵出审')
  assert.ok(host.spawned.length > spawnBefore, '解释再开轮应触发泵')
  const events = await store.records(interpId)
  assert.ok(events.some(record => record.kind === 'review-event' && record.text.includes('再开一轮')), '解释再开轮应有留痕')
  ok('谱系对称＋解释再开轮：修订双向入档；解释同卷 filed→泵出审＋留痕')
}

// —— 用例 7：三分类批量（仅「维持」可批量）——
{
  const store = makeFakeStore()
  const host = makeFakeHost()
  const review = new ReviewService(store, host)
  const keepId = 'PC-RES〔2026〕008号'
  await seed(store, { docId: keepId, review: { state: 'decidable', flag: 'none', count: 1 } })
  await seedReviewOpinion(store, keepId, '维持：决议与规约核验一致')
  const reviseId = 'PC-RES〔2026〕009号'
  await seed(store, { docId: reviseId, review: { state: 'decidable', flag: 'none', count: 1 } })
  await seedReviewOpinion(store, reviseId, '建议修订：缺回滚阈值参数')
  const staleId = 'PC-RES〔2026〕010号'
  await seed(store, { docId: staleId, review: { state: 'decidable', flag: 'none', count: 1 } })
  await seedReviewOpinion(store, staleId, '建议驳回：旧数据方向性语义')
  const results = await review.reviewBatchDismiss('session-leader', { docIds: [keepId, reviseId, staleId] })
  assert.equal(results.find(r => r.docId === keepId)?.state, 'feedback', '维持可批量')
  assert.ok(results.find(r => r.docId === reviseId)?.note.includes('逐件三选'), '建议修订须逐件')
  assert.ok(results.find(r => r.docId === staleId)?.note.includes('逐件三选'), '旧建议驳回须逐件')
  ok('三分类批量：维持批量驳回；修订/解释/（旧）驳回逐件跳过')
}

// —— 用例 8：reviewVerdict 落板 ＋ 交卷销毁替身 ——
{
  const store = makeFakeStore()
  const host = makeFakeHost()
  const review = new ReviewService(store, host)
  // 有异议方（反对票）→ hearing；交卷销毁替身
  const withVoteId = 'PC-RES〔2026〕011号'
  await seed(store, { docId: withVoteId, review: { state: 'reviewing', flag: 'none', count: 0 } })
  await store.putRecord({
    id: `vote:${withVoteId}:1`, docId: withVoteId, kind: 'vote', stage: 'deliberation', round: 1,
    seat: 'npc', authorName: 'c', authorSessionId: 's', text: '【投票】反对\n【理由】缺阈值', stance: '反对', at: Date.now(),
  })
  const fact = await review.reviewVerdict('session-reviewer', { docId: withVoteId, verdict: '建议修订：缺回滚阈值', disposal: '处置：修订后重议' })
  assert.equal(fact.meeting.review?.state, 'hearing', '有异议方应进 hearing')
  assert.ok(host.disposed.some(entry => entry.kind === 'reviewer' && entry.docId === withVoteId), '交卷即销毁替身')
  // 无异议方 → decidable
  const noVoteId = 'PC-RES〔2026〕012号'
  await seed(store, { docId: noVoteId, review: { state: 'reviewing', flag: 'none', count: 0 } })
  const fact2 = await review.reviewVerdict('session-reviewer', { docId: noVoteId, verdict: '维持', disposal: '处置：维持' })
  assert.equal(fact2.meeting.review?.state, 'decidable')
  ok('reviewVerdict：落板后按异议方进 hearing/decidable；交卷销毁替身（Q10-A）')
}

// —— 用例 9：5B 触发链（onStandinDisposed → handleStandinDisposed）——
{
  const store = makeFakeStore()
  const host = makeFakeHost()
  const review = new ReviewService(store, host)
  const docId = await seed(store, { review: { state: 'reviewing', flag: 'none', count: 0 } })
  let fired = 0
  host.onStandinDisposed(info => { fired += 1; void review.handleStandinDisposed(info.docId) })
  host.fireDisposed(docId)
  assert.equal(fired, 1, '5B 回调应触发一次')
  assert.equal((await store.meeting(docId)).review.state, 'reviewing', '兜底应重泵回 reviewing')
  ok('5B 触发链：agent/disposed 回调→handleStandinDisposed 重泵')
}

console.log(`\n✅ review.unit 全部通过：${passed} 项断言组`)