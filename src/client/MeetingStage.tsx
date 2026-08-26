/**
 * 会议舞台：一场或多场会议的程序进度、席位名册、计票历史与记录流.
 *
 * 纯函数组件＋组件内筛选状态：全部数据来自 `useBoard` 选择器钩子（slots
 * 框架由 inject 面的 hooks.board 生成），无外部订阅、无副作用；样式用内联
 * 对象，免构建期 CSS 管线.
 */

import { createElement as h, useState } from 'react'
import type { SnapshotSelectorHook } from '@deepseek-ai/dsh-client-ui-slots'
import type { PcMeetingBoard, PcMeetingView, PcRecordView, PcTallyView } from '../contract.ts'

/** 舞台组件的注入面. */
export interface MeetingStageProps {
  /** 看板选择器钩子（框架按 inject 面的 hooks.board 绑定）. */
  readonly useBoard: SnapshotSelectorHook<PcMeetingBoard>
}

/** 记录种类中文标签. */
const KIND_LABELS: Record<string, string> = {
  agenda: '议题包',
  issue: '出题/汇总',
  opinion: '意见书',
  inquiry: '质询',
  reply: '答辩',
  digest: '质询汇总',
  draft: '草案',
  focus: '打回焦点',
  vote: '选票',
  resolution: '决议',
  ruling: '裁定',
  rebind: '席位重绑',
}

/** 席位徽记与配色（协=蓝 / 审=绿 / 主=红）. */
const SEAT_BADGES: Record<string, string> = { cppcc: '协', npc: '审', chair: '主' }
const SEAT_COLORS: Record<string, string> = { cppcc: '#2980b9', npc: '#27ae60', chair: '#c0392b' }

const TYPE_LABELS: Record<string, string> = {
  MIN: '纪要', RES: '决议', CON: '协商', PLA: '规划', STR: '战略', LEG: '立法',
}

/** 会议类型配色（协商红 / 决议蓝 / 纪要灰 / 规划青 / 战略紫 / 立法赭）. */
const TYPE_COLORS: Record<string, string> = {
  CON: '#c0392b', RES: '#2980b9', MIN: '#7f8c8d', PLA: '#16a085', STR: '#8e44ad', LEG: '#a04000',
}

const STATUS_LABELS: Record<string, string> = { open: '进行中', adjourned: '已归档', terminated: '已终止' }

const TIER_LABELS: Record<string, string> = { simple: '简单', medium: '中等', complex: '复杂', enterprise: '重大' }

const VALIDATION_LABELS: Record<string, string> = { full: '全量验收', key: '关键点验收', skip: '免验' }

const palette = {
  bg: 'transparent',
  card: 'var(--dsh-card, rgba(127,127,127,0.08))',
  border: 'var(--dsh-border, rgba(127,127,127,0.25))',
  text: 'inherit',
  dim: 'rgba(127,127,127,0.9)',
  accent: '#c0392b',
  ok: '#27ae60',
  warn: '#e67e22',
} as const

/** 相对时间：一分钟内刚刚，一小时内按分，一天内按时，一月内按天，更早落日期. */
function formatRelative(at: number): string {
  const diff = Date.now() - at
  if (diff < 60_000) return '刚刚'
  if (diff < 3_600_000) return `${String(Math.floor(diff / 60_000))} 分钟前`
  if (diff < 86_400_000) return `${String(Math.floor(diff / 3_600_000))} 小时前`
  if (diff < 30 * 86_400_000) return `${String(Math.floor(diff / 86_400_000))} 天前`
  const d = new Date(at)
  return `${String(d.getMonth() + 1)}月${String(d.getDate())}日`
}

function chip(text: string, color: string, filled: boolean): ReturnType<typeof h> {
  return h('span', {
    key: text,
    style: {
      display: 'inline-block', padding: '1px 8px', margin: '0 4px 4px 0',
      borderRadius: 10, fontSize: 11, lineHeight: '18px',
      border: `1px solid ${color}`, color: filled ? '#fff' : color,
      background: filled ? color : 'transparent',
    },
  }, text)
}

/** 可点击筛选片（选中态填充）. */
function filterChip(label: string, count: number, active: boolean, onPick: () => void): ReturnType<typeof h> {
  const color = active ? palette.accent : palette.dim
  return h('button', {
    key: label,
    onClick: onPick,
    style: {
      cursor: 'pointer', fontSize: 11, lineHeight: '18px', padding: '1px 10px',
      marginRight: 6, borderRadius: 10, border: `1px solid ${active ? palette.accent : palette.border}`,
      color: active ? '#fff' : color, background: active ? palette.accent : 'transparent',
    },
  }, count === undefined ? label : `${label} ${String(count)}`)
}

