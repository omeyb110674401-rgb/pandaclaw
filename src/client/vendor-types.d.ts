/**
 * 客户端宿主面的最小本地声明.
 *
 * 浏览器半包在真实页面里运行于 web 外壳的冻结模块表，运行时由外壳提供
 * 这些模块；本文件只为编译期提供形状（这些 UI 包不单独发布到 npm）.
 */

declare module '@deepseek-ai/dsh-client-runtime/client' {
  /** 快照 store：zustand 面 + 整值 set/update. */
  export interface SnapshotStore<T> {
    readonly getSnapshot: () => T
    readonly subscribe: (fn: () => void) => () => void
    readonly set: (next: T) => void
    readonly update: (mutator: (draft: T) => void) => void
  }

  /** 创建快照 store. */
  export function createSnapshotStore<T>(init: T, opts?: {
    readonly flush?: 'raf' | 'sync'
    readonly persist?: { readonly name: string }
  }): SnapshotStore<T>

  /** 客户端根上下文（effect/locale/slots/sessions 的载体）. */
  export interface ClientContext {
    /** 登记一个可撤销副作用；卸载时逆序回收. */
    effect<T extends (() => void) | Promise<void>>(factory: () => T, label?: string): () => void
    /** 页签/插槽注册表. */
    readonly slots: {
      /** 条件注册器：setup 工厂返回撤回函数. */
      inject(slot: string, setup: () => (() => void)): void
      /** 注册一个渲染贡献，返回撤销 disposer. */
      register(def: Record<string, unknown>, component: unknown): () => void
    }
    /** 会话域（浏览器面，形状由宿主保证，这里按最小切片断言使用）. */
    readonly sessions: unknown
    /** 多语文案域. */
    readonly locale: {
      register(ns: string, dictionaries: Record<string, unknown>): () => void
      bind(ns: string): (key: string) => string
    }
  }
}

declare module '@deepseek-ai/dsh-client-ui-slots' {
  /** 视图页签拿到的选择器钩子（框架按 inject 面 hooks.X 生成 useX）. */
  export type SnapshotSelectorHook<T> = <S>(selector: (state: T) => S) => S
}
