import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

const STORAGE_KEY = 'singtags.recent.v2'
const LEGACY_KEY = 'singtags.recent.v1'
const MAX_ENTRIES = 250

export type RecentSort = 'recent' | 'opens'

export type RecentRecord = {
  id: number
  opens: number
  lastOpenedAt: string
}

export const useRecentStore = defineStore('recent', () => {
  const entries = ref<RecentRecord[]>([])
  /** Set when the user opens a tag from Browse; consumed once on TagView load. */
  let pendingBrowseOpen: number | null = null

  function persist(): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.value))
  }

  function migrateLegacy(): void {
    try {
      const raw = localStorage.getItem(LEGACY_KEY)
      if (!raw) return
      const ids = (JSON.parse(raw) as number[]).filter((n) => Number.isFinite(n))
      if (!ids.length) return
      const now = Date.now()
      entries.value = ids.map((id, i) => ({
        id,
        opens: 1,
        lastOpenedAt: new Date(now - i * 60_000).toISOString(),
      }))
      persist()
      localStorage.removeItem(LEGACY_KEY)
    } catch {
      /* ignore */
    }
  }

  function load(): void {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw) as RecentRecord[]
        entries.value = parsed.filter(
          (r) => Number.isFinite(r.id) && Number.isFinite(r.opens) && typeof r.lastOpenedAt === 'string',
        )
        return
      }
    } catch {
      entries.value = []
    }
    migrateLegacy()
  }

  load()

  const count = computed(() => entries.value.length)

  /** @deprecated use sortedRecords */
  const list = computed(() =>
    [...entries.value]
      .sort((a, b) => b.lastOpenedAt.localeCompare(a.lastOpenedAt))
      .map((r) => r.id),
  )

  function sortedRecords(sort: RecentSort): RecentRecord[] {
    const copy = [...entries.value]
    if (sort === 'opens') {
      return copy.sort(
        (a, b) => b.opens - a.opens || b.lastOpenedAt.localeCompare(a.lastOpenedAt),
      )
    }
    return copy.sort((a, b) => b.lastOpenedAt.localeCompare(a.lastOpenedAt))
  }

  function markBrowseNavigation(id: number): void {
    pendingBrowseOpen = id
  }

  function consumeBrowseNavigation(id: number): boolean {
    if (pendingBrowseOpen === id) {
      pendingBrowseOpen = null
      return true
    }
    return false
  }

  function recordOpen(id: number): void {
    const now = new Date().toISOString()
    const existing = entries.value.find((r) => r.id === id)
    if (existing) {
      existing.opens += 1
      existing.lastOpenedAt = now
    } else {
      entries.value.push({ id, opens: 1, lastOpenedAt: now })
    }
    if (entries.value.length > MAX_ENTRIES) {
      entries.value = sortedRecords('recent').slice(0, MAX_ENTRIES)
    }
    persist()
  }

  /** @deprecated use recordOpen after consumeBrowseNavigation */
  function push(id: number): void {
    recordOpen(id)
  }

  function clear(): void {
    entries.value = []
    pendingBrowseOpen = null
    localStorage.removeItem(STORAGE_KEY)
  }

  function remove(id: number): void {
    const next = entries.value.filter((r) => r.id !== id)
    if (next.length === entries.value.length) return
    entries.value = next
    if (pendingBrowseOpen === id) pendingBrowseOpen = null
    if (next.length) persist()
    else localStorage.removeItem(STORAGE_KEY)
  }

  return {
    entries,
    count,
    list,
    sortedRecords,
    markBrowseNavigation,
    consumeBrowseNavigation,
    recordOpen,
    push,
    clear,
    remove,
    load,
  }
})
