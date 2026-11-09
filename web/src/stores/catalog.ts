/**
 * Catalog browse state: tag index, search, filters, sort, lyrics, and route sync.
 *
 * Loads from network (gzip indexes) with fallbacks to manifest and IndexedDB snapshots.
 * Writes catalog/lyrics snapshots to IndexedDB and localStorage mirror on successful fetch.
 */
import { defineStore } from 'pinia'
import { computed, ref, shallowRef, watch } from 'vue'
import type { Ref } from 'vue'
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
  type CatalogFilters,
} from '../search/filters'
import { browseQueryToState, browseStateToQuery } from '../lib/browseRouteQuery'
import { normalizeYear } from '../lib/year'
import type { TagSummary } from '../types/tag'
import { useUserCollectionsStore } from './userCollections'
import { useRatingsStore } from './ratings'
import {
  filterTagsByCollectionOptions,
  isOtherCollectionFilterId,
  isUserCollectionFilterId,
  parseUserCollectionFilterId,
} from '../lib/collections'
import {
  matchesOfflineBrowseFilters,
  type TagCacheReady,
} from '../lib/offlineReadiness'
import { type StoreDeps } from './catalog/deps'
import { createCatalogLoadActions } from './catalog/loadCatalog'

export type SortMode = BrowseSortMode

/** Dwell before running free-text search (~30+ WPM desktop). Chips apply immediately. */
export const SEARCH_DEBOUNCE_MS = 320

/** How many browse rows to show initially / add per infinite-scroll page (~6% of a 7.5k catalog). */
export const RESULTS_PAGE_SIZE = 480

/** Sort modes that only make sense on a narrowed result set. */
const SCOPED_SORTS = new Set<SortMode>(['rating', 'downloads', 'myRating'])

/** Default when browsing the full catalog (or after leaving a scoped sort). */
export const DEFAULT_BROWSE_SORT: SortMode = 'collection'

