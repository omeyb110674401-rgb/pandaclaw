/**
 * PandaClaw 服务层端到端冒烟：真实走完协商型会议的关键裁决路径.
 *
 * 场景（CON / medium，编制 cppcc3+npc2）：
 *   建会 → 阶段推进至起草(⭐) → 意见书超限拒收 → 合格收录 → 前置门拦截
 *   → 质询补齐 → 一轮表决未过 → 打回重议(r2) → 二轮通过 → 归档门禁 → 散会.
 *
 * 运行前提：`pnpm run build` 已产出 dist/index.js；存储域用内存假体替换.
 */

import assert from 'node:assert/strict'
import { PandaClawService } from '../dist/index.js'

/** 内存 KvTable 假体（与 storage-domain 的表契约同形；读取即解耦快照，模拟真实后端的不可变语义）. */
function makeTable() {
  const map = new Map()
  const clone = value => value === undefined ? undefined : structuredClone(value)
  return {
    get: key => clone(map.get(key)),
    entries: () => [...map.entries()].map(([key, value]) => [key, clone(value)]).values(),
    keys: () => map.keys(),
    get size() { return map.size },
    put: async (key, value) => { map.set(key, clone(value)) },
    delete: async key => map.delete(key),
    update: async (key, fn) => {
      const next = fn(clone(map.get(key)))
      map.set(key, clone(next))
      return clone(next)
    },
  }
}

function makeCtx() {
  const tables = { meetings: makeTable(), records: makeTable(), tallies: makeTable() }
  return {
    tables,
    storageDomain: {
      open: async () => ({
        name: 'pandaclaw',
        table: name => tables[name],
        close: async () => {},
      }),
    },
    // Service 基类构造时会向 fiber 注册自身；测试假体只需吞掉这一步.
    reflect: { provide: () => {} },
  }
}

const LEADER = 'session-leader-1'
const NPC_A = 'session-npc-a'
const NPC_B = 'session-npc-b'
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
}

function textOf(fact) {
  return fact.pc === 'meeting' ? fact.meeting : fact.pc === 'record' ? fact.record : fact.tally
}

const ctx = makeCtx()
const svc = new PandaClawService(ctx)

// —— 建会 ——
const conveneFact = await svc.convene(LEADER, {
  type: 'CON',
  topic: '引入灰度发布制度',
  tier: 'medium',
  cppccNames: ['架构师', '安全工程师', '增长专家'],
  npcNames: ['代表A', '代表B'],
})
assert.equal(conveneFact.pc, 'meeting')
assert.match(conveneFact.meeting.docId, /^PC-CON〔\d{4}〕001号$/)
ok('建会：文号分配与默认验收模式')

await expectError('ROSTER_MISMATCH', svc.convene(LEADER, {
  type: 'MIN', topic: 'x', tier: 'medium', cppccNames: ['a'], npcNames: ['b'],
}))

// —— 非回路阶段（立项）不收成员产物 ——
await expectError('NOT_DELIBERATIVE', svc.submit(NPC_A, { docId: conveneFact.meeting.docId, name: '代表A', kind: 'inquiry', text: '此时还没到回路' }))

// —— 推进到起草回路（initiate → research → drafting⭐）——
await svc.stage(conveneFact.meeting.docId, 'advance')
const draftingFact = await svc.stage(conveneFact.meeting.docId, 'advance')
const activeDrafting = draftingFact.meeting.stages.find(stage => stage.state === 'active')
assert.equal(activeDrafting.id, 'drafting')
assert.equal(activeDrafting.round, 1)
ok('阶段机：沿流推进且回路阶段自带轮次')