/** 空态快速开始模板：处境 → 开场白文案（与 SKILL §0 使用地图的推荐一一对应）. */
const QUICKSTART_TEMPLATES: ReadonlyArray<{
  readonly label: string
  readonly hint: string
  readonly text: string
}> = [
  {
    label: '协商型 · 重大议题',
    hint: '多轮质询答辩，关键阶段请你裁定',
    text: '开个协商型会议：议题＝（一句话议题）；成功标准＝（可验收的结果）；验收档 key。',
  },
  {
    label: '纪要型 · 例会留痕',
    hint: '几乎不打扰，自动确证归档',
    text: '开个纪要型例会，记录以下议定事项：\n1. …\n2. …',
  },
  {
    label: '决议型 · 快速拍板',
    hint: '方案明确，直接表决',
    text: '开个决议型会议：方案＝（一句话方案）；验收档 skip。',
  },
]

/** 单张模板卡：一键复制开场白到剪贴板. */
function TemplateCard(props: {
  readonly label: string
  readonly hint: string
  readonly text: string
}): ReturnType<typeof h> {
  const [copied, setCopied] = useState(false)
  const copy = () => {
    // 剪贴板不可用（非安全上下文等）时静默失败，文案仍在卡上可手动照抄.
    navigator.clipboard?.writeText(props.text)?.then(
      () => {
        setCopied(true)
        window.setTimeout(() => setCopied(false), 1600)
      },
      () => {},
    )
  }
  return h('div', {
    style: {
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
      background: palette.card, border: `1px solid ${palette.border}`,
      borderRadius: 10, padding: '10px 12px', marginBottom: 8,
    },
  },
    h('div', {},
      h('div', { style: { fontSize: 13 } }, props.label),
      h('div', { style: { fontSize: 11, color: palette.dim, marginTop: 2 } }, props.hint),
    ),
    h('button', {
      onClick: copy,
      style: {
        flexShrink: 0, cursor: 'pointer', fontSize: 12,
        padding: '4px 12px', borderRadius: 8,
        border: `1px solid ${palette.accent}`, color: copied ? '#fff' : palette.accent,
        background: copied ? palette.accent : 'transparent',
      },
    }, copied ? '已复制' : '复制'),
  )
}

/** 计票历史：一场会议的全部轮次，最新一行着底色强调；征询模式强制标注. */
function TallyHistory(props: { readonly tallies: readonly PcTallyView[]; readonly docId: string }): ReturnType<typeof h> | null {
  const mine = props.tallies.filter(tally => tally.docId === props.docId)
  if (mine.length === 0) return null
  const latest = mine[mine.length - 1]
  return h('div', { style: { marginBottom: 8 } },
    ...mine.map((tally, index) => h('div', {
      key: `${tally.stage}-${String(tally.round)}-${String(index)}`,
      style: {
        display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', fontSize: 12,
        padding: '4px 8px', borderRadius: 6, marginBottom: 3,
        background: tally === latest
          ? (tally.passed ? 'rgba(39,174,96,0.12)' : 'rgba(192,57,43,0.10)')
          : 'transparent',
      },
    },
      h('span', { style: { color: palette.dim, minWidth: 24 } }, `r${String(tally.round)}`),
      h('span', {}, `赞成 ${String(tally.aye)} · 反对 ${String(tally.nay)} · 弃权 ${String(tally.abstain)}`),
      h('span', { style: { color: palette.dim } }, `应答 ${String(tally.responded)}/${String(tally.rosterSize)}`),
      tally.mode === 'consultive' ? chip('征询·不构成表决', palette.warn, false) : null,
      h('strong', { style: { marginLeft: 'auto', color: tally.passed ? palette.ok : palette.accent } },
        tally.passed ? '通过' : '未通过'),
    )),
  )
}

