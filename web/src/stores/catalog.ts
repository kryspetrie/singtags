import { defineStore } from 'pinia'
import { computed, ref, shallowRef, watch } from 'vue'
import { SearchEngine, uniqueFieldValues } from '../search/engine'
import type { ExpansionMap } from '../search/expansions'
import {
  buildBrowseRows,
  indexOfSection,
  parse100DaysNumberQuery,
  parseClassicNumberQuery,
  parseExactTagIdQuery,
  parseTagNumberQuery,
  isClassicCollection,
  is100DaysCollection,
  sortBrowseTags,
  type BrowseSortMode,
} from '../search/browse'
import {
  activeFilterCount,
  buildSearchQuery,
  EMPTY_FILTERS,
  filtersFromRouteQuery,
  filtersToRouteQuery,
  type CatalogFilters,
} from '../search/filters'
import type { CoreIndex, LyricsIndex, TagSummary } from '../types/tag'
import {
  loadCatalogSnapshotAsync,
  loadCatalogSnapshotSync,
  saveCatalogSnapshot,
} from '../lib/catalogSnapshot'
import { loadLyricsSnapshotAsync, saveLyricsSnapshot } from '../lib/lyricsSnapshot'
import { fetchGzipJsonCached, fetchJsonCached } from '../lib/gunzipJson'
import { indexesUrl, mediaUrl } from '../lib/mediaUrl'
import { useOfflineLibraryStore } from './offlineLibrary'
import { useOfflineModeStore } from './offlineMode'

export type SortMode = BrowseSortMode

/** Dwell before running free-text search (~30+ WPM desktop). Chips apply immediately. */
export const SEARCH_DEBOUNCE_MS = 320

/** How many more rows to reveal when the user scrolls near the end. */
export const RESULTS_PAGE_SIZE = 48

