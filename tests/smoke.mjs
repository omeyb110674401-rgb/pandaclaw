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

// —— 监督窗口双门（ADR-0008/0009）：⭐ 阶段计票前须先有关窗预告与监督记录 ——
await expectError('WARNING_REQUIRED', svc.tally(conveneFact.meeting.docId))
await svc.chairRecord(LEADER, { docId: conveneFact.meeting.docId, kind: 'warning', text: '拟计票预告：本阶段计票即将启动，请用户及时提出监督质疑' })
await expectError('SUPERVISION_PENDING', svc.tally(conveneFact.meeting.docId))
// 用户缺席：替身以监督面提交监督意见（不算票、可追溯）
const standinSupervision = await svc.superviseStandin('session-standin', { docId: conveneFact.meeting.docId, text: '外部审计宜先覆盖核心链路' })
assert.equal(standinSupervision.record.authorName, '用户替身')
assert.ok(standinSupervision.record.preview.startsWith('【代·替身】'))
await expectError('ALREADY_RECORDED', svc.superviseStandin('session-standin', { docId: conveneFact.meeting.docId, text: '重复替身意见' }))
ok('监督窗口双门：无 warning 拒计票 / 无监督记录拒计票 / 替身监督计入且防重')

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
// r2 监督窗口收束：用户在场明示放弃，主持人代录（不算票）
await svc.chairRecord(LEADER, { docId: conveneFact.meeting.docId, kind: 'warning', text: '拟计票预告 r2' })
const userWaiver = await svc.chairRecord(LEADER, { docId: conveneFact.meeting.docId, kind: 'supervision', text: '代录·用户：用户明示本阶段无需监督' })
assert.ok(userWaiver.record.kind === 'supervision')
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

// —— 三审制耗尽（MIN/simple，确证书语义：每轮更正，前置门豁免探针内含）——
const minFact = await svc.convene(LEADER, {
  type: 'MIN', topic: '例会纪要确认', tier: 'simple', cppccNames: ['书记员', '列席'], npcNames: ['评审'],
})
const minId = minFact.meeting.docId
await svc.stage(minId, 'advance')
await svc.stage(minId, 'advance') // record → organize → confirm(⭐r1)
for (let round = 1; round <= 3; round++) {
  // 无任何意见书/质询，确证书直接合法（ADR-0002 前置门豁免）
  const ballot = await svc.vote(NPC_A, { docId: minId, name: '评审', stance: '更正', reason: `第${round}轮：纪要缺行动项清单` })
  assert.equal(ballot.record.stance, '更正')
  if (round < 3) {
    const failed = await svc.tally(minId)
    assert.equal(failed.tally.passed, false)
    assert.equal(failed.tally.rule, '无更正(1)=0 且应答1/1达标')
    await svc.stage(minId, 'round')
  }
}
await expectError('ROUND_EXHAUSTED', svc.stage(minId, 'round'))
ok('更正循环上限：第 3 轮后拒绝再开确证轮')

// —— 搁置终止条款 + 散会只读 ——
const terminated = await svc.adjourn(minId, { terminate: true, reason: '三轮未过，议题搁置' })
assert.equal(terminated.meeting.status, 'terminated')
await expectError('NOT_OPEN', svc.submit('session-min-a', { docId: minId, name: '书记员', kind: 'opinion', text: '情况：x。建议：y。' }))
ok('搁置终止：随时可宣布（附原因），终止后只读')

// —— MIN 确证通过路径：无更正即确证 → 成文 → 归档 ——
const min2Fact = await svc.convene(LEADER, {
  type: 'MIN', topic: '周例会纪要', tier: 'simple', cppccNames: ['书记员', '列席'], npcNames: ['评审'],
})
assert.equal(min2Fact.meeting.docId.endsWith('002号'), true)
const min2Id = min2Fact.meeting.docId
await svc.stage(min2Id, 'advance')
await svc.stage(min2Id, 'advance')
await svc.vote(NPC_A, { docId: min2Id, name: '评审', stance: '确认', reason: '记录如实' })
const certified = await svc.tally(min2Id)
assert.equal(certified.tally.passed, true)
assert.equal(certified.tally.rule, '无更正(0)=0 且应答1/1达标')
await svc.chairRecord(LEADER, { docId: min2Id, kind: 'resolution', text: '纪要成文要点：三项议题分条记载；评审已确证。' })
await svc.stage(min2Id, 'advance') // confirm 完成 → archive（末段）
const archivedMin = await svc.adjourn(min2Id)
assert.equal(archivedMin.meeting.status, 'adjourned')
ok('MIN 确证书：无更正即确证，成文后归档')

