/** `@deepseek-ai/dsh-client-runtime/client` 的最小 stub：只含 createSnapshotStore. */

/**
 * 与宿主同形的快照存储（值替换＋订阅通知）.
 * @param {unknown} initial - 初始快照.
 */
export function createSnapshotStore(initial) {
  let snapshot = initial
  const listeners = new Set()
  return {
    getSnapshot: () => snapshot,
    set(next) {
      snapshot = next
      for (const listener of [...listeners]) listener()
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}
