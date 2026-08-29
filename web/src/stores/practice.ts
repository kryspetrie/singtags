import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'

const ORDER_KEY = 'singtags.practiceOrder.v1'
const AUTO_KEY = 'singtags.practiceAuto.v1'

export const usePracticeStore = defineStore('practice', () => {
  const order = ref<number[]>([])
  const autoAdvance = ref(true)

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

  /** Build / refresh practice order from starred ids (keeps existing relative order when possible). */
  function syncFromStarred(starredIds: number[]): void {
    const keep = order.value.filter((id) => starredIds.includes(id))
    const missing = starredIds.filter((id) => !keep.includes(id))
    order.value = [...keep, ...missing]
  }

  function resetFromStarred(starredIds: number[]): void {
    order.value = [...starredIds]
  }

  function move(tagId: number, dir: -1 | 1): void {
    const i = order.value.indexOf(tagId)
    if (i < 0) return
    const j = i + dir
    if (j < 0 || j >= order.value.length) return
    reorder(tagId, j)
  }

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

  function remove(tagId: number): void {
    order.value = order.value.filter((id) => id !== tagId)
  }

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

  function firstId(): number | null {
    return order.value[0] ?? null
  }

  function exportSnapshot(): { order: number[]; autoAdvance: boolean } {
    return { order: [...order.value], autoAdvance: autoAdvance.value }
  }

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