// —— STR：内圈三形态裁定门 + 终审一致同意（ADR-0003）——
const strFact = await svc.convene(LEADER, {
  type: 'STR', topic: '年度战略聚焦', tier: 'medium',
  cppccNames: ['战略官', '财务官', '市场官'], npcNames: ['代表A', '代表B'],
})
const strId = strFact.meeting.docId
for (let i = 0; i < 4; i++) await svc.stage(strId, 'advance') // → inner-review(⭐r1)
await svc.submit('session-cppcc-a', { docId: strId, name: '战略官', kind: 'opinion', text: '情况：三条业务线两条亏损。分析：资源分散稀释主线。建议：聚焦主线，剥离边缘业务并妥善安置。' })
await svc.submit(NPC_A, { docId: strId, name: '代表A', kind: 'inquiry', text: '边缘业务人员的安置方案是否已纳入？' })
await expectError('RULING_REQUIRED', svc.stage(strId, 'advance'))
await svc.chairRecord(LEADER, { docId: strId, kind: 'ruling', text: '原则通过：聚焦主线方向；意见处置——安置质询采纳并入草案第4节（双联清单见板书）。' })
await svc.stage(strId, 'advance') // → final-approval(⭐r1)
await expectError('STANCE_INVALID', svc.vote(NPC_A, { docId: strId, name: '代表A', stance: '确认', reason: 'x' }))
await svc.vote(NPC_A, { docId: strId, name: '代表A', stance: '赞成', reason: '聚焦方向正确' })
await svc.vote(NPC_B, { docId: strId, name: '代表B', stance: '弃权', reason: '安置细节待观察' })
await svc.chairRecord(LEADER, { docId: strId, kind: 'warning', text: '拟计票预告：终审一致同意前请用户提监督质疑' })
await svc.chairRecord(LEADER, { docId: strId, kind: 'supervision', text: '代录·用户：用户明示无需监督' })
const unanimousFail = await svc.tally(strId)
assert.equal(unanimousFail.tally.passed, false)
assert.equal(unanimousFail.tally.rule, '一致同意：赞成(1) === npc编制(2)')
await svc.chairRecord(LEADER, { docId: strId, kind: 'focus', text: 'F1：安置细节须书面回应后方可终审' })
await svc.stage(strId, 'round')
await svc.vote(NPC_A, { docId: strId, name: '代表A', stance: '赞成', reason: '回应充分' })
await svc.vote(NPC_B, { docId: strId, name: '代表B', stance: '赞成', reason: '撤回保留' })
await svc.chairRecord(LEADER, { docId: strId, kind: 'warning', text: '拟计票预告 r2' })
await svc.chairRecord(LEADER, { docId: strId, kind: 'supervision', text: '代录·用户：用户明示无需监督' })
const unanimousPass = await svc.tally(strId)
assert.equal(unanimousPass.tally.passed, true)
assert.equal(unanimousPass.tally.rule, '一致同意：赞成(2) === npc编制(2)')
ok('STR：内圈裁定门 + 终审一致同意（一票即阻，重议后全赞通过）')

// —— 征询模式呈报三选（ADR-0004）：consultive 不构成表决，①采信出口可归档 ——
const con2Fact = await svc.convene(LEADER, {
  type: 'CON', topic: '日志留存规范征询', tier: 'medium',
  cppccNames: ['架构师', '安全工程师', '增长专家'], npcNames: ['代表A', '代表B'],
})
const con2Id = con2Fact.meeting.docId
for (let i = 0; i < 4; i++) await svc.stage(con2Id, 'advance') // 立项→调研→起草→征求意见→审议(⭐r1)
await svc.submit('session-cppcc-a', { docId: con2Id, name: '架构师', kind: 'opinion', text: goodOpinion })
await svc.submit(NPC_A, { docId: con2Id, name: '代表A', kind: 'inquiry', text: '日志留存期限的合规依据是什么？' })
await svc.vote(NPC_A, { docId: con2Id, name: '代表A', stance: '赞成', reason: '规范必要' })
await svc.chairRecord(LEADER, { docId: con2Id, kind: 'warning', text: '拟计票预告：征求审议后即计票' })
await svc.chairRecord(LEADER, { docId: con2Id, kind: 'supervision', text: '代录·用户：用户明示无需监督' })
const consultiveTally = await svc.tally(con2Id)
assert.equal(consultiveTally.tally.mode, 'consultive')
assert.equal(consultiveTally.tally.passed, false)
// 出口②再议／③终止由既有原语承载（前文路径已覆盖）；此处验证①采信：决议标注非法定状态后照常收尾归档——引擎无门禁
await svc.chairRecord(LEADER, { docId: con2Id, kind: 'resolution', text: '决议（征询采信·未达法定状态）：采纳日志规范意见；应答 1/2 未达 2/3，本结论仅供参考。' })
await svc.stage(con2Id, 'advance') // 审议完成 → 发布（末段）
const consultiveAdjourn = await svc.adjourn(con2Id)
assert.equal(consultiveAdjourn.meeting.status, 'adjourned')
ok('征询模式三选（ADR-0004）：consultive 不构成表决，采信出口标注非法定状态后可归档')

