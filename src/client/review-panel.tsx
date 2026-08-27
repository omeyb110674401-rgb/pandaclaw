/**
 * 复审面板与共享 UI 原语（模块化 A 阶段：Q10-A 从 MeetingStage.tsx 纯搬家）.
 *
 * 复审面板（ADR-0010）在已归档卡片上展示复审状态与动作开场白；阶段由
 * 服务层 review 字段推导（状态机），UI 只读呈现＋给用户最后一拍的可复制
 * 动作文本。palette/chip/Copier 为 Meetflow 舞台的共享原语（监督窗口与
 * 复审面板共用），随本文件下沉，MeetingStage 反向引用（单向依赖无循环）.
 */

import { createElement as h, useState } from 'react'
import type { PcMeetingView } from '../contract.ts'

/** 复审状态中文标签（ADR-0010 六阶段 ＋ 未进入/已闭环）. */
export const REVIEW_STATE_LABELS: Record<string, string> = {
  filed: '待出审', accepted: '已受理', reviewing: '审查中', hearing: '沟通纠正中',
  decidable: '待用户三选', feedback: '回告中', closed: '已闭环',
}

/** 共享色板（会议舞台/复审面板）. */
export const palette = {
  bg: 'transparent',
  card: 'var(--dsh-card, rgba(127,127,127,0.08))',
  border: 'var(--dsh-border, rgba(127,127,127,0.25))',
  text: 'inherit',
  dim: 'rgba(127,127,127,0.9)',
  accent: '#c0392b',
  ok: '#27ae60',
  warn: '#e67e22',
} as const

/** 带边框小徽记（会议舞台/复审面板共用）. */
export function chip(text: string, color: string, filled: boolean): ReturnType<typeof h> {
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

/** 一行可复制的定向开场白（监督质疑/复审意见通用）. */
export function Copier(props: { readonly text: string; readonly label: string }): ReturnType<typeof h> {
  const [copied, setCopied] = useState(false)
  const copy = () => {
    // 剪贴板不可用时静默失败，文案可由记录内容手动照抄.
    navigator.clipboard?.writeText(props.text)?.then(
      () => {
        setCopied(true)
        window.setTimeout(() => setCopied(false), 1600)
      },
      () => {},
    )
  }
  return h('button', {
    onClick: copy,
    style: {
      cursor: 'pointer', fontSize: 11, lineHeight: '18px', padding: '1px 10px',
      borderRadius: 8, marginLeft: 8, border: `1px solid ${palette.accent}`,
      color: copied ? '#fff' : palette.accent, background: copied ? palette.accent : 'transparent',
    },
  }, copied ? '已复制' : props.label)
}

/**
 * 复审面板（ADR-0010）：已归档案卷上展示复审状态与动作开场白.
 * 阶段由服务层 review 字段推导（状态机），UI 只读呈现＋给用户最后一拍的可复制动作文本.
 */
export function ReviewPanel(props: { readonly meeting: PcMeetingView }): ReturnType<typeof h> | null {
  const { meeting } = props
  if (meeting.status !== 'adjourned') return null
  const review = meeting.review
  const state = review?.state
  // 待出审/未进入：给「提复审意见」开场白（用户主动通道，弱/次级档从这里开启）.
  const requestText = `对已归档案卷 ${meeting.docId}「${meeting.topic}」提复审意见：〈意见〉。请主持人代录登记复审意见（原汁原味不改写，pc_review action=request）。`
  if (state === undefined || state === 'idle' || state === 'filed') {
    const inPool = state === 'filed'
    return h('div', { style: { fontSize: 12, margin: '2px 0 8px' } },
      chip(inPool ? '复审 · 待出审（已入池）' : '复审通道 · 异步监督', inPool ? palette.warn : '#8e44ad', false),
      h(Copier, { text: requestText, label: '复制提复审意见' }),
    )
  }
  // 进行中：状态行＋按阶段给动作开场白.
  const stateLabel = REVIEW_STATE_LABELS[state] ?? state
  const inProgress = state !== 'closed'
  const stateColor = state === 'decidable' ? palette.warn : state === 'closed' ? palette.dim : palette.accent
  // 谱系（ADR-0011 Q14）：修订来源/修订去向/解释关联.
  const lineageParts: string[] = []
  if (review?.originDocId !== undefined) lineageParts.push(`修订自 ${review.originDocId}`)
  if (review?.revisedDocId !== undefined) lineageParts.push(`已由 ${review.revisedDocId} 号修订`)
  if (review?.interpretRecordId !== undefined) lineageParts.push('含解释性决议（复审同卷再开一轮）')
  const lineage = lineageParts.length > 0 ? `；${lineageParts.join('；')}` : ''
  const actionText = (() => {
    switch (state) {
      case 'reviewing':
        return `案卷 ${meeting.docId} 复审审查中（审查替身已派发）；待审查意见落板后呈报用户三选；替身卡死可 restart 重开。`
      case 'hearing':
        return `案卷 ${meeting.docId} 复审沟通纠正中（异议方陈述窗口）；收窗后呈报用户三选。`
      case 'decidable':
        return `案卷 ${meeting.docId} 复审已出审查意见，请裁定出口三选：修订重议／解释性决议／驳回并说明（pc_review action=adjudicate）；审查意见为维持的多件待裁档案可直接批量驳回（action=batch-dismiss）。`
      case 'feedback':
        return `案卷 ${meeting.docId} 复审出口已裁，逐条回告中（pc_review action=reply，齐备即闭环）。`
      default:
        return `案卷 ${meeting.docId} 复审${stateLabel}。`
    }
  })()
  return h('div', { style: { fontSize: 12, margin: '2px 0 8px' } },
    chip(`复审 · ${stateLabel}（意见 ${String(review?.count ?? 0)} 条）`, inProgress ? stateColor : palette.dim, inProgress),
    h('span', { style: { color: palette.dim } }, `${actionText}${lineage}`),
  )
}