/**
 * Recently opened tags with open counts and timestamps.
 * Persisted in localStorage; supports browse-navigation hints for TagView next/prev.
 *
 * When opening a tag from Recent, {@link freezeListForReturn} keeps the on-screen
 * order stable so Back + scroll restoration land on the same row (opening would
 * otherwise bump that tag to the top of “Most recent”).
 */
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

const STORAGE_KEY = 'singtags.recent.v2'
const LEGACY_KEY = 'singtags.recent.v1'
const SORT_KEY = 'singtags.recentSort.v1'
const MAX_ENTRIES = 250

/** Sort mode for the Recent list UI. */
export type RecentSort = 'recent' | 'opens'

/** One recently opened tag with usage stats. */
export type RecentRecord = {
  id: number
  opens: number
  lastOpenedAt: string
}

function readPersistedSort(): RecentSort {
  try {
    const s = localStorage.getItem(SORT_KEY)
    if (s === 'opens' || s === 'recent') return s
  } catch {
    /* private mode */
  }
  return 'recent'
}

/** Pinia store for tag open history (localStorage-backed). */
export const useRecentStore = defineStore('recent', () => {
  const entries = ref<RecentRecord[]>([])
  /** UI sort; persisted so Back from a tag restores the same ordering preference. */
  const listSort = ref<RecentSort>(readPersistedSort())
  /**
   * Id order frozen when leaving Recent for a tag. Cleared when entering Recent
   * from a non-tag route or when the user changes sort.
   */
  const frozenOrder = ref<number[] | null>(null)
  /** Set when opening a tag from Browse/Recent; consumed once on TagView so next/prev stays silent. */
  let pendingBrowseOpen: number | null = null

  /** Write current entries to localStorage. Side effect: may throw in private mode (caller catches). */
  function persist(): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.value))
  }

  function persistSort(): void {
    try {
      localStorage.setItem(SORT_KEY, listSort.value)
    } catch {
      /* private mode */
    }
  }

  /** One-time migration from v1 id-only list to v2 records. Side effect: localStorage read/write. */
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

  /** Load entries from localStorage; runs legacy migration when v2 is empty. */
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

  /**
   * Copy of entries sorted for display.
   *
   * @param sort - `'recent'` by last opened, `'opens'` by count then recency.
   * @returns New array (does not mutate store).
   */
  function sortedRecords(sort: RecentSort): RecentRecord[] {
    const copy = [...entries.value]
    if (sort === 'opens') {
      return copy.sort(
        (a, b) =>
          b.opens - a.opens || b.lastOpenedAt.localeCompare(a.lastOpenedAt) || b.id - a.id,
      )
    }
    return copy.sort(
      (a, b) => b.lastOpenedAt.localeCompare(a.lastOpenedAt) || b.id - a.id,
    )
  }

  /**
   * Rows for the Recent page: frozen visit order when returning from a tag, else
   * {@link listSort}.
   */
  function displayRecords(): RecentRecord[] {
    if (!frozenOrder.value) return sortedRecords(listSort.value)
    const byId = new Map(entries.value.map((e) => [e.id, e]))
    const out: RecentRecord[] = []
    for (const id of frozenOrder.value) {
      const e = byId.get(id)
      if (e) out.push(e)
    }
    return out
  }

  /** Snapshot current list order before opening a tag (keeps Back/scroll stable). */
  function freezeListForReturn(): void {
    frozenOrder.value = sortedRecords(listSort.value).map((r) => r.id)
  }

  /** Drop the visit freeze (e.g. opened Recent from the tab bar). */
  function clearListFreeze(): void {
    frozenOrder.value = null
  }

  /** Update list sort and clear any visit freeze. Side effect: localStorage. */
  function setListSort(sort: RecentSort): void {
    if (listSort.value === sort) return
    listSort.value = sort
    frozenOrder.value = null
    persistSort()
  }

  /**
   * Mark that the user navigated to a tag from Browse/Recent (not in-tag next/prev).
   * Consumed by TagView via `consumeBrowseNavigation`.
   */
  function markBrowseNavigation(id: number): void {
    pendingBrowseOpen = id
  }

  /**
   * Returns true once if this open came from browse navigation for `id`.
   * Clears the pending flag when matched.
   */
  function consumeBrowseNavigation(id: number): boolean {
    if (pendingBrowseOpen === id) {
      pendingBrowseOpen = null
      return true
    }
    return false
  }

  /**
   * Record a tag open (increments count or appends). Trims to `MAX_ENTRIES`.
   * Side effect: localStorage persist.
   */
  function recordOpen(id: number): void {
    let nowMs = Date.now()
    // Keep lastOpenedAt strictly increasing so rapid opens sort stably.
    for (const e of entries.value) {
      const t = Date.parse(e.lastOpenedAt)
      if (Number.isFinite(t) && t >= nowMs) nowMs = t + 1
    }
    const now = new Date(nowMs).toISOString()
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

  /** Clear all recent history. Side effect: removes localStorage key. */
  function clear(): void {
    entries.value = []
    pendingBrowseOpen = null
    frozenOrder.value = null
    localStorage.removeItem(STORAGE_KEY)
  }

  /**
   * Remove one tag from recent history.
   * Side effect: localStorage update or key removal when empty.
   */
  function remove(id: number): void {
    const next = entries.value.filter((r) => r.id !== id)
    if (next.length === entries.value.length) return
    entries.value = next
    if (pendingBrowseOpen === id) pendingBrowseOpen = null
    if (frozenOrder.value) {
      frozenOrder.value = frozenOrder.value.filter((x) => x !== id)
    }
    if (next.length) persist()
    else localStorage.removeItem(STORAGE_KEY)
  }

  return {
    entries,
    count,
    list,
    listSort,
    frozenOrder,
    sortedRecords,
    displayRecords,
    freezeListForReturn,
    clearListFreeze,
    setListSort,
    markBrowseNavigation,
    consumeBrowseNavigation,
    recordOpen,
    push,
    clear,
    remove,
    load,
  }
})