/** Pinia store for the tag catalog, search, and browse UI state. */
export const useCatalogStore = defineStore('catalog', () => {

  const tags = ref<TagSummary[]>([])
  const loaded = ref(false)
  const loading = ref(false)
  /**
   * True while showing the sync first-paint slice (viewport of tags) before the
   * full IndexedDB / network catalog replaces it.
   */
  const partialCatalog = ref(false)
  /** Full catalog size while `partialCatalog` (from first-paint cache). */
  const catalogTotalHint = ref<number | null>(null)
  /**
   * Full-catalog collection jump keys from first-paint cache.
   * Used so the jump rail can size correctly before IDB returns.
   */
  const firstPaintJumpKeys = ref<string[] | null>(null)
  const error = ref<string | null>(null)
  const expansions = ref<ExpansionMap>({})
  const lyricsById = ref<Map<number, string>>(new Map())
  const lyricsLoaded = ref(false)
  const lyricsLoading = ref(false)
  /** Bumped whenever lyrics are (re)attached to the search engine — keeps FTS reactive after catalog refresh. */
  const lyricsEpoch = ref(0)
  const filters = ref<CatalogFilters>({ ...EMPTY_FILTERS })
  /** Live free-text input. */
  const queryText = ref('')
  /** Debounced free-text used for search + URL. */
  const debouncedQuery = ref('')
  const sortMode = ref<SortMode>(DEFAULT_BROWSE_SORT)
  const sortReverse = ref(false)
  const selectedIds = ref<Set<number>>(new Set())
  const cacheReadyByTag: Ref<Map<number, TagCacheReady>> = ref(new Map())
  const searching = ref(false)
  const resultLimit = ref(RESULTS_PAGE_SIZE)
  /** Reactive so result computeds re-run when the search index is ready. */
  const engine = shallowRef<SearchEngine | null>(null)

  /** Full filtered/sorted result set (virtualizer uses entire list). */
  const allResults = computed(() => {
    const eng = engine.value
    // Re-run when the lyrics index arrives or is reattached after a catalog refresh.
    void lyricsLoaded.value
    void lyricsById.value.size
    void lyricsEpoch.value
    // Re-run when My Ratings change (Rated chip).
    void useRatingsStore().revision
    const sortOpts = browseSortOpts()
    // Tags-only window: SearchEngine still building after IDB hydrate.
    if (!eng) {
      if (!tags.value.length || hasSearchOrFilter()) return [] as TagSummary[]
      return applyClientFilters(
        sortBrowseTags(tags.value, sortMode.value, sortReverse.value, sortOpts),
      )
    }
    // `n123` → site Tag # only (exact; never prefix / fall through to FTS)
    const tagNum = parseTagNumberQuery(debouncedQuery.value)
    if (tagNum != null) {
      const hit = tags.value.find((t) => t.id === tagNum)
      return applyClientFilters(hit ? [hit] : [])
    }
    // `c99` / `classic:99` → Classic booklet number only (exact)
    const classicNum = parseClassicNumberQuery(debouncedQuery.value)
    if (classicNum != null) {
      return applyClientFilters(sortBrowseTags(
        tags.value.filter(
          (t) => isClassicCollection(t.collection) && Number(t.classic) === classicNum,
        ),
        sortMode.value,
        sortReverse.value,
        sortOpts,
      ))
    }
    // `p12` / `100days:12` → 100 Days booklet number (exact)
    const daysNum = parse100DaysNumberQuery(debouncedQuery.value)
    if (daysNum != null) {
      return applyClientFilters(sortBrowseTags(
        tags.value.filter(
          (t) => is100DaysCollection(t.collection) && Number(t.classic) === daysNum,
        ),
        sortMode.value,
        sortReverse.value,
        sortOpts,
      ))
    }
    // Bare `3558` → exact Tag # and/or Classic booklet # only (not 100 Days)
    const bareNum = parseExactTagIdQuery(debouncedQuery.value)
    if (bareNum != null) {
      return applyClientFilters(sortBrowseTags(
        tags.value.filter(
          (t) =>
            t.id === bareNum ||
            (isClassicCollection(t.collection) && Number(t.classic) === bareNum),
        ),
        sortMode.value,
        sortReverse.value,
        sortOpts,
      ))
    }
    const userCols = useUserCollectionsStore()
    const colFilters = filters.value.collections
    // User playlists + Other are client-side only (not MiniSearch collection fields).
    const needsClientCollectionFilter = colFilters.some(
      (c) => isUserCollectionFilterId(c) || isOtherCollectionFilterId(c),
    )
    let engineFilters = needsClientCollectionFilter
      ? {
          ...filters.value,
          collections: colFilters.filter(
            (c) => !isUserCollectionFilterId(c) && !isOtherCollectionFilterId(c),
          ),
        }
      : filters.value
    // Available offline: has sheet/audio apply to cached blobs, not catalog metadata.
    if (engineFilters.cached != null) {
      engineFilters = { ...engineFilters, hasSheet: null, hasAudio: null }
    }
    const q = buildSearchQuery(debouncedQuery.value, engineFilters)
    let found = sortBrowseTags(eng.search(q), sortMode.value, sortReverse.value, sortOpts)
    if (needsClientCollectionFilter) {
      found = filterTagsByCollectionOptions(found, colFilters, userCols.collections)
    }
    return applyClientFilters(found)
  })

  /** Alias of `allResults` (legacy name for paged browse). */
  const results = computed(() => allResults.value)
  /** Always false — browse uses window virtualization over the full result set. */
  const hasMoreResults = computed(() => false)
  /** Full sectioned list for window virtualization (not a paged window). */
  const browseWindow = computed(() => {
    const userCols = useUserCollectionsStore()
    const collectionFilters = filters.value.collections
    const singleCollectionFilter =
      sortMode.value === 'collection' && collectionFilters.length === 1
        ? collectionFilters[0]
        : undefined
    const activeUserCollectionFilters = collectionFilters.filter(isUserCollectionFilterId)
    return buildBrowseRows(allResults.value, sortMode.value, allResults.value.length, {
      userCollections: userCols.collections.map((c) => ({
        id: c.id,
        name: c.name,
        tagIds: c.tagIds,
      })),
      activeUserCollectionFilters:
        !singleCollectionFilter && activeUserCollectionFilters.length
          ? activeUserCollectionFilters
          : undefined,
      singleCollectionFilter,
      ...browseSortOpts(),
    })
  })
  /** Count of active filter chips (excludes free-text, handled separately). */
  const filterCount = computed(() => activeFilterCount(filters.value))

  /** Unique arranger names across the catalog (split combined strings). */
  const arrangers = computed(() => {
    const set = new Set<string>()
    for (const t of tags.value) {
      for (const name of splitArrangerNames(t.arranger)) set.add(name)
    }
    return [...set].sort((a, b) => foldText(a).localeCompare(foldText(b)))
  })
  /** Distinct normalized years present in the catalog (newest first). */
  const years = computed(() => {
    const set = new Set<number>()
    for (const t of tags.value) {
      const y = normalizeYear(t.year)
      if (y != null) set.add(y)
    }
    return [...set].sort((a, b) => b - a)
  })
  /** Distinct tag types for filter chips. */
  const types = computed(() => uniqueFieldValues(tags.value, 'type'))
  /** Distinct catalog collection names for filter chips. */
  const collections = computed(() => uniqueFieldValues(tags.value, 'collection'))

  /** @deprecated use filters.fullText */
  const fullText = computed({
    get: () => filters.value.fullText,
    set: (v: boolean) => {
      filters.value = { ...filters.value, fullText: v }
    },
  })
  const slots = {
    debounceTimer: null as (ReturnType<typeof setTimeout> | null),
  }
  const deps: StoreDeps = {
    tags,
    loaded,
    loading,
    partialCatalog,
    catalogTotalHint,
    firstPaintJumpKeys,
    error,
    expansions,
    lyricsById,
    lyricsLoaded,
    lyricsLoading,
    lyricsEpoch,
    filters,
    queryText,
    debouncedQuery,
    sortMode,
    sortReverse,
    selectedIds,
    cacheReadyByTag,
    searching,
    resultLimit,
    engine,
    allResults,
    results,
    hasMoreResults,
    browseWindow,
    filterCount,
    arrangers,
    years,
    types,
    collections,
    fullText,
    slots,
    hasSearchOrFilter,
    coerceSortMode,
    setCacheReadyIndex,
    browseSortOpts,
    filterByCachedReadiness,
    filterByMyRating,
    applyClientFilters,
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
  const loadActions = createCatalogLoadActions(deps)
  loadActions.bindWatches()
  const {
    load,
    hydrateFirstPaint,
    hydrateFirstPaintChrome,
    hydrateFromSnapshot,
    beginIndexedDbHydrate,
    hydrateFromIndexedDb,
    hydrateLyricsFromIndexedDb,
    prefetchLyrics,
    lyricsSnippet,
    ensureLyrics,
  } = {
    ...loadActions.actions,
  }

  /** True when free-text query or any filter chip is active. */
  function hasSearchOrFilter(): boolean {
    return debouncedQuery.value.trim().length > 0 || activeFilterCount(filters.value) > 0
  }

  /** Downgrade rating/downloads sort when browsing the full unfiltered catalog. */
  function coerceSortMode(mode: SortMode): SortMode {
    if (SCOPED_SORTS.has(mode) && !hasSearchOrFilter()) return DEFAULT_BROWSE_SORT
    return mode
  }

  watch(queryText, (q) => {
    searching.value = true
    if (slots.debounceTimer) clearTimeout(slots.debounceTimer)
    slots.debounceTimer = setTimeout(() => {
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

  /** Replace the bulk-built per-tag offline readiness index. */
  function setCacheReadyIndex(map: Map<number, TagCacheReady>): void {
    cacheReadyByTag.value = map
  }

  function browseSortOpts() {
    const ratings = useRatingsStore()
    void ratings.revision
    return {
      myStars: (tagId: number) => ratings.starsFor(tagId),
    }
  }

  function filterByCachedReadiness(list: TagSummary[]): TagSummary[] {
    if (filters.value.cached == null) return list
    return list.filter((tag) =>
      matchesOfflineBrowseFilters(cacheReadyByTag.value.get(tag.id), filters.value),
    )
  }

  function filterByMyRating(list: TagSummary[]): TagSummary[] {
    if (filters.value.rated !== true) return list
    const ratings = useRatingsStore()
    void ratings.revision
    return list.filter((tag) => ratings.has(tag.id))
  }

  function applyClientFilters(list: TagSummary[]): TagSummary[] {
    return filterByMyRating(filterByCachedReadiness(list))
  }

  /** Merge partial filter state (resets result window via watcher). */
  function patchFilters(patch: Partial<CatalogFilters>): void {
    filters.value = { ...filters.value, ...patch }
  }

  /** Clear all filter chips but keep full-text search mode flag. */
  function clearFilters(): void {
    const fullText = filters.value.fullText
    filters.value = { ...EMPTY_FILTERS, fullText }
  }

  /** Toggle multi-select id in browse bulk actions. */
  function toggleSelect(id: number): void {
    const next = new Set(selectedIds.value)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    selectedIds.value = next
  }

  /** Clear browse multi-selection. */
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
    if (isUserCollectionFilterId(sectionKey)) {
      const uid = parseUserCollectionFilterId(sectionKey)
      const col = useUserCollectionsStore().collections.find((c) => c.id === uid)
      if (col) {
        for (let i = 0; i < allResults.value.length; i++) {
          if (col.tagIds.includes(allResults.value[i]!.id)) return i
        }
      }
      return -1
    }
    return indexOfSection(allResults.value, sortMode.value, sectionKey, browseSortOpts())
  }

  /** Tag index for scrub/jump (list is fully available to the virtualizer). */
  function revealIndex(idx: number): number {
    if (idx < 0 || idx >= allResults.value.length) return -1
    return idx
  }

  /**
   * Apply route query to store (deep-link / back navigation).
   * Resets result limit when browse key changes.
   */
  function syncFromRoute(query: Record<string, unknown>, sort: SortMode): void {
    const parsed = browseQueryToState(query, sort)
    const nextFilters: CatalogFilters = {
      ...EMPTY_FILTERS,
      ...parsed.filters,
      arrangers: parsed.filters.arrangers ?? [],
      types: parsed.filters.types ?? [],
      collections: parsed.filters.collections ?? [],
      titleLetters: parsed.filters.titleLetters ?? [],
    }
    const allowed: SortMode[] = [
      'rating',
      'myRating',
      'title',
      'year',
      'downloads',
      'id',
      'collection',
    ]
    const requested = allowed.includes(parsed.sort) ? parsed.sort : DEFAULT_BROWSE_SORT
    const nextRev = parsed.rev
    const q = parsed.q
    const prevBrowseKey = JSON.stringify({
      q: debouncedQuery.value,
      sort: sortMode.value,
      rev: sortReverse.value,
      f: browseStateToQuery({
        q: debouncedQuery.value,
        sort: sortMode.value,
        defaultSort: DEFAULT_BROWSE_SORT,
        rev: sortReverse.value,
        filters: filters.value,
      }),
    })

    // Apply query/filters before coerce so scoped sorts drop when the catalog widens.
    queryText.value = q
    debouncedQuery.value = q
    searching.value = false
    if (slots.debounceTimer) {
      clearTimeout(slots.debounceTimer)
      slots.debounceTimer = null
    }
    filters.value = nextFilters
    const nextSort = coerceSortMode(requested)
    sortMode.value = nextSort
    sortReverse.value = nextRev

    const nextBrowseKey = JSON.stringify({
      q,
      sort: nextSort,
      rev: nextRev,
      f: browseStateToQuery({
        q,
        sort: nextSort,
        defaultSort: DEFAULT_BROWSE_SORT,
        rev: nextRev,
        filters: nextFilters,
      }),
    })
    // Remounting browse (tag → back) re-applies the same route — keep infinite-scroll
    // window so scroll restoration has enough content height.
    if (prevBrowseKey !== nextBrowseKey) resultLimit.value = RESULTS_PAGE_SIZE
  }

  /** Build router query patch from current browse state. */
  function routeQueryPatch(): Record<string, string> {
    return browseStateToQuery({
      q: debouncedQuery.value,
      sort: sortMode.value,
      defaultSort: DEFAULT_BROWSE_SORT,
      rev: sortReverse.value,
      filters: filters.value,
    })
  }

  /** Flip ascending/descending for the current sort mode. */
  function toggleSortReverse(): void {
    sortReverse.value = !sortReverse.value
  }

  /** Lookup one tag summary by id from the loaded catalog. */
  function getById(id: number): TagSummary | undefined {
    return tags.value.find((t) => t.id === id)
  }

  /**
   * Previous/next tag within current search results (for tag view navigation).
   *
   * @returns `index === -1` when id is not in the current result set.
   */
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

  return {
    tags,
    loaded,
    loading,
    partialCatalog,
    catalogTotalHint,
    firstPaintJumpKeys,
    error,
    filters,
    fullText,
    queryText,
    debouncedQuery,
    sortMode,
    sortReverse,
    selectedIds,
    cacheReadyByTag,
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
    hydrateFirstPaint,
    hydrateFirstPaintChrome,
    hydrateFromSnapshot,
    beginIndexedDbHydrate,
    hydrateFromIndexedDb,
    hydrateLyricsFromIndexedDb,
    ensureLyrics,
    prefetchLyrics,
    lyricsSnippet,
    setCacheReadyIndex,
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
