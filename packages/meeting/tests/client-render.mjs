/**
 * 客户端渲染冒烟：node 直跑 `dist/client.js`（宿主模块表注册脚本），stub
 * `window.__ModuleLoader__` 捕获其定义、以 stub require 驱动 factory，再用
 * stub ctx 捕获注册的「会议舞台」组件，以夹具看板做 SSR 渲染并断言关键
 * UI 结构.
 *
 * 守护面：顶栏统计与筛选、当前阶段行、计票历史（含征询标注）、记录流
 * （种类筛选/退回理由/裁定标签/决议强调）、空态快速开始模板.
 * 运行：`node tests/client-render.mjs`.
 */

import { createElement } from 'react'
import { renderToString } from 'react-dom/server'

const runtimeStub = await import('./stubs/runtime-stub.mjs')
const reactModule = await import('react')

// ---- 捕获模块表注册并驱动 factory ----
const registry = []
globalThis.window = { __ModuleLoader__: { load(definition) { registry.push(definition) } } }
await import('../dist/client.js')
if (registry.length === 0) throw new Error('client bundle 未向模块表注册任何定义')
const definition = registry[registry.length - 1]
const clientExports = definition.factory((specifier) => {
  if (specifier === 'react') return reactModule
  if (specifier === '@deepseek-ai/dsh-client-runtime/client') return runtimeStub
  throw new Error(`client bundle 意外的裸导入：${specifier}`)
})
const { apply } = clientExports

// ---- 夹具看板：一场进行中的协商型＋一场已归档的决议型 ----
const now = Date.now()
const board = {
  meetings: [
    {
      docId: 'PC-20260826-CON-01', type: 'CON', tier: 'complex', validation: 'key',
      topic: '是否引入第三方安全审计', status: 'open',
      members: [
        { name: '文渊', seat: 'cppcc' },
        { name: '守拙', seat: 'npc' },
      ],
      stages: [
        { id: 'r1', label: 'R1 质询答辩', deliberative: true, state: 'done', round: 1 },
        { id: 'r2', label: 'R2 草案表决', deliberative: true, state: 'active', round: 2 },
        { id: 'm4', label: 'M4 准入审查', deliberative: false, state: 'pending' },
      ],
      currentStage: 'r2', createdAt: now - 3_600_000,
    },
    {
      docId: 'PC-20260825-RES-01', type: 'RES', tier: 'simple', validation: 'skip',
      topic: '采纳 v1.4.0 UI 方案', status: 'adjourned',
      members: [{ name: '文渊', seat: 'cppcc' }],
      stages: [{ id: 'vote', label: '表决', deliberative: false, state: 'done' }],
      review: { state: 'closed', flag: 'skip-validation', count: 1, choice: 'dismiss' },
      createdAt: now - 86_400_000, closedAt: now - 72_000_000,
    },
  ],
  records: [
    { id: 'a1', docId: 'PC-20260826-CON-01', kind: 'agenda', stage: 'open', seat: 'chair', authorName: '主持人', authorSessionId: 's', preview: '议题包：第三方安全审计可行性', wordCount: 120, at: now - 3_500_000 },
    { id: 'a2', docId: 'PC-20260826-CON-01', kind: 'opinion', stage: 'r1', round: 1, seat: 'cppcc', authorName: '文渊', authorSessionId: 's', preview: '建议分两阶段引入审计', wordCount: 210, verdict: 'admitted', at: now - 3_000_000 },
    { id: 'a3', docId: 'PC-20260826-CON-01', kind: 'opinion', stage: 'r1', round: 1, seat: 'npc', authorName: '守拙', authorSessionId: 's', preview: '（过短意见）', wordCount: 18, verdict: 'rejected', reason: '未达 M4 最低字数', at: now - 2_900_000 },
    { id: 'a4', docId: 'PC-20260826-CON-01', kind: 'reply', stage: 'r1', round: 1, seat: 'cppcc', authorName: '文渊', authorSessionId: 's', preview: '答辩：审计范围先覆盖核心链路', wordCount: 150, at: now - 2_800_000 },
    { id: 'a5', docId: 'PC-20260826-CON-01', kind: 'ruling', stage: 'gate', seat: 'chair', authorName: '主持人', authorSessionId: 's', preview: '用户批复：放行进入表决', wordCount: 30, at: now - 2_000_000 },
    { id: 'a6', docId: 'PC-20260825-RES-01', kind: 'vote', stage: 'vote', seat: 'cppcc', authorName: '文渊', authorSessionId: 's', preview: '选票：赞成', wordCount: 6, stance: '赞成', at: now - 73_000_000 },
    { id: 'a7', docId: 'PC-20260825-RES-01', kind: 'resolution', stage: 'close', seat: 'chair', authorName: '主持人', authorSessionId: 's', preview: '决议：采纳 v1.4.0 UI 方案', wordCount: 88, at: now - 72_000_000 },
    { id: 'a8', docId: 'PC-20260826-CON-01', kind: 'rebind', stage: 'open', seat: 'npc', authorName: '守拙', authorSessionId: 's2', preview: '断线重启，认证重绑接管席位', wordCount: 26, at: now - 1_000_000 },
    { id: 'a9', docId: 'PC-20260826-CON-01', kind: 'warning', stage: 'r2', round: 2, seat: 'chair', authorName: '主持人', authorSessionId: 's', preview: '拟就「R2 草案表决」计票，监督窗口即将关闭，请用户及时提出监督质疑', wordCount: 42, at: now - 900_000 },
    { id: 'a10', docId: 'PC-20260826-CON-01', kind: 'supervision', stage: 'r2', round: 2, seat: 'chair', authorName: '用户替身', authorSessionId: 's3', preview: '【代·替身】外部审计范围宜先覆盖核心链路，建议关注供应商准入风险', wordCount: 34, at: now - 800_000 },
  ],
  tallies: [
    { docId: 'PC-20260826-CON-01', stage: 'r1', round: 1, aye: 1, nay: 1, abstain: 0, rosterSize: 3, responded: 2, mode: 'consultive', passed: false, rule: 'double-two-thirds', at: now - 1_500_000 },
    { docId: 'PC-20260825-RES-01', stage: 'vote', round: 1, aye: 1, nay: 0, abstain: 0, rosterSize: 1, responded: 1, mode: 'formal', passed: true, rule: 'majority', at: now - 72_100_000 },
  ],
}