// —— Q4-C 席位认证解锚（ADR-0007）：断线重启后主持人核实转移，原会话永久失效 ——
const con3Fact = await svc.convene(LEADER, {
  type: 'CON', topic: '重绑演练', tier: 'medium',
  cppccNames: ['架构师', '安全工程师', '增长专家'], npcNames: ['代表A', '代表B'],
})
const con3Id = con3Fact.meeting.docId
await svc.stage(con3Id, 'advance')
await svc.stage(con3Id, 'advance') // → drafting(⭐r1)
await svc.submit('session-cppcc-a', { docId: con3Id, name: '架构师', kind: 'opinion', text: goodOpinion })
await expectError('NAME_TAKEN', svc.submit('session-cppcc-a-reborn', { docId: con3Id, name: '架构师', kind: 'opinion', text: goodOpinion.replace('两周', '四周') }))
const rebindFact = await svc.rebind(LEADER, { docId: con3Id, name: '架构师' })
assert.equal(rebindFact.record.kind, 'rebind')
const rebornOpinion = await svc.submit('session-cppcc-a-reborn', {
  docId: con3Id, name: '架构师', kind: 'reply',
  text: '情况说明：断线重启完成，继续以架构师席位履职。',
})
assert.equal(rebornOpinion.pc, 'record')
assert.equal(rebornOpinion.record.kind, 'reply')
await expectError('NAME_TAKEN', svc.submit('session-cppcc-a', { docId: con3Id, name: '架构师', kind: 'reply', text: '我是原会话，要求收回席位。' }))
ok('席位认证解锚（ADR-0007）：NAME_TAKEN → 主持人核实解锚 → 新会话首提交接管、原会话永久失效')

// —— 复审回告闭环（ADR-0010）：主力档 RES 归档自动入池 + 全流程（出审→审查→三选→回告→闭环）——
const resFact = await svc.convene(LEADER, {
  type: 'RES', topic: '数据备份策略决议', tier: 'simple',
  cppccNames: ['架构师', '运维专家'], npcNames: ['代表A'],
})
const resId = resFact.meeting.docId
await svc.stage(resId, 'advance') // initiate → drafting（RES 起草为直办阶段）
await svc.stage(resId, 'advance') // → deliberation(⭐r1，RES 唯一表决阶段)
await svc.submit('session-cppcc-a', { docId: resId, name: '架构师', kind: 'opinion', text: goodOpinion })
await svc.submit('session-cppcc-a', { docId: resId, name: '运维专家', kind: 'opinion', text: goodOpinion.replace('两周', '一日') })
await svc.submit(NPC_A, { docId: resId, name: '代表A', kind: 'inquiry', text: '备份恢复的 RTO 目标是多少？' })
await svc.vote(NPC_A, { docId: resId, name: '代表A', stance: '赞成', reason: '同意' })
await svc.chairRecord(LEADER, { docId: resId, kind: 'warning', text: '拟计票预告 r1' })
await svc.chairRecord(LEADER, { docId: resId, kind: 'supervision', text: '代录·用户：用户无需监督' })
await svc.tally(resId)
await svc.chairRecord(LEADER, { docId: resId, kind: 'resolution', text: '决议：每日全量备份+增量恢复，RTO≤4小时，成文日期=今日。' })
await svc.stage(resId, 'advance') // → publish（末段）
const resAdjourned = await svc.adjourn(resId)
assert.equal(resAdjourned.meeting.status, 'adjourned')
// 主力档（RES）归档自动入池＋归档泵自动出审（Q3-B）：返回快照仍为 filed（入池登记），
// 但泵已当场推进到 reviewing（spawn 审查替身）；flag 无降级标记（skip 非降级，Q4）.
assert.equal(resAdjourned.meeting.review?.state, 'filed')
assert.equal(resAdjourned.meeting.review?.flag, 'none')
const resAfterPump = await svc.inspect(resId)
assert.equal(resAfterPump.meeting.review?.state, 'reviewing')
ok('有备必审＋归档泵（ADR-0010 Q3/Q4）：RES 主力档归档自动入池、泵当场出审至 reviewing，skip 非降级态')

// —— 未归档不可复审 / MIN 不可复审 ——
await expectError('REVIEW_UNAVAILABLE', svc.reviewRequest(LEADER, { docId: con3Id, text: 'X' })) // con3 未归档
const minReviewProbe = await svc.convene(LEADER, { type: 'MIN', topic: 'x', tier: 'simple', cppccNames: ['a', 'b'], npcNames: ['c'] })
await svc.stage(minReviewProbe.meeting.docId, 'advance')
await svc.stage(minReviewProbe.meeting.docId, 'advance')
await svc.vote(NPC_A, { docId: minReviewProbe.meeting.docId, name: 'c', stance: '确认', reason: 'ok' })
await svc.tally(minReviewProbe.meeting.docId)
await svc.chairRecord(LEADER, { docId: minReviewProbe.meeting.docId, kind: 'resolution', text: '纪要' })
await svc.stage(minReviewProbe.meeting.docId, 'advance')
await svc.adjourn(minReviewProbe.meeting.docId)
await expectError('REVIEW_UNAVAILABLE', svc.reviewRequest(LEADER, { docId: minReviewProbe.meeting.docId, text: '审纪要' }))
ok('复审门槛：未归档拒审 / MIN 不产生新决定拒审')