/** 单条记录行：种类·席位·轮次·立场·判定·预览·字数·时间. */
function RecordRow(props: { readonly record: PcRecordView }): ReturnType<typeof h> {
  const record = props.record
  // 终局文书（决议/草案）左侧着色强调，一眼定位产出物.
  const edge = record.kind === 'resolution' ? palette.accent : record.kind === 'draft' ? '#2980b9' : undefined
  return h('div', {
    key: record.id,
    style: {
      fontSize: 12, padding: '4px 0 4px 8px', borderBottom: `1px dashed ${palette.border}`,
      ...(edge !== undefined ? { borderLeft: `3px solid ${edge}` } : {}),
    },
  },
    h('span', { style: { color: palette.accent, marginRight: 6 } }, `[${KIND_LABELS[record.kind] ?? record.kind}]`),
    h('span', { style: { color: SEAT_COLORS[record.seat] ?? palette.dim, marginRight: 6 } },
      `[${SEAT_BADGES[record.seat] ?? '?'}]${record.authorName}`),
    record.round === undefined ? null : h('span', { style: { color: palette.dim, marginRight: 6 } }, `r${String(record.round)}`),
    record.stance !== undefined
      ? h('span', {
        style: {
          marginRight: 6, padding: '0 6px', borderRadius: 8, fontSize: 11,
          border: `1px solid ${record.stance === '赞成' || record.stance === '确认' ? palette.ok : record.stance === '反对' || record.stance === '更正' ? palette.accent : palette.dim}`,
          color: record.stance === '赞成' || record.stance === '确认' ? palette.ok : record.stance === '反对' || record.stance === '更正' ? palette.accent : palette.dim,
        },
      }, record.stance)
      : null,
    record.verdict === 'rejected'
      ? h('span', { style: { color: palette.warn, marginRight: 6 }, title: record.reason },
        `已退回${record.reason === undefined ? '' : `·${record.reason}`}`)
      : null,
    record.verdict === 'admitted' ? h('span', { style: { color: palette.ok, marginRight: 6 } }, '✓') : null,
    h('span', { style: { color: palette.dim } }, record.preview),
    h('span', { style: { color: palette.dim, marginLeft: 6, fontSize: 11, whiteSpace: 'nowrap' } },
      ` ${String(record.wordCount)}字 · ${formatRelative(record.at)}`),
  )
}

/** 记录流：按种类筛选（片源自实际出现过的种类），默认全部，最新在前. */
function RecordsSection(props: { readonly records: readonly PcRecordView[]; readonly docId: string }): ReturnType<typeof h> | null {
  const [filter, setFilter] = useState('all')
  const mine = props.records.filter(record => record.docId === props.docId)
  if (mine.length === 0) return null
  const kinds: readonly string[] = [...new Set(mine.map(record => record.kind))]
  const shown = (filter === 'all' ? mine : mine.filter(record => record.kind === filter)).slice(-60).reverse()
  return h('details', { style: { marginTop: 2 } },
    h('summary', { style: { cursor: 'pointer', fontSize: 12, color: palette.dim } },
      `记录流（${String(mine.length)} 条）`),
    kinds.length > 1
      ? h('div', { style: { margin: '6px 0 2px' } },
        filterChip('全部', mine.length, filter === 'all', () => setFilter('all')),
        ...kinds.map(kind => filterChip(
          KIND_LABELS[kind] ?? kind,
          mine.filter(record => record.kind === kind).length,
          filter === kind,
          () => setFilter(kind),
        )),
      )
      : null,
    ...shown.map(record => h(RecordRow, { key: record.id, record })),
  )
}

/** 当前阶段行：进行中显示活跃阶段（⭐＝审议阶段），已结显示结束时间. */
function StageNow(props: { readonly meeting: PcMeetingView }): ReturnType<typeof h> | null {
  const meeting = props.meeting
  if (meeting.status === 'open') {
    const active = meeting.stages.find(stage => stage.state === 'active')
    if (active === undefined) return null
    return h('div', { style: { fontSize: 12, margin: '2px 0 6px' } },
      h('span', { style: { color: palette.dim } }, '当前：'),
      h('strong', { style: { color: palette.accent } },
        `${active.label}${active.round === undefined ? '' : ` · r${String(active.round)}`}`),
      active.deliberative ? ' ⭐' : '',
    )
  }
  if (meeting.closedAt === undefined) return null
  return h('div', { style: { fontSize: 12, color: palette.dim, margin: '2px 0 6px' } },
    `${STATUS_LABELS[meeting.status] ?? meeting.status}于 ${formatRelative(meeting.closedAt)}`)
}