// ---- stub ctx：捕获 slots.register 的视图组件 ----
const captured = []
const passthrough = (fn) => {
  const dispose = fn()
  return () => {
    if (typeof dispose === 'function') dispose()
  }
}
const ctx = {
  effect: passthrough,
  locale: {
    register: () => () => {},
    bind: () => (key) => key,
  },
  sessions: {
    list: {
      getSnapshot: () => ({ current: 'sess-1' }),
      subscribe: () => () => {},
    },
    binding: () => ({
      session: {
        projections: {
          faceOf: () => ({ getSnapshot: () => undefined, subscribe: () => () => {} }),
        },
      },
    }),
  },
  slots: {
    inject: (_name, factory) => passthrough(factory),
    register: (def, Component) => {
      captured.push({ def, Component })
      return () => {}
    },
  },
}

apply(ctx)
if (captured.length === 0) throw new Error('client apply 未注册任何视图组件')
const { Component } = captured[captured.length - 1]

let failed = 0
/** @param {string} name @param {string} html @param {readonly string[]} needles */
function expectAll(name, html, needles) {
  for (const needle of needles) {
    if (html.includes(needle)) console.log(`  ✅ ${name}：「${needle}」`)
    else {
      console.error(`  ❌ ${name}：未找到「${needle}」`)
      failed += 1
    }
  }
}

// ---- 有会看板 ----
console.log('▶ 会议看板渲染')
const html = renderToString(createElement(Component, { useBoard: selector => selector(board) }))

expectAll('顶栏', html, ['1 案进行中', '1 案已结', '10 条记录', '全部 2', '进行中 1', '已归档 1'])
expectAll('会议卡元信息', html, ['案卷号 PC-20260826-CON-01', '协商', '复杂 · 关键点验收', '立案于', '名册（2）'])
expectAll('当前阶段行', html, ['当前：', 'R2 草案表决', '· r2', '⭐'])
expectAll('计票历史', html, ['r2', '赞成 1 · 反对 1 · 弃权 0', '应答 2/3', '征询·不构成表决', '未通过', '通过'])
expectAll('监督窗口', html, ['监督窗口 · 二阶段（替身监督）', '用户回来自动获追认/撤回权'])
expectAll('复审面板', html, ['复审 · 已闭环（意见 1 条）', '案卷 PC-20260825-RES-01 复审已闭环。'])
expectAll('记录流', html, ['记录流（8 条）', '全部 8', '意见书 2', '监督意见 1', '关窗预告 1', '裁定', '认证重绑', '代·替身', '[协]文渊', '已退回·未达 M4 最低字数', '210字'])
if (!/border-left:3px solid #c0392b/.test(html)) {
  console.error('  ❌ 决议记录左边框强调缺失')
  failed += 1
} else console.log('  ✅ 决议记录左边框强调')
// 排序：进行中在前
const conAt = html.indexOf('PC-20260826-CON-01')
const resAt = html.indexOf('PC-20260825-RES-01')
if (conAt >= 0 && resAt >= 0 && conAt < resAt) console.log('  ✅ 排序：进行中会议在前')
else {
  console.error('  ❌ 排序异常：进行中会议未排在已归档之前')
  failed += 1
}