// —— 归档泵自动 spawn 审查替身（Q3-B：桩捕获 spawn 参数；泵只在归档位点处理主力档）——
const spawned = []
const disposed = []
const svcWithSpawn = new PandaClawService(ctx, {
  spawner: {
    spawnReviewer: async (docId, review) => { spawned.push({ docId, hasResolution: review.hasResolution, reviewFlag: review.reviewFlag, originDocId: review.originDocId, sourceReviewNote: review.sourceReviewNote }) },
    disposeReviewer: async docId => { disposed.push(docId) },
    disposeAllStandins: async () => {},
  },
})
// resId 已在 svc.adjourn 时被泵推进到 reviewing（svc 无 spawner 故无 spawn）；验证状态已是 reviewing.
const reviewing = await svcWithSpawn.inspect(resId)
assert.equal(reviewing.meeting.review?.state, 'reviewing')
// 泵已处理过 resId（归档时 filed→reviewing），不再重复 spawn.
assert.equal(spawned.length, 0)
// —— 专项 dispatch（Q1″/Q2 手动窗口）：docIds 指定弱档批量开启 ——
const con4Fact = await svc.convene(LEADER, {
  type: 'CON', topic: '审计接入规范', tier: 'simple',
  cppccNames: ['架构师', '安全工程师'], npcNames: ['代表A'],
})
const con4Id = con4Fact.meeting.docId
for (let i = 0; i < 4; i++) await svc.stage(con4Id, 'advance') // 立项→调研→起草→征求意见→审议(⭐r1)
await svc.submit('session-cppcc-a', { docId: con4Id, name: '架构师', kind: 'opinion', text: goodOpinion })
await svc.submit(NPC_A, { docId: con4Id, name: '代表A', kind: 'inquiry', text: '审计接入的最小日志面？' })
await svc.vote(NPC_A, { docId: con4Id, name: '代表A', stance: '赞成', reason: '必要' })
await svc.chairRecord(LEADER, { docId: con4Id, kind: 'warning', text: '预告' })
await svc.chairRecord(LEADER, { docId: con4Id, kind: 'supervision', text: '代录·用户：无需监督' })
await svc.tally(con4Id) // consultive（应答 1/2）
await svc.chairRecord(LEADER, { docId: con4Id, kind: 'resolution', text: '决议（征询采信·未达法定状态）：采纳审计接入规范；应答 1/2 未达标。' })
await svc.stage(con4Id, 'advance') // → 发布（末段）
await svc.adjourn(con4Id)
// CON 是弱档：归档不入池（review 未创建），用户在场专项 dispatch 批量开启.
const dispatched = await svcWithSpawn.reviewDispatch([con4Id])
assert.deepEqual(dispatched, [con4Id])
assert.equal(spawned.length, 1)
assert.equal(spawned[0].docId, con4Id)
assert.equal(spawned[0].hasResolution, true)
assert.equal(spawned[0].reviewFlag, 'consultive') // 征询采信标记注入审查包（Q4）
const con4After = await svcWithSpawn.inspect(con4Id)
assert.equal(con4After.meeting.review?.state, 'reviewing')
ok('归档泵＋专项 dispatch（Q2/Q3/Q4）：主力档归档泵自动出审；弱档用户在场 docIds 专项开启，征询采信标记进审查包')

// —— 审查替身直写审查意见 → 无异议方进 decidable ——
// 反例：未进入审查阶段的案卷（MIN idle）拒绝替身直写
await expectError('REVIEW_STAGE_BLOCKED', svc.reviewVerdict('session-reviewer', { docId: minReviewProbe.meeting.docId, verdict: 'x', disposal: 'y' }))
const verdictFact = await svcWithSpawn.reviewVerdict('session-reviewer', {
  docId: resId,
  verdict: '维持：备份策略与 RTO 目标相符，未见程序瑕疵',
  disposal: '意见处置：无待回告异议；建议归档维持',
})
// 无异议方（RES simple 全部赞成）→ 直接 decidable
assert.equal(verdictFact.meeting.review?.state, 'decidable')
ok('审查替身直写（Q6/Q7）：reviewing→decidable（无异议方跳过 hearing）')

