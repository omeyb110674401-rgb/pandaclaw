/**
 * PandaClaw 浏览器端：跟随当前会话的 `pandaclaw` 投影，贡献「会议舞台」视图页签.
 *
 * 无客户端折叠：主机算好看板值，框架推送（历史基线 + 推送帧），本模块只
 * 负责盯住当前会话并在有会议时挂出页签、无会议时撤下.
 */

import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import { EMPTY_BOARD, type PcMeetingBoard } from '../contract.ts'
import { en, NS, zh, type PcLocaleKey } from './locales.ts'
import { MeetingStage } from './MeetingStage.tsx'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** PandaClaw 会议舞台文案. */
    pandaclaw: PcLocaleKey
  }
}

/** 必需服务：页签注册表、会话域与区域文案. */
export const inject = ['slots', 'sessions', 'locale']

/** 视图环位置：紧跟 agent-team 页签之后. */
const VIEW_ORDER = 21

/** 会话域消费的最小切片（避免绑定完整 ISessions 形状）. */
interface SessionsFace {
  readonly list: { readonly getSnapshot: () => { readonly current?: string }; readonly subscribe: (fn: () => void) => () => void }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- 域面形状由宿主保证，这里只做存在性转发.
  readonly binding: (id: string) => any
}

/**
 * 注册词典与「会议舞台」页签；页签随看板有无自动挂撤.
 * @param ctx - 客户端根上下文.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'pandaclaw: dictionaries')
  const t = ctx.locale.bind(NS)

  const sessions = ctx.sessions as unknown as SessionsFace
  const store = createSnapshotStore<PcMeetingBoard>(EMPTY_BOARD)

  let followed: string | undefined
  let disposeFace: (() => void) | null = null
  /** binding 尚未发布的会话：一次微任务重试，避免页签错过首次附着. */
  let retryPending = false

  const clear = (): void => {
    disposeFace?.()
    disposeFace = null
    followed = undefined
    store.set(EMPTY_BOARD)
  }

  /** 当前会话切换或投影更新时重拉快照. */
  const follow = (): void => {
    const current = sessions.list.getSnapshot().current
    if (current !== followed && disposeFace !== null) {
      disposeFace()
      disposeFace = null
    }
    followed = current
    if (current === undefined) {
      store.set(EMPTY_BOARD)
      return
    }
    const binding = sessions.binding(current)
    if (binding === undefined) {
      if (!retryPending) {
        retryPending = true
        queueMicrotask(() => {
          retryPending = false
          if (followed === current && disposeFace === null) follow()
        })
      }
      return
    }
    const face = binding.session.projections.faceOf('pandaclaw')
    const pull = (): void => {
      const board = face.getSnapshot() as PcMeetingBoard | undefined
      if (board === undefined) {
        store.set(EMPTY_BOARD)
        return
      }
      store.set(board)
    }
    pull()
    disposeFace?.()
    disposeFace = face.subscribe(pull)
  }

  follow()
  const disposeList = sessions.list.subscribe(follow)
  ctx.effect(() => () => {
    disposeList()
    disposeFace?.()
    disposeFace = null
    store.set(EMPTY_BOARD)
  }, 'pandaclaw: projection follower')

  /**
   * 页签随会议存在性挂撤：没有会议的会话不长出一个填不满的视图；
   * 撤页签时活动视图回落到聊天，对读者安全.
   */
  ctx.slots.inject('conversation.view', () => {
    let disposeTab: (() => void) | null = null
    const sync = (): void => {
      const wanted = store.getSnapshot().meetings.length > 0
      if (wanted === (disposeTab !== null)) return
      if (!wanted) {
        disposeTab?.()
        disposeTab = null
        return
      }
      disposeTab = ctx.slots.register({
        name: 'conversation.view',
        id: 'pandaclaw-stage',
        order: VIEW_ORDER,
        locale: NS,
        label: () => t('view.title'),
        inject: () => ({ hooks: { board: store } }),
      }, MeetingStage)
    }
    sync()
    const disposeStore = store.subscribe(sync)
    return () => {
      disposeStore()
      disposeTab?.()
      disposeTab = null
    }
  })
}