// ---- 监督窗口四态（独立小看板，逐态断言）----
console.log('▶ 监督窗口状态渲染')
const winMeeting = {
  docId: 'PC-20260826-CON-99', type: 'CON', tier: 'medium', validation: 'key',
  topic: '监督窗口四态用例', status: 'open',
  members: [{ name: '文渊', seat: 'cppcc' }],
  stages: [{ id: 'r2', label: 'R2 草案表决', deliberative: true, state: 'active', round: 2 }],
  currentStage: 'r2', createdAt: now - 600_000,
}
const winRecords = (extra) => [{ id: 'w1', docId: 'PC-20260826-CON-99', kind: 'warning', stage: 'r2', round: 2, seat: 'chair', authorName: '主持人', authorSessionId: 's', preview: '拟计票预告', wordCount: 8, at: now - 500_000 }, ...extra]
const winTally = [{ docId: 'PC-20260826-CON-99', stage: 'r2', round: 2, aye: 1, nay: 0, abstain: 0, rosterSize: 1, responded: 1, mode: 'formal', passed: true, rule: 'majority', at: now - 100_000 }]
const winBoard = (records, tallies) => ({ meetings: [winMeeting], records, tallies })

const stateHtml = (records, tallies) => renderToString(createElement(Component, {
  useBoard: selector => selector(winBoard(records, tallies)),
}))

// 开放·一阶段：无任何记录
const openHtml = stateHtml([], [])
expectAll('开放·一阶段', openHtml, ['监督窗口 · 开放（一阶段，可提监督质疑）', '复制提监督质疑'])
// 即将关闭：warning 已登记，无监督记录
const warnedHtml = stateHtml(winRecords([]), [])
expectAll('即将关闭', warnedHtml, ['监督窗口 · 即将关闭（已预告拟计票，请及时提出）', '复制提监督质疑'])
// 二阶段·替身：warning + 替身监督
const standinHtml = stateHtml(winRecords([
  { id: 's1', docId: 'PC-20260826-CON-99', kind: 'supervision', stage: 'r2', round: 2, seat: 'chair', authorName: '用户替身', authorSessionId: 's3', preview: '【代·替身】建议关注供应商准入风险', wordCount: 18, at: now - 300_000 },
]), [])
expectAll('二阶段·替身', standinHtml, ['监督窗口 · 二阶段（替身监督）'])
// 用户已回应：warning + 用户监督
const userHtml = stateHtml(winRecords([
  { id: 's2', docId: 'PC-20260826-CON-99', kind: 'supervision', stage: 'r2', round: 2, seat: 'chair', authorName: '主持人', authorSessionId: 's', preview: '代录·用户：建议分阶段审计', wordCount: 12, at: now - 300_000 },
]), [])
expectAll('用户已回应', userHtml, ['监督窗口 · 用户已回应'])
// 已关窗：warning + 替身监督 + tally
const closedHtml = stateHtml(winRecords([
  { id: 's3', docId: 'PC-20260826-CON-99', kind: 'supervision', stage: 'r2', round: 2, seat: 'chair', authorName: '用户替身', authorSessionId: 's3', preview: '【代·替身】建议关注供应商准入风险', wordCount: 18, at: now - 300_000 },
]), winTally)
expectAll('已关窗', closedHtml, ['监督窗口 · 已关窗（计票启动）'])

// ---- 空看板 ----
console.log('▶ 空态快速开始渲染')
const emptyHtml = renderToString(createElement(Component, {
  useBoard: selector => selector({ meetings: [], records: [], tallies: [] }),
}))
expectAll('空态', emptyHtml, ['本会话暂无案卷', '协商型 · 重大议题', '纪要型 · 例会留痕', '决议型 · 快速拍板', '复制'])

if (failed > 0) {
  console.error(`❌ 客户端渲染冒烟：${String(failed)} 项断言失败`)
  process.exit(1)
}
console.log('✅ 客户端渲染冒烟全部通过')