// —— 用户出口三选：驳回并说明 → 回告 → 闭环 ——
await expectError('REVIEW_CHOICE_INVALID', svcWithSpawn.reviewAdjudicate(LEADER, { docId: resId, choice: '驳回' }))
const dismissed = await svcWithSpawn.reviewAdjudicate(LEADER, { docId: resId, choice: 'dismiss', note: '审查意见与决议一致，无需修订' })
assert.equal(dismissed.meeting.review?.state, 'feedback')
assert.equal(dismissed.meeting.review?.choice, 'dismiss')
// 回告齐备：有备必审自动出审（无用户人工意见，count=0）→ 一条回告即闭环
const replied = await svcWithSpawn.reviewReply(LEADER, { docId: resId, text: '回告：本卷经自动复审审查维持原决议（有备必审例行复核），无需修订。' })
assert.equal(replied.meeting.review?.state, 'closed')
assert.equal(replied.meeting.review?.count, 0)
ok('出口三选＋逐条回告（Q10/Q16/Q5-C）：dismiss → feedback → 回告齐备 → closed')

// —— 分级批量驳回（Q5-A）——con4 已 decidable：批量驳回它 + res2（含修订建议应跳过）——
const con4Verdict = await svcWithSpawn.reviewVerdict('session-reviewer', {
  docId: con4Id,
  verdict: '维持：审计接入规范与风险面相符，采信合理（征询采信核验通过）',
  disposal: '意见处置：经核验征询采信合理，维持归档',
})
assert.equal(con4Verdict.meeting.review?.state, 'decidable')
// 造一件「建议修订」的 decidable 档案验证跳过（复用 res2：RES 归档→泵出审→审查意见建议修订）
const res2Fact = await svcWithSpawn.convene(LEADER, { type: 'RES', topic: 'x2', tier: 'simple', cppccNames: ['a', 'b'], npcNames: ['c'] })
await svcWithSpawn.stage(res2Fact.meeting.docId, 'advance')
await svcWithSpawn.stage(res2Fact.meeting.docId, 'advance')
await svcWithSpawn.submit('session-cppcc-a', { docId: res2Fact.meeting.docId, name: 'a', kind: 'opinion', text: goodOpinion })
await svcWithSpawn.submit(NPC_A, { docId: res2Fact.meeting.docId, name: 'c', kind: 'inquiry', text: 'RTO 目标？' })
await svcWithSpawn.vote(NPC_A, { docId: res2Fact.meeting.docId, name: 'c', stance: '赞成', reason: '同意' })
await svcWithSpawn.chairRecord(LEADER, { docId: res2Fact.meeting.docId, kind: 'warning', text: '预告' })
await svcWithSpawn.chairRecord(LEADER, { docId: res2Fact.meeting.docId, kind: 'supervision', text: '无需监督' })
await svcWithSpawn.tally(res2Fact.meeting.docId)
await svcWithSpawn.chairRecord(LEADER, { docId: res2Fact.meeting.docId, kind: 'resolution', text: '决议：RTO 8 小时。' })
await svcWithSpawn.stage(res2Fact.meeting.docId, 'advance')
await svcWithSpawn.adjourn(res2Fact.meeting.docId) // 归档泵自动出审 res2
await svcWithSpawn.reviewVerdict('session-reviewer', {
  docId: res2Fact.meeting.docId,
  verdict: '建议修订：RTO 8 小时超出业务可接受范围，建议压缩至 4 小时',
  disposal: '处置：建议修订后重议',
})
assert.equal((await svcWithSpawn.inspect(res2Fact.meeting.docId)).meeting.review?.state, 'decidable')
// 批量驳回 [con4Id, res2]：con4 成功（维持），res2 因修订建议被跳过.
const batch = await svcWithSpawn.reviewBatchDismiss(LEADER, { docIds: [con4Id, res2Fact.meeting.docId] })
const con4Batch = batch.find(item => item.docId === con4Id)
assert.equal(con4Batch?.state, 'feedback')
const res2Batch = batch.find(item => item.docId === res2Fact.meeting.docId)
assert.equal(res2Batch?.state, 'decidable')
assert.ok(res2Batch?.note?.includes('逐件'), '修订建议档案应提示逐件三选')
ok('分级批量驳回（Q5-A）：维持/驳回意见可批量；含修订建议的须逐件三选')

// —— 回告闭环：con4 一条回告闭环（专项开启无人工意见，count=0）——
const con4Replied = await svcWithSpawn.reviewReply(LEADER, { docId: con4Id, text: '回告：征询采信经核验维持，另行驳回复审意见如上。' })
assert.equal(con4Replied.meeting.review?.state, 'closed')
assert.equal(con4Replied.meeting.review?.count, 0)
ok('逐条回告闭环（Q5-C）：批量驳回后按条回告即闭环')