// —— M4 准入：超限退回 / 缺结构拒收 / 合格收录 ——
const longText = '情'.repeat(301)
await expectError('WORD_LIMIT', svc.submit('session-cppcc-a', { docId: conveneFact.meeting.docId, name: '架构师', kind: 'opinion', text: longText }))
const noStructure = '我觉得很好。'.repeat(30)
await expectError('STRUCTURE_FAIL', svc.submit('session-cppcc-a', { docId: conveneFact.meeting.docId, name: '架构师', kind: 'opinion', text: noStructure.slice(0, 200) }))
const goodOpinion = `情况：当前发布全量上线，回滚成本高，风险集中。分析：灰度可按流量百分比分批暴露问题。建议：采用5%-25%-50%-100%四档灰度，配合自动指标回滚阈值，两周试运行后评估转固。`
const opinionFact = await svc.submit('session-cppcc-a', { docId: conveneFact.meeting.docId, name: '架构师', kind: 'opinion', text: goodOpinion })
assert.equal(opinionFact.record.verdict, 'admitted')
ok('准入审查：字限/结构硬项按 M4 执行')

await expectError('ALREADY_RECORDED', svc.submit('session-cppcc-a', { docId: conveneFact.meeting.docId, name: '架构师', kind: 'opinion', text: goodOpinion + '补充一句。' }))

// —— 表决只发生在审议阶段：起草阶段付表决被状态机拒绝 ——
await expectError('VOTE_STAGE_ONLY', svc.vote(NPC_A, { docId: conveneFact.meeting.docId, name: '代表A', stance: '赞成', reason: '方向可行' }))

// —— 推进至审议（⭐表决阶段，r1）——
await svc.stage(conveneFact.meeting.docId, 'advance')
const delibFact = await svc.stage(conveneFact.meeting.docId, 'advance')
assert.equal(delibFact.meeting.stages.find(stage => stage.state === 'active').id, 'deliberation')

// —— 表决前置门（红线2）：本阶段缺意见书与质询不得投票 ——
await expectError('PRE_VOTE_GATE', svc.vote(NPC_A, { docId: conveneFact.meeting.docId, name: '代表A', stance: '赞成', reason: '方向可行' }))

// 补齐本阶段文书：新意见书 + 书面质询
await svc.submit('session-cppcc-a', { docId: conveneFact.meeting.docId, name: '增长专家', kind: 'opinion', text: goodOpinion.replace('回滚成本高', '试错窗口窄') })
await svc.submit(NPC_A, { docId: conveneFact.meeting.docId, name: '代表A', kind: 'inquiry', text: '灰度期间线上事故的责任如何界定？' })

// —— 名单外成员拒绝 / 冒名绑定拒绝 / 重复票 ——
await expectError('SEAT_FORBIDDEN', svc.vote(NPC_A, { docId: conveneFact.meeting.docId, name: '代表C', stance: '赞成', reason: 'x' }))
await svc.vote(NPC_A, { docId: conveneFact.meeting.docId, name: '代表A', stance: '赞成', reason: '方向可行' })
await expectError('NAME_TAKEN', svc.vote(NPC_B, { docId: conveneFact.meeting.docId, name: '代表A', stance: '赞成', reason: '冒名' }))
await expectError('DUPLICATE_VOTE', svc.vote(NPC_A, { docId: conveneFact.meeting.docId, name: '代表A', stance: '赞成', reason: '重复票' }))

// —— 一轮计票：仅 1 人应答（应答率 1/2 < 2/3）⇒ 降级征询模式且未通过 ——
const tallyFail = await svc.tally(conveneFact.meeting.docId)
assert.equal(tallyFail.tally.mode, 'consultive')
assert.equal(tallyFail.tally.passed, false)
assert.equal(tallyFail.tally.rule, '赞成(1) > npc编制(2)÷2')
await expectError('ALREADY_RECORDED', svc.tally(conveneFact.meeting.docId))
ok('机械计票 M1：应答率不足降级征询模式，且不可重复计票')

