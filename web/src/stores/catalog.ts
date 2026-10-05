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
import type { CoreIndex, LyricsIndex, TagSummary } from '../types/tag'
import {
  loadCatalogSnapshotAsync,
  loadCatalogSnapshotSync,
  saveCatalogSnapshot,
} from '../lib/catalogSnapshot'
import {
  browseUrlLooksDefault,
  loadCatalogFirstPaint,
  saveCatalogFirstPaint,
} from '../lib/catalogFirstPaint'
import { loadLyricsSnapshotAsync, saveLyricsSnapshot } from '../lib/lyricsSnapshot'
import { putCatalogSnapshotIdb } from '../offline/indexSnapshotDb'
import { fetchGzipJsonCached, fetchJsonCached } from '../lib/gunzipJson'
import { indexesUrl, mediaUrl } from '../lib/mediaUrl'
import { useOfflineLibraryStore } from './offlineLibrary'
import { useOfflineModeStore } from './offlineMode'
import { useUserCollectionsStore } from './userCollections'
import { useRatingsStore } from './ratings'
import {
  filterTagsByCollectionOptions,
  isUserCollectionFilterId,
  parseUserCollectionFilterId,
} from '../lib/collections'
import {
  matchesOfflineBrowseFilters,
  type TagCacheReady,
} from '../lib/offlineReadiness'

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
  /** In-flight lyrics prefetch so callers can await the same load. */
  let lyricsPrefetch: Promise<void> | null = null
  /** True after a successful online lyrics.json.gz fetch this session. */
  let lyricsRevalidatedOnline = false
  /** Dedupes boot IDB hydrate so HomeView `load()` waits instead of racing the network. */
  let idbHydratePromise: Promise<boolean> | null = null
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

  let debounceTimer: ReturnType<typeof setTimeout> | null = null
  /** Reactive so result computeds re-run when the search index is ready. */
  const engine = shallowRef<SearchEngine | null>(null)

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

  /**
   * Apply fetched catalog tags and expansions; rebuild search engine.
   * Side effects: optional IndexedDB catalog snapshot, offline library `markCatalogCached`.
   *
   * @param opts.persist - Write snapshot (default true). False on IDB hydrate (already stored).
   * @param opts.deferEngine - Yield a frame before building SearchEngine so Browse can paint.
   */
  async function applyCatalogData(
    list: TagSummary[],
    exp: ExpansionMap,
    opts?: { persist?: boolean; deferEngine?: boolean },
  ): Promise<void> {
    expansions.value = exp
    tags.value = list
    loaded.value = true
    partialCatalog.value = false
    catalogTotalHint.value = null
    firstPaintJumpKeys.value = null
    error.value = null

    const buildEngine = () => {
      const eng = new SearchEngine({
        tags: list,
        expansions: exp,
      })
      if (lyricsById.value.size) {
        eng.setLyrics(
          [...lyricsById.value.entries()].map(([id, lyrics]) => ({ id, lyrics })),
        )
        lyricsEpoch.value++
      }
      engine.value = eng
    }

    if (opts?.persist !== false) {
      await saveCatalogSnapshot(list, exp)
      saveCatalogFirstPaint(list)
      try {
        useOfflineLibraryStore().markCatalogCached()
      } catch {
        /* pinia may not be ready in unit tests */
      }
    }

    if (opts?.deferEngine) {
      await new Promise<void>((resolve) => {
        const run = () => {
          buildEngine()
          resolve()
        }
        if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => run())
        else run()
      })
    } else {
      buildEngine()
    }
  }

  /**
   * Load catalog from network (or manifest / IDB fallback).
   * Side effects: network, IndexedDB snapshot, prefetches lyrics when online.
   *
   * @param opts.refresh - Force re-fetch even when already loaded.
   *   When the catalog is already painted from a snapshot, refresh does not
   *   set `loading` (stale-while-revalidate — Browse stays interactive).
   */
  async function load(opts?: { refresh?: boolean }): Promise<void> {
    // Let boot IDB finish first so we paint cache before any network refresh.
    if (idbHydratePromise) await idbHydratePromise
    if (loading.value) return
    if (opts?.refresh) lyricsRevalidatedOnline = false
    if (loaded.value && !opts?.refresh) {
      // First-paint slice: wait one tick for boot hydrate to start, then await it.
      if (partialCatalog.value) {
        if (!idbHydratePromise) await Promise.resolve()
        if (idbHydratePromise) await idbHydratePromise
        if (!partialCatalog.value) {
          if (!lyricsLoading.value) void prefetchLyrics()
          return
        }
      } else {
        // Revalidate lyrics once per online session even if IDB already hydrated them.
        if (!lyricsLoading.value) void prefetchLyrics()
        return
      }
    }
    // Initial fetch shows the loading gate; background refresh must not.
    const showLoading = !loaded.value
    if (showLoading) {
      loading.value = true
      error.value = null
    }
    try {
      const [core, exp] = await Promise.all([
        fetchGzipJsonCached<CoreIndex>(indexesUrl('core.json.gz')),
        fetchJsonCached(indexesUrl('expansions.json'), { map: {} as ExpansionMap }),
      ])
      const list = core.tags ?? []
      await applyCatalogData(list, exp.map ?? {})
      void prefetchLyrics()
    } catch (e) {
      try {
        const res = await fetch(mediaUrl('manifest.json'))
        const data = (await res.json()) as { tags: TagSummary[] }
        const list = data.tags ?? []
        await applyCatalogData(list, {})
      } catch {
        const snap = await loadCatalogSnapshotAsync()
        if (snap?.tags.length) {
          await applyCatalogData(snap.tags, snap.expansions, {
            persist: false,
            deferEngine: true,
          })
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
      if (showLoading) loading.value = false
    }
  }

  /**
   * Instant Browse paint from a tiny sync cache (one viewport of collection order).
   * Skipped when the URL already has search/filters (would flash the wrong list).
   */
  function hydrateFirstPaint(): boolean {
    if (loaded.value) return true
    if (!browseUrlLooksDefault()) return false
    const fp = loadCatalogFirstPaint()
    if (!fp?.tags.length) return false
    tags.value = fp.tags
    loaded.value = true
    partialCatalog.value = true
    catalogTotalHint.value = fp.totalCount
    firstPaintJumpKeys.value = fp.jumpKeys?.length ? [...fp.jumpKeys] : null
    error.value = null
    engine.value = null
    return true
  }

  /**
   * Jump-rail chrome only (no tag rows). Used for `?at=` reloads so mid-list
   * layout can size the collection strip before IDB returns.
   */
  function hydrateFirstPaintChrome(): boolean {
    if (firstPaintJumpKeys.value?.length) return true
    const fp = loadCatalogFirstPaint()
    if (!fp?.jumpKeys?.length) return false
    firstPaintJumpKeys.value = [...fp.jumpKeys]
    if (catalogTotalHint.value == null && fp.totalCount > 0) {
      catalogTotalHint.value = fp.totalCount
    }
    return true
  }

  /** Sync restore from localStorage mirror (instant boot). */
  function hydrateFromSnapshot(): boolean {
    if (loaded.value && !partialCatalog.value) return true
    const snap = loadCatalogSnapshotSync()
    if (!snap?.tags.length) return false
    // Sync path: defer engine so the first frame can clear “Loading catalog…”.
    void applyCatalogData(snap.tags, snap.expansions, { persist: false, deferEngine: true })
    return true
  }

  /** Merge lyrics into search engine and in-memory map; does not persist alone. */
  function applyLyricsDocs(docs: Array<{ id: number; lyrics: string }>): void {
    engine.value?.setLyrics(docs)
    lyricsEpoch.value++
    const map = new Map<number, string>()
    for (const d of docs) {
      if (d.lyrics?.trim()) map.set(d.id, d.lyrics.trim())
    }
    lyricsById.value = map
    lyricsLoaded.value = map.size > 0
  }

  /** Restore catalog from IndexedDB — lyrics hydrate separately after first paint. */
  async function hydrateFromIndexedDb(
    preloaded?: { tags: TagSummary[]; expansions?: ExpansionMap } | null,
  ): Promise<boolean> {
    if (idbHydratePromise) return idbHydratePromise
    idbHydratePromise = (async () => {
      // Allow replacing a first-paint slice with the full catalog.
      if (loaded.value && !partialCatalog.value) return true
      const snap =
        preloaded?.tags?.length
          ? { tags: preloaded.tags, expansions: preloaded.expansions ?? {} }
          : await loadCatalogSnapshotAsync()
      if (!snap?.tags.length) return false
      await applyCatalogData(snap.tags, snap.expansions, {
        persist: false,
        deferEngine: true,
      })
      // Upgrade legacy object-form snapshots to gzip for faster subsequent boots.
      void putCatalogSnapshotIdb(snap.tags, snap.expansions).catch(() => {
        /* quota */
      })
      return true
    })()
    try {
      return await idbHydratePromise
    } finally {
      idbHydratePromise = null
    }
  }

  /** Load lyrics index only from IndexedDB (when catalog already in memory). */
  async function hydrateLyricsFromIndexedDb(): Promise<boolean> {
    if (lyricsLoaded.value) return true
    const docs = await loadLyricsSnapshotAsync()
    if (!docs?.length) return false
    applyLyricsDocs(docs)
    return true
  }

  /**
   * Background-fetch lyrics index when online.
   * Uses IndexedDB for instant paint, then revalidates from the network so
   * published lyric edits show up without clearing site data.
   */
  async function prefetchLyrics(): Promise<void> {
    if (lyricsPrefetch) return lyricsPrefetch
    if (lyricsLoaded.value && lyricsRevalidatedOnline) return
    lyricsPrefetch = (async () => {
      lyricsLoading.value = true
      try {
        const offlineMode = useOfflineModeStore()
        const cached = await loadLyricsSnapshotAsync()
        if (cached?.length && !lyricsLoaded.value) {
          applyLyricsDocs(cached)
        }
        if (offlineMode.offline) return

        const idx = await fetchGzipJsonCached<LyricsIndex>(indexesUrl('lyrics.json.gz'))
        const docs = idx.docs ?? []
        if (!docs.length) return
        applyLyricsDocs(docs)
        saveLyricsSnapshot(docs)
        lyricsRevalidatedOnline = true
      } catch {
        /* optional — keep IDB lyrics if network fails */
      } finally {
        lyricsLoading.value = false
        lyricsPrefetch = null
      }
    })()
    return lyricsPrefetch
  }

  /**
   * Lyrics preview for browse rows (whitespace collapsed to one line).
   * Visual truncation is left to CSS line-clamp so wide cards can show more.
   *
   * @param id - Tag id.
   */
  function lyricsSnippet(id: number): string | null {
    const raw = lyricsById.value.get(id)
    if (!raw) return null
    const oneLine = raw.replace(/\s+/g, ' ').trim()
    return oneLine || null
  }

  /** Ensure lyrics index is loaded (revalidates from network when online). */
  async function ensureLyrics(): Promise<void> {
    await prefetchLyrics()
  }

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
    const hasUserCol = colFilters.some((c) => isUserCollectionFilterId(c))
    let engineFilters = hasUserCol ? { ...filters.value, collections: [] } : filters.value
    // Available offline: has sheet/audio apply to cached blobs, not catalog metadata.
    if (engineFilters.cached != null) {
      engineFilters = { ...engineFilters, hasSheet: null, hasAudio: null }
    }
    const q = buildSearchQuery(debouncedQuery.value, engineFilters)
    let found = sortBrowseTags(eng.search(q), sortMode.value, sortReverse.value, sortOpts)
    if (hasUserCol) {
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