// —— Q19：batch-dismiss 三分类收敛——「建议驳回」旧数据逐件（防方向性错误） ——
const oldDismissDoc = await svcWithSpawn.convene(LEADER, { type: 'RES', topic: '旧数据', tier: 'simple', cppccNames: ['a', 'b'], npcNames: ['c'] })
await svcWithSpawn.stage(oldDismissDoc.meeting.docId, 'advance')
await svcWithSpawn.stage(oldDismissDoc.meeting.docId, 'advance')
await svcWithSpawn.submit('session-cppcc-a', { docId: oldDismissDoc.meeting.docId, name: 'a', kind: 'opinion', text: goodOpinion })
await svcWithSpawn.submit(NPC_A, { docId: oldDismissDoc.meeting.docId, name: 'c', kind: 'inquiry', text: 'RTO？' })
await svcWithSpawn.vote(NPC_A, { docId: oldDismissDoc.meeting.docId, name: 'c', stance: '赞成', reason: 'ok' })
await svcWithSpawn.chairRecord(LEADER, { docId: oldDismissDoc.meeting.docId, kind: 'warning', text: '预告' })
await svcWithSpawn.chairRecord(LEADER, { docId: oldDismissDoc.meeting.docId, kind: 'supervision', text: '无需监督' })
await svcWithSpawn.tally(oldDismissDoc.meeting.docId)
await svcWithSpawn.chairRecord(LEADER, { docId: oldDismissDoc.meeting.docId, kind: 'resolution', text: '决议：Y。' })
await svcWithSpawn.stage(oldDismissDoc.meeting.docId, 'advance')
await svcWithSpawn.adjourn(oldDismissDoc.meeting.docId) // 归档泵出审 → reviewing

await svcWithSpawn.reviewVerdict('session-reviewer', {
  docId: oldDismissDoc.meeting.docId,
  verdict: '建议驳回：本决议与现行制度冲突，建议撤销原决议', // 旧数据形态（Q19 后不再产出，兼容读取）
  disposal: '处置：建议驳回原决议',
})
assert.equal((await svcWithSpawn.inspect(oldDismissDoc.meeting.docId)).meeting.review?.state, 'decidable')
const batch19 = await svcWithSpawn.reviewBatchDismiss(LEADER, { docIds: [oldDismissDoc.meeting.docId] })
const oldBatch = batch19.find(item => item.docId === oldDismissDoc.meeting.docId)
assert.equal(oldBatch?.state, 'decidable', '「建议驳回」旧数据应逐件三选（不批量维持）')
assert.ok(oldBatch?.note?.includes('逐件'), '「建议驳回」应提示逐件三选')
ok('batch-dismiss 三分类收敛（Q19）：仅「维持」批量；「建议驳回」旧数据逐件防方向性错误')

// —— Q17-A/Q18-A 归档门禁：表决阶段无 tally 拦归档（决定必经表决） ——
const gateBlocked = await svcWithSpawn.convene(LEADER, { type: 'RES', topic: '门禁拦截', tier: 'simple', cppccNames: ['a', 'b'], npcNames: ['c'] })
await svcWithSpawn.stage(gateBlocked.meeting.docId, 'advance')
await svcWithSpawn.stage(gateBlocked.meeting.docId, 'advance') // → deliberation(⭐r1)
await svcWithSpawn.submit('session-cppcc-a', { docId: gateBlocked.meeting.docId, name: 'a', kind: 'opinion', text: goodOpinion })
await svcWithSpawn.submit(NPC_A, { docId: gateBlocked.meeting.docId, name: 'c', kind: 'inquiry', text: 'RTO？' })
await svcWithSpawn.vote(NPC_A, { docId: gateBlocked.meeting.docId, name: 'c', stance: '赞成', reason: 'ok' })
await svcWithSpawn.chairRecord(LEADER, { docId: gateBlocked.meeting.docId, kind: 'warning', text: '预告' })
await svcWithSpawn.chairRecord(LEADER, { docId: gateBlocked.meeting.docId, kind: 'supervision', text: '无需监督' })
// 先决议（无 tally）→ 推进到末段 → 归档应被「决定必经表决」门禁拦下.
await svcWithSpawn.chairRecord(LEADER, { docId: gateBlocked.meeting.docId, kind: 'resolution', text: '决议：跳过计票直接成文。' })
await svcWithSpawn.stage(gateBlocked.meeting.docId, 'advance') // → publish（末段）
await expectError('ADJOURN_BLOCKED', svcWithSpawn.adjourn(gateBlocked.meeting.docId)) // 无 tally 拦归档
// 对照：先 tally 再归档——成功.
const gateFact = await svcWithSpawn.convene(LEADER, { type: 'RES', topic: '门禁通过', tier: 'simple', cppccNames: ['a', 'b'], npcNames: ['c'] })
await svcWithSpawn.stage(gateFact.meeting.docId, 'advance')
await svcWithSpawn.stage(gateFact.meeting.docId, 'advance')
await svcWithSpawn.submit('session-cppcc-a', { docId: gateFact.meeting.docId, name: 'a', kind: 'opinion', text: goodOpinion })
await svcWithSpawn.submit(NPC_A, { docId: gateFact.meeting.docId, name: 'c', kind: 'inquiry', text: 'RTO？' })
await svcWithSpawn.vote(NPC_A, { docId: gateFact.meeting.docId, name: 'c', stance: '赞成', reason: 'ok' })
await svcWithSpawn.chairRecord(LEADER, { docId: gateFact.meeting.docId, kind: 'warning', text: '预告' })
await svcWithSpawn.chairRecord(LEADER, { docId: gateFact.meeting.docId, kind: 'supervision', text: '无需监督' })
await svcWithSpawn.tally(gateFact.meeting.docId)
await svcWithSpawn.chairRecord(LEADER, { docId: gateFact.meeting.docId, kind: 'resolution', text: '决议：OK。' })
await svcWithSpawn.stage(gateFact.meeting.docId, 'advance')
const gateAdjourned = await svcWithSpawn.adjourn(gateFact.meeting.docId)
assert.equal(gateAdjourned.meeting.status, 'adjourned')
ok('归档门禁 tally（Q17/Q18）：表决阶段无计票记录拦归档，先计票后可归档')

