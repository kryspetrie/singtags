/**
 * Practice-mode tag order and auto-advance preference.
 * Order is persisted in localStorage and synced from the user's Favorites list.
 */
import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'

const ORDER_KEY = 'singtags.practiceOrder.v1'
const AUTO_KEY = 'singtags.practiceAuto.v1'

/** Pinia store for practice playlist order and navigation settings. */
export const usePracticeStore = defineStore('practice', () => {
  const order = ref<number[]>([])
  const autoAdvance = ref(true)

  /** Reload order and auto-advance from localStorage. */
  function load(): void {
    try {
      const raw = localStorage.getItem(ORDER_KEY)
      if (raw) order.value = (JSON.parse(raw) as number[]).filter((n) => Number.isFinite(n))
    } catch {
      order.value = []
    }
    autoAdvance.value = localStorage.getItem(AUTO_KEY) !== '0'
  }

  load()

  watch(
    order,
    (v) => localStorage.setItem(ORDER_KEY, JSON.stringify(v)),
    { deep: true },
  )
  watch(autoAdvance, (v) => localStorage.setItem(AUTO_KEY, v ? '1' : '0'))

  const count = computed(() => order.value.length)

  /**
   * Merge practice order with current favorite tag ids.
   * Keeps existing relative order for ids still favorited; appends newly favorited ids at the end.
   *
   * @param favoriteIds - Tag ids from the Favorites store (may come from `listStarred` / IDB).
   */
  function syncFromStarred(favoriteIds: number[]): void {
    const keep = order.value.filter((id) => favoriteIds.includes(id))
    const missing = favoriteIds.filter((id) => !keep.includes(id))
    order.value = [...keep, ...missing]
  }

  /**
   * Replace practice order with the full favorites list (same order as `favoriteIds`).
   *
   * @param favoriteIds - Tag ids from the Favorites store.
   */
  function resetFromStarred(favoriteIds: number[]): void {
    order.value = [...favoriteIds]
  }

  /**
   * Move a tag one step earlier or later in practice order.
   *
   * @param tagId - Tag to move.
   * @param dir - `-1` up, `+1` down. Side effect: persists order to localStorage.
   */
  function move(tagId: number, dir: -1 | 1): void {
    const i = order.value.indexOf(tagId)
    if (i < 0) return
    const j = i + dir
    if (j < 0 || j >= order.value.length) return
    reorder(tagId, j)
  }

  /**
   * Move a tag to a new index in practice order.
   *
   * @param tagId - Tag to move.
   * @param toIndex - Target index (clamped). Side effect: localStorage.
   */
  function reorder(tagId: number, toIndex: number): void {
    const from = order.value.indexOf(tagId)
    if (from < 0) return
    const clamped = Math.max(0, Math.min(order.value.length - 1, toIndex))
    if (from === clamped) return
    const next = [...order.value]
    const [item] = next.splice(from, 1)
    next.splice(clamped, 0, item!)
    order.value = next
  }

  /** Remove a tag from practice order. Side effect: localStorage. */
  function remove(tagId: number): void {
    order.value = order.value.filter((id) => id !== tagId)
  }

  /**
   * Previous/next tag in practice order for navigation UI.
   *
   * @param id - Current tag id.
   * @returns Neighbors and index; `index === -1` when `id` is not in order.
   */
  function neighbors(id: number): {
    prev: number | null
    next: number | null
    index: number
    total: number
  } {
    const ids = order.value
    const index = ids.indexOf(id)
    if (index < 0) return { prev: null, next: null, index: -1, total: ids.length }
    return {
      prev: index > 0 ? ids[index - 1]! : null,
      next: index < ids.length - 1 ? ids[index + 1]! : null,
      index,
      total: ids.length,
    }
  }

  /** First tag in practice order, or `null` when empty. */
  function firstId(): number | null {
    return order.value[0] ?? null
  }

  /** Snapshot for backup export (does not mutate store). */
  function exportSnapshot(): { order: number[]; autoAdvance: boolean } {
    return { order: [...order.value], autoAdvance: autoAdvance.value }
  }

  /**
   * Restore practice state from a backup snapshot.
   * Side effect: localStorage via watchers when values change.
   */
  function importSnapshot(raw: { order?: unknown; autoAdvance?: unknown } | null | undefined): void {
    if (!raw || typeof raw !== 'object') return
    if (Array.isArray(raw.order)) {
      order.value = raw.order.filter((n): n is number => typeof n === 'number' && Number.isFinite(n))
    }
    if (typeof raw.autoAdvance === 'boolean') autoAdvance.value = raw.autoAdvance
  }


  return {
    order,
    autoAdvance,
    count,
    syncFromStarred,
    resetFromStarred,
    move,
    reorder,
    remove,
    neighbors,
    firstId,
    load,
    exportSnapshot,
    importSnapshot,
  }
})