/** 一场会议卡片. */
function MeetingCard(props: {
  readonly meeting: PcMeetingView
  readonly tallies: readonly PcTallyView[]
  readonly records: readonly PcRecordView[]
}): ReturnType<typeof h> {
  const { meeting, tallies, records } = props
  const typeColor = TYPE_COLORS[meeting.type] ?? palette.dim
  return h('div', {
    key: meeting.docId,
    style: { background: palette.card, border: `1px solid ${palette.border}`, borderRadius: 10, padding: '12px 14px', marginBottom: 12 },
  },
    h('div', { style: { display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' } },
      h('strong', { style: { fontSize: 14 } }, meeting.docId),
      chip(TYPE_LABELS[meeting.type] ?? meeting.type, typeColor, true),
      chip(`${TIER_LABELS[meeting.tier] ?? meeting.tier} · ${VALIDATION_LABELS[meeting.validation] ?? meeting.validation}`, palette.dim, false),
      chip(STATUS_LABELS[meeting.status] ?? meeting.status, meeting.status === 'open' ? palette.ok : palette.dim, meeting.status === 'open'),
      h('span', { style: { color: palette.dim, fontSize: 11 } }, `开于 ${formatRelative(meeting.createdAt)}`),
    ),
    h('div', { style: { color: palette.dim, fontSize: 12, margin: '4px 0 2px' } }, `议题：${meeting.topic}`),
    h(StageNow, { meeting }),
    // 阶段进度条
    h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 2, marginBottom: 8 } },
      ...meeting.stages.map(stage => chip(
        `${stage.deliberative ? '⭐' : ''}${stage.label}${stage.round === undefined ? '' : ` r${String(stage.round)}`}`,
        stage.state === 'done' ? palette.ok : stage.state === 'active' ? palette.accent : palette.border,
        stage.state !== 'pending',
      )),
    ),
    // 名册
    h('div', { style: { fontSize: 12, marginBottom: 6 } },
      h('span', { style: { color: palette.dim } }, `名册（${String(meeting.members.length)}）：`),
      ...meeting.members.map(member => h('span', {
        key: member.name, style: { marginRight: 8, color: SEAT_COLORS[member.seat] ?? 'inherit' },
      }, `[${SEAT_BADGES[member.seat] ?? '?'}]${member.name}`)),
    ),
    // 计票历史（全部轮次）
    h(TallyHistory, { tallies, docId: meeting.docId }),
    // 记录流（种类筛选）
    h(RecordsSection, { records, docId: meeting.docId }),
  )
}

/** 舞台顶栏：统计行＋状态筛选片. */
function BoardHeader(props: {
  readonly openCount: number
  readonly closedCount: number
  readonly recordCount: number
  readonly status: string
  readonly adjournedCount: number
  readonly terminatedCount: number
  readonly onPick: (status: string) => void
}): ReturnType<typeof h> {
  const { openCount, closedCount, recordCount, status, adjournedCount, terminatedCount, onPick } = props
  return h('div', { style: { display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginBottom: 12 } },
    h('span', { style: { fontSize: 12, color: palette.dim, marginRight: 8 } },
      `${String(openCount)} 场进行中 · ${String(closedCount)} 场已结 · ${String(recordCount)} 条记录`),
    filterChip('全部', openCount + closedCount, status === 'all', () => onPick('all')),
    filterChip('进行中', openCount, status === 'open', () => onPick('open')),
    adjournedCount > 0 ? filterChip('已归档', adjournedCount, status === 'adjourned', () => onPick('adjourned')) : null,
    terminatedCount > 0 ? filterChip('已终止', terminatedCount, status === 'terminated', () => onPick('terminated')) : null,
  )
}

/**
 * 视图页签根组件：空看板露出快速开始模板；有会时顶栏统计＋筛选＋会议卡列.
 * @param props - 注入的看板选择器.
 */
export function MeetingStage(props: MeetingStageProps): ReturnType<typeof h> {
  const board = props.useBoard(state => state)
  const [status, setStatus] = useState('all')
  if (board.meetings.length === 0) {
    return h('div', {
      style: { height: '100%', overflowY: 'auto', padding: '14px 16px', boxSizing: 'border-box' },
    },
      h('div', { style: { maxWidth: 460, margin: '36px auto 0' } },
        h('div', { style: { fontSize: 13, color: palette.dim, marginBottom: 12, lineHeight: 1.6 } },
          '本会话暂无会议。选一张卡片复制开场白发给助手即可开会；也可以直接说「开个会：〈议题〉」，由助手推荐合适的会议类型。'),
        ...QUICKSTART_TEMPLATES.map(template => h(TemplateCard, {
          key: template.label,
          label: template.label,
          hint: template.hint,
          text: template.text,
        })),
      ),
    )
  }
  const open = board.meetings.filter(meeting => meeting.status === 'open')
  const adjourned = board.meetings.filter(meeting => meeting.status === 'adjourned')
  const terminated = board.meetings.filter(meeting => meeting.status === 'terminated')
  const visible = status === 'all' ? board.meetings : board.meetings.filter(meeting => meeting.status === status)
  // 进行中永远排前，组内按开会议时间倒序（新会在上）.
  const ordered = [...visible].sort((a, b) => {
    if (a.status !== b.status) return a.status === 'open' ? -1 : 1
    return b.createdAt - a.createdAt
  })
  return h('div', {
    style: { height: '100%', overflowY: 'auto', padding: '14px 16px', boxSizing: 'border-box' },
  },
    h(BoardHeader, {
      openCount: open.length,
      closedCount: adjourned.length + terminated.length,
      adjournedCount: adjourned.length,
      terminatedCount: terminated.length,
      recordCount: board.records.length,
      status,
      onPick: next => setStatus(next),
    }),
    ...ordered.map(meeting => h(MeetingCard, {
      key: meeting.docId,
      meeting,
      tallies: board.tallies,
      records: board.records,
    })),
  )
}