// —— Q2/Q4/Q8：spawn 失败回滚 filed；自动语境静默、用户语境抛错 ——
const failSpawned = []
const failDisposed = []
const svcFailSpawn = new PandaClawService(ctx, {
  spawner: {
    spawnReviewer: async () => { throw new Error('底座未就绪') },
    disposeReviewer: async docId => { failDisposed.push(docId) },
    disposeAllStandins: async () => {},
  },
})
const failRes = await svcFailSpawn.convene(LEADER, { type: 'RES', topic: '失败演练', tier: 'simple', cppccNames: ['a', 'b'], npcNames: ['c'] })
await svcFailSpawn.stage(failRes.meeting.docId, 'advance')
await svcFailSpawn.stage(failRes.meeting.docId, 'advance')
await svcFailSpawn.submit('session-cppcc-a', { docId: failRes.meeting.docId, name: 'a', kind: 'opinion', text: goodOpinion })
await svcFailSpawn.submit(NPC_A, { docId: failRes.meeting.docId, name: 'c', kind: 'inquiry', text: 'RTO？' })
await svcFailSpawn.vote(NPC_A, { docId: failRes.meeting.docId, name: 'c', stance: '赞成', reason: 'ok' })
await svcFailSpawn.chairRecord(LEADER, { docId: failRes.meeting.docId, kind: 'warning', text: '预告' })
await svcFailSpawn.chairRecord(LEADER, { docId: failRes.meeting.docId, kind: 'supervision', text: '无需监督' })
await svcFailSpawn.tally(failRes.meeting.docId)
await svcFailSpawn.chairRecord(LEADER, { docId: failRes.meeting.docId, kind: 'resolution', text: '决议：X。' })
await svcFailSpawn.stage(failRes.meeting.docId, 'advance')
await svcFailSpawn.adjourn(failRes.meeting.docId) // 归档泵：spawn 失败 → 自动语境静默回滚 filed（不抛错）
const failAfterPump = await svcFailSpawn.inspect(failRes.meeting.docId)
assert.equal(failAfterPump.meeting.review?.state, 'filed', 'spawn 失败应回滚 filed 留池')
// review-event 已落板（Q7）
const failRecords = failAfterPump.records
assert.ok(failRecords.some(record => record.kind === 'review-event' && record.preview.includes('派发失败')), 'spawn 失败应有 review-event 留痕')
// 用户语境 dispatch：失败抛错给发起人（Q8）
await expectError('REVIEW_SPAWN_FAILED', svcFailSpawn.reviewDispatch([failRes.meeting.docId]))
ok('spawn 失败韧性（Q2/Q7/Q8）：自动语境静默回滚＋review-event 留痕；用户语境抛错')

// —— Q5-C/Q6：restart 逃生门——废弃旧替身、立即重出审 ——
const restartDoc = gateFact.meeting.docId // 当前 reviewing
const restartFact = await svcWithSpawn.reviewRestart(restartDoc)
assert.equal(restartFact.meeting.review?.state, 'reviewing')
assert.ok(disposed.includes(restartDoc), 'restart 应废弃旧替身（disposeReviewer）')
const restartAgain = await svcWithSpawn.reviewRestart(restartDoc) // 逃生门可重复（再次废弃旧替身重出审）
assert.equal(restartAgain.meeting.review?.state, 'reviewing')
await expectError('REVIEW_STAGE_BLOCKED', svcWithSpawn.reviewRestart(minReviewProbe.meeting.docId)) // 非审查态（MIN 无 review）拒 restart
ok('restart 逃生门（Q5/Q6）：reviewing 档案 restart 废弃旧替身并立即重出审，可重复')

