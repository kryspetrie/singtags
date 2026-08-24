import { defineStore } from 'pinia'
import { computed, ref, shallowRef, watch } from 'vue'
import { SearchEngine, uniqueFieldValues } from '../search/engine'
import type { ExpansionMap } from '../search/expansions'
import {
  buildBrowseRows,
  indexOfSection,
  parseClassicNumberQuery,
  parseExactTagIdQuery,
  parseTagNumberQuery,
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
import { indexesUrl, mediaUrl } from '../lib/mediaUrl'
import { useOfflineLibraryStore } from './offlineLibrary'

export type SortMode = BrowseSortMode

/** Dwell before running free-text search (~30+ WPM desktop). Chips apply immediately. */
export const SEARCH_DEBOUNCE_MS = 320

/** How many more rows to reveal when the user scrolls near the end. */
export const RESULTS_PAGE_SIZE = 48

async function gunzipJson<T>(url: string): Promise<T> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Failed to load ${url} (${res.status})`)
  const buf = await res.arrayBuffer()
  const bytes = new Uint8Array(buf)
  // Vite/sirv often serves *.gz with Content-Encoding: gzip; fetch already decoded.
  const isGzip = bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b
  let text: string
  if (isGzip) {
    const ds = new DecompressionStream('gzip')
    const stream = new Response(buf).body!.pipeThrough(ds)
    text = await new Response(stream).text()
  } else {
    text = new TextDecoder().decode(bytes)
  }
  return JSON.parse(text) as T
}

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

  async function load(): Promise<void> {
    if (loaded.value || loading.value) return
    loading.value = true
    error.value = null
    try {
      const [core, exp] = await Promise.all([
        gunzipJson<CoreIndex>(indexesUrl('core.json.gz')),
        fetch(indexesUrl('expansions.json')).then(async (r) => {
          if (!r.ok) return { map: {} as ExpansionMap }
          return (await r.json()) as { map: ExpansionMap }
        }),
      ])
      const list = core.tags ?? []
      expansions.value = exp.map ?? {}
      engine.value = new SearchEngine({
        tags: list,
        expansions: expansions.value,
      })
      tags.value = list
      loaded.value = true
      try {
        useOfflineLibraryStore().markCatalogCached()
      } catch {
        /* pinia may not be ready in unit tests */
      }
      void prefetchLyrics()
    } catch (e) {
      try {
        const res = await fetch(mediaUrl('manifest.json'))
        const data = (await res.json()) as { tags: TagSummary[] }
        const list = data.tags ?? []
        engine.value = new SearchEngine({ tags: list, expansions: {} })
        tags.value = list
        loaded.value = true
        try {
          useOfflineLibraryStore().markCatalogCached()
        } catch {
          /* ignore */
        }
      } catch {
        const offlineHint =
          typeof navigator !== 'undefined' && !navigator.onLine
            ? 'Connect once to download the catalog, then SingTags works offline.'
            : null
        error.value = offlineHint || (e instanceof Error ? e.message : String(e))
      }
    } finally {
      loading.value = false
    }
  }

  async function prefetchLyrics(): Promise<void> {
    if (lyricsLoaded.value || lyricsLoading.value) return
    lyricsLoading.value = true
    try {
      const idx = await gunzipJson<LyricsIndex>(indexesUrl('lyrics.json.gz'))
      const docs = idx.docs ?? []
      engine.value?.setLyrics(docs)
      const map = new Map<number, string>()
      for (const d of docs) {
        if (d.lyrics?.trim()) map.set(d.id, d.lyrics.trim())
      }
      lyricsById.value = map
      lyricsLoaded.value = true
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
    // `n123` → site Tag # only (exact; never prefix / fall through to FTS)
    const tagNum = parseTagNumberQuery(debouncedQuery.value)
    if (tagNum != null) {
      const hit = tags.value.find((t) => t.id === tagNum)
      return hit ? [hit] : []
    }
    // `c99` / `classic:99` → classic booklet number (exact)
    const classicNum = parseClassicNumberQuery(debouncedQuery.value)
    if (classicNum != null) {
      return sortBrowseTags(
        tags.value.filter((t) => Number(t.classic) === classicNum),
        sortMode.value,
      )
    }
    // Bare `3558` → exact Tag # and/or Classic # only (no number-word FTS expansion)
    const bareNum = parseExactTagIdQuery(debouncedQuery.value)
    if (bareNum != null) {
      return sortBrowseTags(
        tags.value.filter((t) => t.id === bareNum || Number(t.classic) === bareNum),
        sortMode.value,
      )
    }
    const q = buildSearchQuery(debouncedQuery.value, filters.value)
    return sortBrowseTags(eng.search(q), sortMode.value)
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
    filters.value = { ...EMPTY_FILTERS }
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
    ]
    sortMode.value = allowed.includes(sort) ? sort : 'rating'
    resultLimit.value = RESULTS_PAGE_SIZE
  }

  function routeQueryPatch(): Record<string, string | undefined> {
    return {
      q: debouncedQuery.value || undefined,
      sort: sortMode.value === 'rating' ? undefined : sortMode.value,
      ...filtersToRouteQuery(filters.value),
    }
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
    getById,
    neighbors,
  }
})
