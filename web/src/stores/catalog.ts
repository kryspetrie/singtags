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
  splitArrangerNames,
  type BrowseSortMode,
} from '../search/browse'
import { foldText } from '../search/normalize'
import {
  activeFilterCount,
  buildSearchQuery,
  EMPTY_FILTERS,
  filtersFromRouteQuery,
  filtersToRouteQuery,
  type CatalogFilters,
} from '../search/filters'
import { normalizeYear } from '../lib/year'
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
import { useUserCollectionsStore } from './userCollections'
import {
  filterTagsByCollectionOptions,
  isUserCollectionFilterId,
} from '../lib/collections'

export type SortMode = BrowseSortMode

/** Dwell before running free-text search (~30+ WPM desktop). Chips apply immediately. */
export const SEARCH_DEBOUNCE_MS = 320

/** How many browse rows to show initially / add per infinite-scroll page (~6% of a 7.5k catalog). */
export const RESULTS_PAGE_SIZE = 480

/** Sort modes that only make sense on a narrowed result set. */
const SCOPED_SORTS = new Set<SortMode>(['rating', 'downloads'])

/** Default when browsing the full catalog (or after leaving a scoped sort). */
export const DEFAULT_BROWSE_SORT: SortMode = 'collection'

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
  const sortMode = ref<SortMode>(DEFAULT_BROWSE_SORT)
  const sortReverse = ref(false)
  const selectedIds = ref<Set<number>>(new Set())
  const searching = ref(false)
  const resultLimit = ref(RESULTS_PAGE_SIZE)

  let debounceTimer: ReturnType<typeof setTimeout> | null = null
  /** Reactive so result computeds re-run when the search index is ready. */
  const engine = shallowRef<SearchEngine | null>(null)

  function hasSearchOrFilter(): boolean {
    return debouncedQuery.value.trim().length > 0 || activeFilterCount(filters.value) > 0
  }

  function coerceSortMode(mode: SortMode): SortMode {
    if (SCOPED_SORTS.has(mode) && !hasSearchOrFilter()) return DEFAULT_BROWSE_SORT
    return mode
  }

  watch(queryText, (q) => {
    searching.value = true
    if (debounceTimer) clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => {
      debouncedQuery.value = q
      searching.value = false
      resultLimit.value = RESULTS_PAGE_SIZE
      sortMode.value = coerceSortMode(sortMode.value)
    }, SEARCH_DEBOUNCE_MS)
  })

  watch(
    filters,
    () => {
      resultLimit.value = RESULTS_PAGE_SIZE
      sortMode.value = coerceSortMode(sortMode.value)
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
    const userCols = useUserCollectionsStore()
    const colFilters = filters.value.collections
    const hasUserCol = colFilters.some((c) => isUserCollectionFilterId(c))
    const engineFilters = hasUserCol
      ? { ...filters.value, collections: [] }
      : filters.value
    const q = buildSearchQuery(debouncedQuery.value, engineFilters)
    let found = sortBrowseTags(eng.search(q), sortMode.value, sortReverse.value)
    if (hasUserCol) {
      found = filterTagsByCollectionOptions(found, colFilters, userCols.collections)
    }
    return found
  })

  const results = computed(() => allResults.value)
  const hasMoreResults = computed(() => false)
  /** Full sectioned list for window virtualization (not a paged window). */
  const browseWindow = computed(() => {
    const userCols = useUserCollectionsStore()
    return buildBrowseRows(allResults.value, sortMode.value, allResults.value.length, {
      userCollections: userCols.collections.map((c) => ({
        id: c.id,
        name: c.name,
        tagIds: c.tagIds,
      })),
    })
  })
  const filterCount = computed(() => activeFilterCount(filters.value))

  const arrangers = computed(() => {
    const set = new Set<string>()
    for (const t of tags.value) {
      for (const name of splitArrangerNames(t.arranger)) set.add(name)
    }
    return [...set].sort((a, b) => foldText(a).localeCompare(foldText(b)))
  })
  const years = computed(() => {
    const set = new Set<number>()
    for (const t of tags.value) {
      const y = normalizeYear(t.year)
      if (y != null) set.add(y)
    }
    return [...set].sort((a, b) => b - a)
  })
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
    /* no-op: browse list is window-virtualized over the full result set */
  }

  /** First tag index for a section key (list is fully available to the virtualizer). */
  function revealSection(sectionKey: string): number {
    const secIdx = browseWindow.value.rows.findIndex(
      (r) => r.type === 'section' && r.key === sectionKey,
    )
    if (secIdx >= 0) {
      const next = browseWindow.value.rows[secIdx + 1]
      if (next?.type === 'tag') return next.index
    }
    return indexOfSection(allResults.value, sortMode.value, sectionKey)
  }

  /** Tag index for scrub/jump (list is fully available to the virtualizer). */
  function revealIndex(idx: number): number {
    if (idx < 0 || idx >= allResults.value.length) return -1
    return idx
  }

  function syncFromRoute(query: Record<string, unknown>, sort: SortMode): void {
    const q = typeof query.q === 'string' ? query.q : ''
    const parsed = filtersFromRouteQuery(query)
    const nextFilters: CatalogFilters = {
      ...EMPTY_FILTERS,
      ...parsed,
      arrangers: parsed.arrangers ?? [],
      types: parsed.types ?? [],
      collections: parsed.collections ?? [],
      titleLetters: parsed.titleLetters ?? [],
    }
    const allowed: SortMode[] = [
      'rating',
      'title',
      'year',
      'downloads',
      'id',
      'collection',
    ]
    const requested = allowed.includes(sort) ? sort : DEFAULT_BROWSE_SORT
    const nextRev = query.rev === '1'
    const prevBrowseKey = JSON.stringify({
      q: debouncedQuery.value,
      sort: sortMode.value,
      rev: sortReverse.value,
      f: filtersToRouteQuery(filters.value),
    })

    // Apply query/filters before coerce so scoped sorts drop when the catalog widens.
    queryText.value = q
    debouncedQuery.value = q
    searching.value = false
    if (debounceTimer) {
      clearTimeout(debounceTimer)
      debounceTimer = null
    }
    filters.value = nextFilters
    const nextSort = coerceSortMode(requested)
    sortMode.value = nextSort
    sortReverse.value = nextRev

    const nextBrowseKey = JSON.stringify({
      q,
      sort: nextSort,
      rev: nextRev,
      f: filtersToRouteQuery(nextFilters),
    })
    // Remounting browse (tag → back) re-applies the same route — keep infinite-scroll
    // window so scroll restoration has enough content height.
    if (prevBrowseKey !== nextBrowseKey) resultLimit.value = RESULTS_PAGE_SIZE
  }

  function routeQueryPatch(): Record<string, string | undefined> {
    return {
      q: debouncedQuery.value || undefined,
      sort: sortMode.value === DEFAULT_BROWSE_SORT ? undefined : sortMode.value,
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
    years,
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
    revealIndex,
    syncFromRoute,
    routeQueryPatch,
    toggleSortReverse,
    getById,
    neighbors,
  }
})