// —— Q5-B：替身会话意外销毁兜底——reviewing 无审查意见 → 回滚 filed 重泵 ——
const disposedDocId = gateFact.meeting.docId // 已归档且泵出审后 reviewing
const gateState = (await svcWithSpawn.inspect(disposedDocId)).meeting.review?.state
assert.equal(gateState, 'reviewing')
// 直接模拟 dispose 兜底（handleStandinDisposed）：无审查意见 → 回滚 filed → 泵重开 reviewing
await svcWithSpawn.handleStandinDisposed(disposedDocId)
const afterDisposeFallback = await svcWithSpawn.inspect(disposedDocId)
assert.equal(afterDisposeFallback.meeting.review?.state, 'reviewing', 'dispose 兜底应回滚并重泵回 reviewing')
assert.ok(afterDisposeFallback.records.some(record => record.kind === 'review-event' && record.preview.includes('意外销毁')), 'dispose 兜底应有 review-event 留痕')
ok('dispose 兜底（Q5-B）：reviewing 无审查意见 → 回滚 filed 自动重泵＋留痕')

// —— Q1/Q3：启动恢复（recoverReviews）——重建滞留档案 ——
// gateFact 此时 reviewing 且无审查意见（dispose 兜底重泵后）→ 启动恢复应回滚并按 priority 重泵.
const recovery = await svcWithSpawn.recoverReviews()
assert.ok(recovery.rolledBack.includes(disposedDocId), '启动恢复应回滚滞留 reviewing 档案')
const recoveredGate = await svcWithSpawn.inspect(disposedDocId)
assert.equal(recoveredGate.meeting.review?.state, 'reviewing', '启动恢复应把回滚档案重新泵出审')
ok('启动恢复（Q1/Q3/Q9）：recoverReviews 重建滞留 reviewing 档案')

// —— Q14：修订谱系双向入档 ＋ 审查包注入 ——
const reviseDoc = gateFact.meeting.docId
await svcWithSpawn.reviewVerdict('session-reviewer', {
  docId: reviseDoc,
  verdict: '建议修订：决议未含回滚阈值参数，建议修订重议',
  disposal: '处置：建议修订后重议',
})
const reviseDecidable = await svcWithSpawn.inspect(reviseDoc)
assert.equal(reviseDecidable.meeting.review?.state, 'decidable')
await svcWithSpawn.reviewAdjudicate(LEADER, { docId: reviseDoc, choice: 'revise' })
// 修订新卷：convene 同类型新会议（RES）
const revisedFact = await svcWithSpawn.convene(LEADER, { type: 'RES', topic: '修订版', tier: 'simple', cppccNames: ['a', 'b'], npcNames: ['c'] })
const revisedId = revisedFact.meeting.docId
await svcWithSpawn.reviewLinkLanding(reviseDoc, { revisedDocId: revisedId })
const revisedView = await svcWithSpawn.inspect(revisedId)
assert.equal(revisedView.meeting.review?.originDocId, reviseDoc, '新卷应记录修订来源（Q14）')
assert.ok(revisedView.meeting.review?.sourceReviewNote?.includes('建议修订'), '新卷应记录上轮审查结论摘要（Q14）')
ok('修订谱系双向入档（Q14）：新卷 originDocId/sourceReviewNote 落板')

// —— Q15：解释性决议同效力同义务——同卷复审再开一轮 ——
const interpretDoc = resId // resId 已 closed（本轮已闭环）
const interpretOpen = await svcWithSpawn.reviewRequest(LEADER, { docId: interpretDoc, text: '对「每日全量备份」的解释能否覆盖增量场景？' })
assert.equal(interpretOpen.meeting.review?.state, 'reviewing') // 二审再开（request 意见落板后 startReview）
// 二审替身意见（维持）
await svcWithSpawn.reviewVerdict('session-reviewer', {
  docId: interpretDoc,
  verdict: '维持：决议已含增量恢复约束，解释性决议足以覆盖增量场景',
  disposal: '处置：维持，待用户出口',
})
await svcWithSpawn.reviewAdjudicate(LEADER, { docId: interpretDoc, choice: 'interpret' })
const interpretLinked = await svcWithSpawn.reviewLinkLanding(interpretDoc, { interpretRecordId: 'review:PC-RES:review:主持人#1' })
assert.equal(interpretLinked.meeting.review?.state, 'reviewing', '解释落地应同卷再开一轮（Q15）：filed 入池后主力档立即泵出审')
const interpretEvents = (await svcWithSpawn.inspect(interpretDoc)).records
assert.ok(interpretEvents.some(record => record.kind === 'review-event' && record.preview.includes('再开一轮')), '解释再开轮应有 review-event 留痕')
ok('解释性决议同效力同义务（Q15）：同卷复审再开一轮＋留痕')

console.log(`\n✅ 冒烟全部通过：${passed} 项断言组`)