// —— 三审制：打回重议 r2 通过 ——
await svc.chairRecord(LEADER, { docId: conveneFact.meeting.docId, kind: 'focus', text: 'F1 可行性：责任界定缺失；F2 合规：无' })
const round2 = await svc.stage(conveneFact.meeting.docId, 'round')
assert.equal(round2.meeting.stages.find(stage => stage.state === 'active').round, 2)
const r2opinion = await svc.submit('session-cppcc-a', { docId: conveneFact.meeting.docId, name: '安全工程师', kind: 'opinion', text: goodOpinion.replace('两周', '三周') })
assert.equal(r2opinion.record.verdict, 'admitted')
await svc.submit(NPC_B, { docId: conveneFact.meeting.docId, name: '代表B', kind: 'inquiry', text: '新增了三周评估期，定责条款补充了吗？' })
await svc.vote(NPC_A, { docId: conveneFact.meeting.docId, name: '代表A', stance: '赞成', reason: '已补充' })
await svc.vote(NPC_B, { docId: conveneFact.meeting.docId, name: '代表B', stance: '赞成', reason: '定责清晰' })
const tallyPass = await svc.tally(conveneFact.meeting.docId)
assert.equal(tallyPass.tally.passed, true)
assert.equal(tallyPass.tally.mode, 'formal')
assert.equal(tallyPass.tally.rule, '赞成(2) > npc编制(2)÷2')
ok('三审制重议：r2 焦点修订后 2赞 通过')

// —— 收口：审议完成进入发布（末段），归档自动视为完成收尾 ——
await svc.stage(conveneFact.meeting.docId, 'advance')

// —— 归档门禁（红线8）：无 resolution 不得散会 ——
await expectError('ADJOURN_BLOCKED', svc.adjourn(conveneFact.meeting.docId))
await svc.chairRecord(LEADER, { docId: conveneFact.meeting.docId, kind: 'resolution', text: '决议：采纳四档灰度+三周评估，成文日期=今日；票数明细 r2 2赞0反0弃。' })
// 末段自动收尾：publish 仍活动，adjourn 视为完成收尾
const adjourned = await svc.adjourn(conveneFact.meeting.docId)
assert.equal(adjourned.meeting.status, 'adjourned')
await expectError('NOT_OPEN', svc.submit('session-cppcc-a', { docId: conveneFact.meeting.docId, name: '架构师', kind: 'opinion', text: goodOpinion }))
ok('归档门禁：resolution 在案方可散会，散会后只读')

// —— inspect 取数口 ——
const detail = await svc.inspect(conveneFact.meeting.docId)
assert.equal(detail.records.length >= 9, true)
assert.equal(detail.tallies.length, 2)

// —— 三审制耗尽（MIN/simple，评审每轮否决）——
const minFact = await svc.convene(LEADER, {
  type: 'MIN', topic: '例会纪要确认', tier: 'simple', cppccNames: ['书记员', '列席'], npcNames: ['评审'],
})
const minId = minFact.meeting.docId
await svc.stage(minId, 'advance')
await svc.stage(minId, 'advance') // record → organize → confirm(⭐r1)
for (let round = 1; round <= 3; round++) {
  await svc.submit('session-min-a', { docId: minId, name: '书记员', kind: 'opinion', text: '情况：例会已完成。建议：按讨论要点整理纪要存档。' })
  await svc.submit(NPC_A, { docId: minId, name: '评审', kind: 'inquiry', text: '纪要是否包含行动项清单？' })
  const ballot = await svc.vote(NPC_A, { docId: minId, name: '评审', stance: '反对', reason: `第${round}轮仍未附行动项` })
  assert.equal(ballot.record.stance, '反对')
  if (round < 3) {
    const failed = await svc.tally(minId)
    assert.equal(failed.tally.passed, false)
    await svc.chairRecord(LEADER, { docId: minId, kind: 'focus', text: `F${round}：缺行动项清单` })
    await svc.stage(minId, 'round')
  }
}
await expectError('ROUND_EXHAUSTED', svc.stage(minId, 'round'))
ok('三审制上限：第 3 轮后拒绝开新一轮')

// —— 搁置终止条款 + 散会只读 ——
const terminated = await svc.adjourn(minId, { terminate: true, reason: '三轮未过，议题搁置' })
assert.equal(terminated.meeting.status, 'terminated')
await expectError('NOT_OPEN', svc.submit('session-min-a', { docId: minId, name: '书记员', kind: 'opinion', text: '情况：x。建议：y。' }))
ok('搁置终止：随时可宣布（附原因），终止后只读')

console.log(`\n✅ 冒烟全部通过：${passed} 项断言组`)