export const useCatalogStore = defineStore('catalog', () => {
  const tags = ref<TagSummary[]>([])
  const loaded = ref(false)
  const loading = ref(false)
  const error = ref<string | null>(null)
  const expansions = ref<ExpansionMap>({})
  const lyricsById = ref<Map<number, string>>(new Map())
  const lyricsLoaded = ref(false)
  const lyricsLoading = ref(false)
  const filters = ref<CatalogFilters>({ ...EMPTY_FILTERS })
  /** Live free-text input. */
  const queryText = ref('')
  /** Debounced free-text used for search + URL. */
  const debouncedQuery = ref('')
  const sortMode = ref<SortMode>('rating')
  const sortReverse = ref(false)
  const selectedIds = ref<Set<number>>(new Set())
  const searching = ref(false)
  const resultLimit = ref(RESULTS_PAGE_SIZE)

  let debounceTimer: ReturnType<typeof setTimeout> | null = null
  /** Reactive so result computeds re-run when the search index is ready. */
  const engine = shallowRef<SearchEngine | null>(null)

  watch(queryText, (q) => {
    searching.value = true
    if (debounceTimer) clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => {
      debouncedQuery.value = q
      searching.value = false
      resultLimit.value = RESULTS_PAGE_SIZE
    }, SEARCH_DEBOUNCE_MS)
  })

  watch(
    filters,
    () => {
      resultLimit.value = RESULTS_PAGE_SIZE
    },
    { deep: true },
  )

  watch(sortMode, () => {
    resultLimit.value = RESULTS_PAGE_SIZE
  })

  watch(sortReverse, () => {
    resultLimit.value = RESULTS_PAGE_SIZE
  })

  function applyCatalogData(list: TagSummary[], exp: ExpansionMap): void {
    expansions.value = exp
    engine.value = new SearchEngine({
      tags: list,
      expansions: exp,
    })
    tags.value = list
    loaded.value = true
    error.value = null
    saveCatalogSnapshot(list, exp)
    try {
      useOfflineLibraryStore().markCatalogCached()
    } catch {
      /* pinia may not be ready in unit tests */
    }
  }

  async function load(opts?: { refresh?: boolean }): Promise<void> {
    if (loading.value) return
    if (loaded.value && !opts?.refresh) {
      if (!lyricsLoaded.value && !lyricsLoading.value) void prefetchLyrics()
      return
    }
    loading.value = true
    error.value = null
    try {
      const [core, exp] = await Promise.all([
        fetchGzipJsonCached<CoreIndex>(indexesUrl('core.json.gz')),
        fetchJsonCached(indexesUrl('expansions.json'), { map: {} as ExpansionMap }),
      ])
      const list = core.tags ?? []
      applyCatalogData(list, exp.map ?? {})
      void prefetchLyrics()
    } catch (e) {
      try {
        const res = await fetch(mediaUrl('manifest.json'))
        const data = (await res.json()) as { tags: TagSummary[] }
        const list = data.tags ?? []
        applyCatalogData(list, {})
      } catch {
        const snap = await loadCatalogSnapshotAsync()
        if (snap?.tags.length) {
          applyCatalogData(snap.tags, snap.expansions)
          void hydrateLyricsFromIndexedDb()
          return
        }
        const offlineMode = useOfflineModeStore()
        if (offlineMode.manualOffline) {
          error.value =
            'Offline mode is on — browse needs the catalog in memory or cache. Go online once, then try again.'
        } else if (offlineMode.offline) {
          error.value =
            'Connect once to download the catalog, then SingTags works offline.'
        } else {
          error.value = e instanceof Error ? e.message : String(e)
        }
      }
    } finally {
      loading.value = false
    }
  }

  /** Sync restore from localStorage mirror (instant boot). */
  function hydrateFromSnapshot(): boolean {
    if (loaded.value) return true
    const snap = loadCatalogSnapshotSync()
    if (!snap?.tags.length) return false
    applyCatalogData(snap.tags, snap.expansions)
    return true
  }

  function applyLyricsDocs(docs: Array<{ id: number; lyrics: string }>): void {
    engine.value?.setLyrics(docs)
    const map = new Map<number, string>()
    for (const d of docs) {
      if (d.lyrics?.trim()) map.set(d.id, d.lyrics.trim())
    }
    lyricsById.value = map
    lyricsLoaded.value = map.size > 0
  }

  /** Restore catalog (if needed) and lyrics from IndexedDB — call early on startup. */
  async function hydrateFromIndexedDb(): Promise<boolean> {
    let ok = false
    if (!loaded.value) {
      const snap = await loadCatalogSnapshotAsync()
      if (snap?.tags.length) {
        applyCatalogData(snap.tags, snap.expansions)
        ok = true
      }
    }
    if (!lyricsLoaded.value) {
      const docs = await loadLyricsSnapshotAsync()
      if (docs?.length) {
        applyLyricsDocs(docs)
        ok = true
      }
    }
    return ok
  }

  async function hydrateLyricsFromIndexedDb(): Promise<boolean> {
    if (lyricsLoaded.value) return true
    const docs = await loadLyricsSnapshotAsync()
    if (!docs?.length) return false
    applyLyricsDocs(docs)
    return true
  }

  async function prefetchLyrics(): Promise<void> {
    if (lyricsLoaded.value || lyricsLoading.value) return
    lyricsLoading.value = true
    try {
      if (!lyricsLoaded.value) {
        const cached = await loadLyricsSnapshotAsync()
        if (cached?.length) {
          applyLyricsDocs(cached)
          return
        }
      }
      const idx = await fetchGzipJsonCached<LyricsIndex>(indexesUrl('lyrics.json.gz'))
      const docs = idx.docs ?? []
      applyLyricsDocs(docs)
      saveLyricsSnapshot(docs)
    } catch {
      /* optional */
    } finally {
      lyricsLoading.value = false
    }
  }

  function lyricsSnippet(id: number, maxLen = 110): string | null {
    const raw = lyricsById.value.get(id)
    if (!raw) return null
    const oneLine = raw.replace(/\s+/g, ' ').trim()
    if (oneLine.length <= maxLen) return oneLine
    return `${oneLine.slice(0, maxLen - 1).trimEnd()}…`
  }

  async function ensureLyrics(): Promise<void> {
    if (!lyricsLoaded.value) await prefetchLyrics()
  }

  const allResults = computed(() => {
    const eng = engine.value
    if (!eng) return [] as TagSummary[]
    // Re-run when the lyrics index arrives (setLyrics mutates engine in place).
    void lyricsLoaded.value
    void lyricsById.value.size
    // `n123` → site Tag # only (exact; never prefix / fall through to FTS)
    const tagNum = parseTagNumberQuery(debouncedQuery.value)
    if (tagNum != null) {
      const hit = tags.value.find((t) => t.id === tagNum)
      return hit ? [hit] : []
    }
    // `c99` / `classic:99` → Classic booklet number only (exact)
    const classicNum = parseClassicNumberQuery(debouncedQuery.value)
    if (classicNum != null) {
      return sortBrowseTags(
        tags.value.filter(
          (t) => isClassicCollection(t.collection) && Number(t.classic) === classicNum,
        ),
        sortMode.value,
        sortReverse.value,
      )
    }
    // `p12` / `100days:12` → 100 Days booklet number (exact)
    const daysNum = parse100DaysNumberQuery(debouncedQuery.value)
    if (daysNum != null) {
      return sortBrowseTags(
        tags.value.filter(
          (t) => is100DaysCollection(t.collection) && Number(t.classic) === daysNum,
        ),
        sortMode.value,
        sortReverse.value,
      )
    }
    // Bare `3558` → exact Tag # and/or Classic booklet # only (not 100 Days)
    const bareNum = parseExactTagIdQuery(debouncedQuery.value)
    if (bareNum != null) {
      return sortBrowseTags(
        tags.value.filter(
          (t) =>
            t.id === bareNum ||
            (isClassicCollection(t.collection) && Number(t.classic) === bareNum),
        ),
        sortMode.value,
        sortReverse.value,
      )
    }
    const q = buildSearchQuery(debouncedQuery.value, filters.value)
    return sortBrowseTags(eng.search(q), sortMode.value, sortReverse.value)
  })

  const results = computed(() => allResults.value.slice(0, resultLimit.value))
  const hasMoreResults = computed(() => allResults.value.length > resultLimit.value)
  const browseWindow = computed(() =>
    buildBrowseRows(allResults.value, sortMode.value, resultLimit.value),
  )
  const filterCount = computed(() => activeFilterCount(filters.value))

  const arrangers = computed(() => uniqueFieldValues(tags.value, 'arranger'))
  const keys = computed(() => uniqueFieldValues(tags.value, 'key'))
  const types = computed(() => uniqueFieldValues(tags.value, 'type'))
  const collections = computed(() => uniqueFieldValues(tags.value, 'collection'))

  function patchFilters(patch: Partial<CatalogFilters>): void {
    filters.value = { ...filters.value, ...patch }
  }

  function clearFilters(): void {
    const fullText = filters.value.fullText
    filters.value = { ...EMPTY_FILTERS, fullText }
  }

  function toggleSelect(id: number): void {
    const next = new Set(selectedIds.value)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    selectedIds.value = next
  }

  function clearSelection(): void {
    selectedIds.value = new Set()
  }

  function showMoreResults(): void {
    resultLimit.value += RESULTS_PAGE_SIZE
  }

  /** Reveal enough rows that `sectionKey` is in the window; returns tag index. */
  function revealSection(sectionKey: string): number {
    const idx = indexOfSection(allResults.value, sortMode.value, sectionKey)
    if (idx < 0) return -1
    resultLimit.value = Math.max(resultLimit.value, idx + RESULTS_PAGE_SIZE)
    return idx
  }

  function syncFromRoute(query: Record<string, unknown>, sort: SortMode): void {
    const q = typeof query.q === 'string' ? query.q : ''
    queryText.value = q
    debouncedQuery.value = q
    searching.value = false
    if (debounceTimer) {
      clearTimeout(debounceTimer)
      debounceTimer = null
    }
    const parsed = filtersFromRouteQuery(query)
    filters.value = {
      ...EMPTY_FILTERS,
      ...parsed,
      keys: parsed.keys ?? [],
      arrangers: parsed.arrangers ?? [],
      types: parsed.types ?? [],
      collections: parsed.collections ?? [],
    }
    const allowed: SortMode[] = [
      'rating',
      'title',
      'arranger',
      'arranger-last',
      'year',
      'downloads',
      'id',
      'collection',
    ]
    sortMode.value = allowed.includes(sort) ? sort : 'rating'
    sortReverse.value = query.rev === '1'
    resultLimit.value = RESULTS_PAGE_SIZE
  }

  function routeQueryPatch(): Record<string, string | undefined> {
    return {
      q: debouncedQuery.value || undefined,
      sort: sortMode.value === 'rating' ? undefined : sortMode.value,
      rev: sortReverse.value ? '1' : undefined,
      ...filtersToRouteQuery(filters.value),
    }
  }

  function toggleSortReverse(): void {
    sortReverse.value = !sortReverse.value
  }

  function getById(id: number): TagSummary | undefined {
    return tags.value.find((t) => t.id === id)
  }

  function neighbors(id: number): { prev: number | null; next: number | null; index: number; total: number } {
    const ids = allResults.value.map((t) => t.id)
    const index = ids.indexOf(id)
    if (index < 0) return { prev: null, next: null, index: -1, total: ids.length }
    return {
      prev: index > 0 ? ids[index - 1]! : null,
      next: index < ids.length - 1 ? ids[index + 1]! : null,
      index,
      total: ids.length,
    }
  }

  /** @deprecated use filters.fullText */
  const fullText = computed({
    get: () => filters.value.fullText,
    set: (v: boolean) => {
      filters.value = { ...filters.value, fullText: v }
    },
  })

  return {
    tags,
    loaded,
    loading,
    error,
    filters,
    fullText,
    queryText,
    debouncedQuery,
    sortMode,
    sortReverse,
    selectedIds,
    results,
    allResults,
    browseWindow,
    hasMoreResults,
    filterCount,
    arrangers,
    keys,
    types,
    collections,
    lyricsLoaded,
    lyricsLoading,
    lyricsById,
    searching,
    resultLimit,
    load,
    hydrateFromSnapshot,
    hydrateFromIndexedDb,
    ensureLyrics,
    prefetchLyrics,
    lyricsSnippet,
    patchFilters,
    clearFilters,
    toggleSelect,
    clearSelection,
    showMoreResults,
    revealSection,
    syncFromRoute,
    routeQueryPatch,
    toggleSortReverse,
    getById,
    neighbors,
  }
})
