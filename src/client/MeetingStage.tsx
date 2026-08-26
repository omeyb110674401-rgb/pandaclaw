/**
 * 会议舞台：一场或多场会议的程序进度、席位名册、计票实况与记录流.
 *
 * 纯函数组件：全部输入来自 `useBoard` 选择器钩子（slots 框架由 inject 面
 * 的 hooks.board 生成），无本地状态、无副作用；样式用内联对象，免构建期
 * CSS 管线.
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
}

/** 席位徽记. */
const SEAT_BADGES: Record<string, string> = { cppcc: '协', npc: '审', chair: '主' }

const TYPE_LABELS: Record<string, string> = {
  MIN: '纪要', RES: '决议', CON: '协商', PLA: '规划', STR: '战略', LEG: '立法',
}

const STATUS_LABELS: Record<string, string> = { open: '进行中', adjourned: '已归档', terminated: '已终止' }

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

/** 一场会议卡片. */
function MeetingCard(props: {
  readonly meeting: PcMeetingView
  readonly tallies: readonly PcTallyView[]
  readonly records: readonly PcRecordView[]
}): ReturnType<typeof h> {
  const { meeting, tallies, records } = props
  const mineTallies = tallies.filter(tally => tally.docId === meeting.docId)
  const latest = mineTallies[mineTallies.length - 1]
  const mineRecords = records.filter(record => record.docId === meeting.docId).slice(-8).reverse()
  return h('div', {
    key: meeting.docId,
    style: { background: palette.card, border: `1px solid ${palette.border}`, borderRadius: 10, padding: '12px 14px', marginBottom: 12 },
  },
    h('div', { style: { display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' } },
      h('strong', { style: { fontSize: 14 } }, `${meeting.docId}`),
      chip(TYPE_LABELS[meeting.type] ?? meeting.type, palette.accent, true),
      chip(`${meeting.tier}·${meeting.validation}`, palette.dim, false),
      chip(STATUS_LABELS[meeting.status] ?? meeting.status, meeting.status === 'open' ? palette.ok : palette.dim, meeting.status === 'open'),
    ),
    h('div', { style: { color: palette.dim, fontSize: 12, margin: '4px 0 8px' } }, `议题：${meeting.topic}`),
    // 阶段进度条
    h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 2, marginBottom: 8 } },
      ...meeting.stages.map(stage => chip(
        `${stage.deliberative ? '⭐' : ''}${stage.label}${stage.round === undefined ? '' : ` r${stage.round}`}`,
        stage.state === 'done' ? palette.ok : stage.state === 'active' ? palette.accent : palette.border,
        stage.state !== 'pending',
      )),
    ),
    // 名册
    h('div', { style: { fontSize: 12, marginBottom: 6 } },
      h('span', { style: { color: palette.dim } }, '名册：'),
      ...meeting.members.map((member, index) => h('span', { key: member.name, style: { marginRight: 8 } },
        `${index > 0 ? '' : ''}[${SEAT_BADGES[member.seat]}]${member.name}`)),
    ),
    // 最新计票
    latest !== undefined
      ? h('div', {
        style: {
          display: 'flex', gap: 10, alignItems: 'center', fontSize: 12,
          padding: '6px 10px', borderRadius: 8, marginBottom: 8,
          background: latest.passed ? 'rgba(39,174,96,0.12)' : 'rgba(192,57,43,0.10)',
        },
      },
        h('strong', { style: { color: latest.passed ? palette.ok : palette.accent } }, latest.passed ? '通过' : '未通过'),
        h('span', {}, `赞成 ${latest.aye} · 反对 ${latest.nay} · 弃权 ${latest.abstain}`),
        h('span', { style: { color: palette.dim } }, `应答 ${latest.responded}/${latest.rosterSize}${latest.mode === 'consultive' ? ' · 征询模式' : ''}`),
      )
      : null,
    // 记录流
    h('details', {},
      h('summary', { style: { cursor: 'pointer', fontSize: 12, color: palette.dim } }, `记录流（最近 ${mineRecords.length} 条）`),
      ...mineRecords.map(record => h('div', {
        key: record.id, style: { fontSize: 12, padding: '4px 0', borderBottom: `1px dashed ${palette.border}` },
      },
        h('span', { style: { color: palette.accent, marginRight: 6 } }, `[${KIND_LABELS[record.kind] ?? record.kind}]`),
        h('span', { style: { marginRight: 6 } }, `[${SEAT_BADGES[record.seat]}]${record.authorName}`),
        record.round === undefined ? null : h('span', { style: { color: palette.dim, marginRight: 6 } }, `r${record.round}`),
        record.stance !== undefined
          ? h('span', {
            style: {
              marginRight: 6, padding: '0 6px', borderRadius: 8, fontSize: 11,
              border: `1px solid ${record.stance === '赞成' ? palette.ok : record.stance === '反对' ? palette.accent : palette.dim}`,
              color: record.stance === '赞成' ? palette.ok : record.stance === '反对' ? palette.accent : palette.dim,
            },
          }, record.stance)
          : null,
        record.verdict === 'rejected' ? h('span', { style: { color: palette.warn, marginRight: 6 } }, '已退回') : null,
        h('span', { style: { color: palette.dim } }, record.preview),
      )),
    ),
  )
}

/**
 * 视图页签根组件.
 * @param props - 注入的看板选择器.
 */
export function MeetingStage(props: MeetingStageProps): ReturnType<typeof h> {
  const board = props.useBoard(state => state)
  const open = board.meetings.filter(meeting => meeting.status === 'open')
  const closed = board.meetings.filter(meeting => meeting.status !== 'open')
  return h('div', {
    style: { height: '100%', overflowY: 'auto', padding: '14px 16px', boxSizing: 'border-box' },
  },
    board.meetings.length === 0
      ? h('div', { style: { maxWidth: 460, margin: '36px auto 0' } },
        h('div', { style: { fontSize: 13, color: palette.dim, marginBottom: 12, lineHeight: 1.6 } },
          '本会话暂无会议。选一张卡片复制开场白发给助手即可开会；也可以直接说「开个会：〈议题〉」，由助手推荐合适的会议类型。'),
        ...QUICKSTART_TEMPLATES.map(template => h(TemplateCard, {
          key: template.label,
          label: template.label,
          hint: template.hint,
          text: template.text,
        })),
      )
      : [
        ...open.map(meeting => createElementCard(board, meeting)),
        ...closed.map(meeting => createElementCard(board, meeting)),
      ],
  )

  function createElementCard(localBoard: PcMeetingBoard, meeting: PcMeetingView): ReturnType<typeof h> {
    return h(MeetingCard, {
      key: meeting.docId,
      meeting,
      tallies: localBoard.tallies,
      records: localBoard.records,
    })
  }
}
