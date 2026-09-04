<script setup lang="ts">
/**
 * Browse home: virtualized tag list, search/filters, scrub rails, bulk queue/favorite actions,
 * and first-run welcome flow.
 */
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { useWindowVirtualizer } from '@tanstack/vue-virtual'
import { useCatalogStore, DEFAULT_BROWSE_SORT, type SortMode } from '../stores/catalog'
import { useQueueStore } from '../stores/queue'
import { useFavoritesStore } from '../stores/favorites'
import { useRecentStore } from '../stores/recent'
import type { PartId, TagDetail, TagSummary } from '../types/tag'
import { catalogOriginalPaths } from '../lib/audioTiers'
import { downloadableSheetAssets } from '../lib/sheetAssets'
import { partTrackLabel } from '../lib/parts'
import EmptyState from '../components/EmptyState.vue'
import ScrubRail from '../components/ScrubRail.vue'
import SearchChips from '../components/SearchChips.vue'
import FilterSheet from '../components/FilterSheet.vue'
import BrowseWelcomeDialog from '../components/BrowseWelcomeDialog.vue'
import OfflineOpticalTransferPrompt from '../components/OfflineOpticalTransferPrompt.vue'
import CollectionPickerSheet from '../components/CollectionPickerSheet.vue'
import CustomCollectionMark from '../components/CustomCollectionMark.vue'
import TagListRowContent from '../components/TagListRowContent.vue'
import TagSelectionBar from '../components/TagSelectionBar.vue'
import { useUserCollectionsStore } from '../stores/userCollections'
import { tagDetailUrl } from '../lib/mediaUrl'
import { fetchCached } from '../lib/manualOfflineFetch'
import { sheetsPack } from '../offline/libraryPack'
import { getStarred } from '../offline/favoritesDb'
import { useOfflineLibraryStore } from '../stores/offlineLibrary'
import { usePreferencesStore } from '../stores/preferences'
import { useSnackbarStore } from '../stores/snackbar'
import { browseScrollIntent } from '../router'
import {
  applyTagReturnScrollIfAny,
  consumeTagReturnScrollY,
  peekTagReturnOrigin,
  peekTagReturnScrollY,
} from '../lib/tagReturn'
import {
  hasJumpRail,
  hasScrubRail,
  type BrowseRow,
  parse100DaysNumberQuery,
  parseClassicNumberQuery,
  parseExactTagIdQuery,
  parseTagNumberQuery,
  tagIdHundredKey,
  yearSectionKey,
  yearBoundsForSectionKey,
  collectionIdForSectionKey,
  collectionJumpLabel,
} from '../search/browse'
import { isUserCollectionFilterId } from '../lib/collections'
import { normalizeYear } from '../lib/year'
import { DEFAULT_AXIS_BLEND } from '../lib/scrub'
import { visibleAltTitle } from '../lib/tagDisplay'
import { tagOpenLocation } from '../lib/tagOpen'
import { useTwoRowStripPaging } from '../composables/useTwoRowStripPaging'
import { parseTagQrPayload } from '../lib/tagQrScan'
import { unpackSingtagsSheetFile, isSingtagsSheetFile } from '../lib/decimen/singtagsPayload'
import { isLocalDocTransferFile } from '../lib/decimen/localDocTransfer'
import { ingestLocalTransferFile } from '../lib/localDocReceive'
import type { OpticalFile } from '../../vendor/decimen/shared/protocol'
import { putTransferredTag } from '../offline/transferredDb'
import {
  type QrDecodeResult,
} from '../lib/qrDecode'
import { useOnline } from '../composables/useOnline'
import TagQrScanner from '../components/TagQrScanner.vue'

const catalog = useCatalogStore()
const queue = useQueueStore()
const favorites = useFavoritesStore()
const userCollections = useUserCollectionsStore()
const recent = useRecentStore()
const offlineLib = useOfflineLibraryStore()
const prefs = usePreferencesStore()
const snackbar = useSnackbarStore()
const { offline } = useOnline()
const route = useRoute()
const router = useRouter()
const lyricsError = ref<string | null>(null)
const syncingRoute = ref(false)
const tipsOpen = ref(false)
const optionsOpen = ref(false)
const welcomeOpen = ref(false)
const qrScannerOpen = ref(false)

function closeWelcome(): void {
  prefs.dismissBrowseWelcome()
  welcomeOpen.value = false
  // First-run dismiss: keep search/filters in view under the dialog.
  scrollToSearchTop()
}

/** Document y=0 — search bar and filters visible (not sticky jump-rail floor). */
function scrollToSearchTop(): void {
  scrubScrollIndex.value = 0
  window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
  windowScrollY.value = 0
}

async function onWelcomeContinue(opts: { cacheSheets: boolean; cacheAudio: boolean }): Promise<void> {
  closeWelcome()
  if (opts.cacheSheets || opts.cacheAudio) {
    if (!offlineLib.loaded) await offlineLib.loadManifests()
  }
  if (opts.cacheSheets) {
    await offlineLib.dismissSheetsPrompt()
    void offlineLib.startPack('sheets')
  }
  if (opts.cacheAudio) {
    void offlineLib.startPack('audio', { partsMode: 'all' })
  }
}

const ftsPending = computed(() => catalog.filters.fullText && !catalog.lyricsLoaded)

watch(
  () => catalog.filters.fullText,
  (on) => {
    if (on) void onEnsureLyrics()
  },
)

function onLyricsChange(e: Event): void {
  if (catalog.lyricsLoading && !catalog.filters.fullText) return
  const on = (e.target as HTMLInputElement).checked
  if (on === catalog.filters.fullText) return
  catalog.patchFilters({ fullText: on })
}

function openSearchTips(): void {
  if (window.matchMedia('(hover: none)').matches) tipsOpen.value = true
}

function closeSearchTips(): void {
  tipsOpen.value = false
}

/** Open the fullscreen QR scanner (camera + choose-photo fallback). */
function onScanQrClick(): void {
  qrScannerOpen.value = true
}

function openTagFromQrPayload(payload: string): void {
  const loc = parseTagQrPayload(payload)
  if (!loc) {
    snackbar.show('That QR code is not a SingTags tag link.', { tone: 'error' })
    return
  }
  qrScannerOpen.value = false
  void router.push(loc)
}

function onSheetTransferProgress(label: string): void {
  snackbar.show(label, { tone: 'ok', ms: 2500 })
}

async function onSheetTransferComplete(file: OpticalFile): Promise<void> {
  try {
    if (isLocalDocTransferFile(file)) {
      await ingestLocalTransferFile(router, file)
      qrScannerOpen.value = false
      return
    }
    if (!isSingtagsSheetFile(file)) {
      throw new Error('Unsupported transfer file.')
    }
    const pkg = unpackSingtagsSheetFile(file)
    await putTransferredTag(pkg.meta, pkg.imageBytes)
    qrScannerOpen.value = false
    const title = pkg.meta.title || `Tag ${pkg.meta.id}`
    const openLabel = prefs.singMode ? 'Open fullscreen' : 'Open tag'
    snackbar.show(`Received “${title}”`, {
      tone: 'ok',
      ms: 8000,
      action: {
        label: openLabel,
        onClick: () => {
          void router.push(tagOpenLocation(pkg.meta.id, { fullscreen: prefs.singMode }))
        },
      },
    })
  } catch (e) {
    snackbar.show(e instanceof Error ? e.message : 'Could not receive sheet transfer.', {
      tone: 'error',
    })
  }
}

function onSheetTransferError(message: string): void {
  snackbar.show(message, { tone: 'error' })
}

async function onQrDetected(result: QrDecodeResult): Promise<void> {
  if (result.text) {
    openTagFromQrPayload(result.text)
    return
  }
  snackbar.show('That QR code is not a SingTags tag link.', { tone: 'error' })
}

function onQrScannerDetected(result: QrDecodeResult): void {
  void onQrDetected(result)
}

function onQrScannerError(message: string): void {
  snackbar.show(message, { tone: 'error' })
}

function markBrowseOpen(id: number): void {
  recent.markBrowseNavigation(id)
}

function browseAltTitle(tag: TagSummary): string | null {
  return visibleAltTitle(tag.altTitle, tag.title)
}

function applyRoute(): void {
  syncingRoute.value = true
  const sort = (
    typeof route.query.sort === 'string' ? route.query.sort : DEFAULT_BROWSE_SORT
  ) as SortMode
  catalog.syncFromRoute(route.query as Record<string, unknown>, sort)
  queueMicrotask(() => {
    syncingRoute.value = false
  })
}

watch(
  () => route.query,
  () => applyRoute(),
)

watch(
  () => [catalog.debouncedQuery, catalog.filters, catalog.sortMode, catalog.sortReverse] as const,
  () => {
    if (syncingRoute.value) return
    const patch = catalog.routeQueryPatch()
    router.replace({
      query: {
        ...Object.fromEntries(
          Object.entries({ ...route.query, ...patch }).filter(([, v]) => v != null && v !== ''),
        ),
      },
    })
  },
  { deep: true },
)

async function onEnsureLyrics(): Promise<void> {
  lyricsError.value = null
  try {
    await catalog.ensureLyrics()
    if (!catalog.lyricsLoaded) {
      lyricsError.value = 'Lyrics index could not be loaded. Title search still works.'
    }
  } catch (e) {
    lyricsError.value = e instanceof Error ? e.message : String(e)
  }
}

/** Tag metadata for queueing — Cache API, sheets pack, or favorites detail (`getStarred`, works offline). */
async function loadTagDetailForQueue(id: number): Promise<TagDetail | null> {
  try {
    const res = await fetchCached(tagDetailUrl(id))
    if (res.ok) return (await res.json()) as TagDetail
  } catch {
    /* try pack / favorites record */
  }
  try {
    const packed = await sheetsPack.get(tagDetailUrl(id))
    if (packed) return (await packed.json()) as TagDetail
  } catch {
    /* try favorites IndexedDB (`getStarred`) */
  }
  const starred = await getStarred(id)
  return starred?.detail ?? null
}

async function addSelectedToQueue(): Promise<void> {
  let ok = 0
  let skipped = 0
  for (const id of catalog.selectedIds) {
    const d = await loadTagDetailForQueue(id)
    if (!d) {
      skipped++
      continue
    }
    const title = d.title || `Tag ${d.tag_id}`
    const sheetItems = downloadableSheetAssets(d).map((s) => ({
      kind: 'sheet' as const,
      tagId: d.tag_id,
      title,
      part: s.id,
      path: s.path,
      label: s.label,
    }))
    const originals = catalogOriginalPaths(d)
    const parts = Object.keys(originals) as PartId[]
    const prefer = parts.filter((p) => p !== 'mix')
    const use = prefer.length ? prefer : parts
    const audioItems = use.map((part) => ({
      kind: 'audio' as const,
      tagId: d.tag_id,
      title,
      part,
      path: originals[part]!,
      label: partTrackLabel(part),
    }))
    if (!sheetItems.length && !audioItems.length) {
      skipped++
      continue
    }
    queue.addMany([...sheetItems, ...audioItems])
    ok++
  }
  const msg =
    skipped > 0
      ? offline.value
        ? `Queued files from ${ok} tag(s); ${skipped} skipped (not cached on device).`
        : `Queued files from ${ok} tag(s); skipped ${skipped}.`
      : ok
        ? `Queued sheets and tracks from ${ok} tag(s).`
        : offline.value
          ? 'No cached tag details — open tags online once, or reconnect.'
          : 'No files queued.'
  snackbar.show(msg, { tone: ok ? 'ok' : 'info' })
}

const collectionPickerOpen = ref(false)

const selectedTagIds = computed(() => [...catalog.selectedIds])

async function favoriteSelectedToCollection(_collectionId: string, collectionName: string): Promise<void> {
  const summaries = selectedTagIds.value
    .map((id) => catalog.getById(id))
    .filter((x): x is NonNullable<typeof x> => !!x)
  const favorited = summaries.length
    ? await favorites.starMany(summaries, { metadataOnly: false })
    : 0
  favorites.lastNotice = {
    type: 'text',
    message:
      favorited > 0
        ? `Favorited ${favorited} and added to “${collectionName}”`
        : `Added to “${collectionName}”`,
  }
  catalog.clearSelection()
  collectionPickerOpen.value = false
}

async function starSelected(): Promise<void> {
  const summaries = [...catalog.selectedIds]
    .map((id) => catalog.getById(id))
    .filter((t): t is NonNullable<typeof t> => !!t)
  void favorites.starMany(summaries, { metadataOnly: false })
}

function toggleRowStar(summary: TagSummary): void {
  void favorites.toggle(summary, null, { metadataOnly: false })
}

function onResultKey(e: KeyboardEvent, id: number): void {
  if (e.key === ' ' || e.key === 'x' || e.key === 'X') {
    e.preventDefault()
    const wasSelected = catalog.selectedIds.has(id)
    catalog.toggleSelect(id)
    // Narrow: Space entering selection also reveals the select column.
    if (!wasSelected) selectMode.value = true
  }
}

const sorts: Array<{ id: SortMode; label: string }> = [
  { id: 'rating', label: 'Rating' },
  { id: 'title', label: 'Title' },
  { id: 'year', label: 'Year' },
  { id: 'downloads', label: 'Downloads' },
  { id: 'id', label: 'Tag #' },
  { id: 'collection', label: 'Collection' },
]

/** Rating/Downloads only when the catalog is narrowed by search or filters. */
const scopedSortIds = new Set<SortMode>(['rating', 'downloads'])

const hasSearchOrFilter = computed(
  () => catalog.queryText.trim().length > 0 || catalog.filterCount > 0,
)

const availableSorts = computed(() =>
  sorts.filter((s) => !scopedSortIds.has(s.id) || hasSearchOrFilter.value),
)

watch(hasSearchOrFilter, (scoped) => {
  if (scoped) return
  if (scopedSortIds.has(catalog.sortMode)) catalog.sortMode = 'collection'
})

const optionsToggleTip = computed(() =>
  optionsOpen.value ? 'Hide search options' : 'Show search lyrics and filters',
)

const searchLyricsTip = computed(() => {
  if (catalog.filters.fullText) return 'Searching lyrics too — turn off to match titles and arrangers only'
  if (catalog.lyricsLoading) return 'Loading lyrics index…'
  return 'Also match words in tag lyrics (uses the lyrics index)'
})

function rowStarTip(tag: TagSummary): string {
  if (favorites.isTagCaching(tag.id)) {
    return favorites.tagCachingLabel(tag.id) || 'Caching for offline'
  }
  return favorites.isStarred(tag.id)
    ? 'Unfavorite — remove from saved tags'
    : 'Favorite — save for offline use'
}

function rowStarLabel(tag: TagSummary): string {
  if (favorites.isTagCaching(tag.id)) return 'Caching for offline'
  return favorites.isStarred(tag.id) ? 'Unfavorite' : 'Favorite'
}

function selectRowTip(tag: TagSummary): string {
  const name = tag.title || `Tag ${tag.id}`
  return catalog.selectedIds.has(tag.id)
    ? `Deselect ${name}`
    : `Select ${name} for bulk favorite or zip (Space while row is focused)`
}

function rowOpenTip(tag: TagSummary): string {
  const title = tag.title || `Tag ${tag.id}`
  const alt = browseAltTitle(tag)
  const base = alt ? `Open ${title} (${alt})` : `Open ${title}`
  return prefs.singMode ? `${base} — Sing mode (fullscreen sheet)` : base
}

function sortOptionTip(id: SortMode): string {
  const tips: Record<SortMode, string> = {
    rating: 'Group and order by highest rating first',
    title: 'Group and order alphabetically by title',
    year: 'Group and order by newest year first',
    downloads: 'Group and order by most downloads first',
    id: 'Group and order by tag number',
    collection: 'Group by collection (Classic, then 100 Days), then tag #',
  }
  const base = tips[id]
  return catalog.sortReverse ? `${base} (reversed)` : base
}

function sortReverseTip(): string {
  return catalog.sortReverse
    ? 'Reverse order is on — click for the default direction'
    : 'Reverse the current view order'
}

/**
 * Pin the first browse group under sticky jump/scrub chrome.
 * Do not scroll to document y=0 — that reveals search and unsticks the rail.
 * The ↑ control uses {@link onJumpTopClick} for the two-step (group → search).
 */
function scrollBrowseTop(): void {
  scrubScrollIndex.value = 0
  if (!browseRows.value.length) {
    window.scrollTo({ top: 0, behavior: 'auto' })
    return
  }
  // Instant: smooth scrolling raced with scrub-end cursor sync and felt broken.
  scrollToBrowseRow(0, 'start')
}

/** Document scroll Y — drives ↑ enabled/disabled and two-step jump-top. */
const windowScrollY = ref(typeof window !== 'undefined' ? window.scrollY : 0)

const DOC_TOP_EPS = 2
const BROWSE_FLOOR_EPS = 8

/** True when search/filters are fully in view (↑ should be disabled). */
const jumpTopDisabled = computed(() => windowScrollY.value <= DOC_TOP_EPS)

/**
 * True when the first group is pinned under sticky chrome (or between that and search).
 * Another ↑ click reveals search.
 */
const atBrowseChromeTop = computed(() => {
  const y = windowScrollY.value
  if (y <= DOC_TOP_EPS) return false
  const floor = Math.max(0, listScrollMargin.value - stickyBrowsePad.value)
  return y <= floor + BROWSE_FLOOR_EPS
})

/** ↑ tip: deeper → first group; at first group → search; at search → disabled. */
const jumpTopLabel = computed(() => {
  if (jumpTopDisabled.value) return 'Already at search'
  if (atBrowseChromeTop.value) return 'Back to search'
  if (catalog.sortMode === 'id') return 'Jump to top'
  if (showScrub.value) return 'Jump to newest'
  return 'Jump to first section'
})

/**
 * ↑: from deep list → first group under chrome; from first group → search; at search → no-op.
 */
function onJumpTopClick(): void {
  windowScrollY.value = window.scrollY
  if (jumpTopDisabled.value) return
  if (atBrowseChromeTop.value) {
    scrubScrollIndex.value = 0
    window.scrollTo({ top: 0, behavior: 'auto' })
    windowScrollY.value = 0
    return
  }
  scrollBrowseTop()
  // Virtualizer scroll may settle a frame later — refresh ↑ state for the second step.
  windowScrollY.value = window.scrollY
  requestAnimationFrame(() => {
    windowScrollY.value = window.scrollY
  })
}

const showJump = computed(
  () => hasJumpRail(catalog.sortMode) && catalog.browseWindow.jumpKeys.length >= 1,
)
/** Letter/booklet keys only — ↑ sits outside the key grid like year scrub. */
const jumpKeyCount = computed(() => catalog.browseWindow.jumpKeys.length)

const collectionJumpKeys = computed(() =>
  catalog.sortMode === 'collection' ? catalog.browseWindow.jumpKeys : [],
)

const collectionStripHost = ref<HTMLElement | null>(null)
const collectionMeasureEl = ref<HTMLElement | null>(null)

const {
  page: collectionJumpPage,
  showPager: showCollectionJumpPager,
  pageCount: collectionJumpPageCount,
  pagedItems: pagedCollectionJumpKeys,
  stripRows: collectionStripRows,
} = useTwoRowStripPaging(collectionJumpKeys, {
  hostEl: collectionStripHost,
  measureEl: collectionMeasureEl,
})

/** One filtered section: show ↑ + status text, not a lone category chip. */
const singleJumpGroup = computed(() => jumpKeyCount.value === 1)

const jumpRailStatus = computed(() => {
  const n = catalog.allResults.length
  return n === 1 ? 'Showing 1 result' : `Showing ${n} results`
})

const jumpRailEl = ref<HTMLElement | null>(null)
const jumpCols = ref(9)
/** Tracks 2 vs 3 row layout for sticky scroll-margin height. */
const jumpRows = ref(3)
let jumpRailRo: ResizeObserver | null = null

function syncJumpCols(): void {
  const n = jumpKeyCount.value
  if (n < 1) return
  if (catalog.sortMode === 'collection') {
    jumpRows.value = collectionStripRows.value
    return
  }
  // Single filtered group: one compact row beside ↑.
  if (n === 1) {
    jumpRows.value = 1
    jumpCols.value = n
    return
  }
  const w = jumpRailEl.value?.clientWidth ?? (typeof window !== 'undefined' ? window.innerWidth : 800)
  const rows = w < 640 ? 3 : 2
  jumpRows.value = rows
  jumpCols.value = Math.max(1, Math.ceil(n / rows))
}

const jumpKeysStyle = computed(() => {
  if (catalog.sortMode === 'collection') return undefined
  return {
    gridTemplateColumns: `repeat(${jumpCols.value}, minmax(0, 1fr))`,
  }
})

const showScrub = computed(
  () => hasScrubRail(catalog.sortMode) && catalog.allResults.length >= 1,
)

/** Full browse rows (sections + tags) — window-virtualized below. */
const browseRows = computed(() => catalog.browseWindow.rows)
const listEl = ref<HTMLElement | null>(null)
const listScrollMargin = ref(0)

function syncListScrollMargin(): void {
  listScrollMargin.value = listEl.value?.offsetTop ?? 0
}

/**
 * Space taken by sticky browse chrome (header + jump/scrub rail).
 * Used as virtualizer scrollPaddingStart so align:"start" lands just under the rail.
 */
function stickyBrowsePadPx(): number {
  const rail =
    showJump.value && jumpRailEl.value
      ? jumpRailEl.value
      : showScrub.value
        ? (document.querySelector('.scrub-rail') as HTMLElement | null)
        : null
  if (rail) {
    // `top` resolves to px for position:sticky — pad = stuck offset + rail height.
    const stickyTop = Number.parseFloat(getComputedStyle(rail).top) || 0
    return Math.ceil(stickyTop + rail.offsetHeight)
  }
  // No jump/scrub rail (e.g. filtered to one group) — still clear the fixed header.
  const home = document.querySelector('.home') as HTMLElement | null
  const offsetRaw = home ? getComputedStyle(home).getPropertyValue('--jump-rail-offset') : ''
  const headerPad = Number.parseFloat(offsetRaw)
  if (Number.isFinite(headerPad) && headerPad > 0) return Math.ceil(headerPad)
  const rootH = Number.parseFloat(
    getComputedStyle(document.documentElement).getPropertyValue('--header-h'),
  )
  return Math.ceil(Number.isFinite(rootH) && rootH > 0 ? rootH : 56)
}

const stickyBrowsePad = ref(0)

function syncStickyBrowsePad(): void {
  stickyBrowsePad.value = stickyBrowsePadPx()
}

/** Extra rows while scrubbing so mid-drag jumps stay filled longer. */
const BROWSE_OVERSCAN = 14
const BROWSE_SCRUB_OVERSCAN = 48
const SCRUB_GHOST_SECTION_H = 48
const SCRUB_GHOST_TAG_H = 72

/** True while year/tag# scrub is driving the list — drives overscan + ghost layer. */
const scrubbing = ref(false)

const rowVirtualizer = useWindowVirtualizer(
  computed(() => ({
    count: browseRows.value.length,
    estimateSize: (index: number) =>
      browseRows.value[index]?.type === 'section' ? 48 : 72,
    overscan: scrubbing.value ? BROWSE_SCRUB_OVERSCAN : BROWSE_OVERSCAN,
    scrollMargin: listScrollMargin.value,
    scrollPaddingStart: stickyBrowsePad.value,
  })),
)

const virtualBrowseRows = computed(() => rowVirtualizer.value.getVirtualItems())
const browseListHeight = computed(() => rowVirtualizer.value.getTotalSize())

/** Pair each virtual slot with its browse row (templates can't use TS assertions). */
const virtualBrowseItems = computed(() => {
  const rows = browseRows.value
  return virtualBrowseRows.value.flatMap((v) => {
    const row = rows[v.index]
    return row ? [{ v, row }] : []
  })
})

function measureBrowseRow(el: unknown): void {
  const node =
    el instanceof HTMLElement
      ? el
      : el &&
          typeof el === 'object' &&
          '$el' in el &&
          (el as { $el: unknown }).$el instanceof HTMLElement
        ? (el as { $el: HTMLElement }).$el
        : null
  if (node) rowVirtualizer.value.measureElement(node)
}

function browseRowIndexForTagIndex(tagIndex: number): number {
  return browseRows.value.findIndex((r) => r.type === 'tag' && r.index === tagIndex)
}

function browseRowIndexForSection(key: string): number {
  return browseRows.value.findIndex((r) => r.type === 'section' && r.key === key)
}

/** Min window.scrollY where sticky jump/scrub chrome stays stuck (search stays off-screen). */
function browseScrollFloorY(): number {
  return Math.max(0, listScrollMargin.value - stickyBrowsePad.value)
}

/** After programmatic list scrolls, never leave the rail unstuck above search. */
function clampBrowseScrollFloor(): void {
  const floor = browseScrollFloorY()
  if (window.scrollY < floor) {
    window.scrollTo({ top: floor, behavior: 'auto' })
  }
  windowScrollY.value = window.scrollY
}

function scrollToBrowseRow(rowIndex: number, align: 'start' | 'center' | 'end' | 'auto' = 'start'): void {
  if (rowIndex < 0) return
  syncListScrollMargin()
  syncStickyBrowsePad()
  rowVirtualizer.value.scrollToIndex(rowIndex, { align })
  // Center-align near the top can request scrollY below the sticky threshold.
  clampBrowseScrollFloor()
}


/** Narrow browse: hide persistent select column until long-press / selection. */
const NARROW_SELECT_MQ = '(max-width: 639px)'
const LONG_PRESS_MS = 450
const LONG_PRESS_MOVE_PX = 10
const isNarrow = ref(false)
const selectMode = ref(false)
let narrowMq: MediaQueryList | null = null

const showRowSelect = computed(
  () => selectMode.value || catalog.selectedIds.size > 0 || !isNarrow.value,
)

function syncNarrowSelect(): void {
  isNarrow.value = narrowMq?.matches ?? false
}

watch(
  () => catalog.selectedIds.size,
  (n) => {
    if (n === 0) selectMode.value = false
  },
)

let longPressTimer: ReturnType<typeof setTimeout> | null = null
let longPressId: number | null = null
let longPressX = 0
let longPressY = 0
let suppressRowClick = false

function clearLongPressTimer(): void {
  if (longPressTimer != null) {
    clearTimeout(longPressTimer)
    longPressTimer = null
  }
  longPressId = null
}

function onRowPointerDown(e: PointerEvent, id: number): void {
  if (!isNarrow.value || showRowSelect.value) return
  if (e.button !== 0) return
  const t = e.target as HTMLElement | null
  if (t?.closest('.sel-btn, .row-fav')) return
  clearLongPressTimer()
  longPressX = e.clientX
  longPressY = e.clientY
  longPressId = id
  longPressTimer = setTimeout(() => {
    longPressTimer = null
    const tagId = longPressId
    longPressId = null
    if (tagId == null) return
    selectMode.value = true
    if (!catalog.selectedIds.has(tagId)) catalog.toggleSelect(tagId)
    suppressRowClick = true
    try {
      navigator.vibrate?.(10)
    } catch {
      /* ignore */
    }
  }, LONG_PRESS_MS)
}

function onRowPointerMove(e: PointerEvent): void {
  if (longPressTimer == null) return
  if (
    Math.abs(e.clientX - longPressX) > LONG_PRESS_MOVE_PX ||
    Math.abs(e.clientY - longPressY) > LONG_PRESS_MOVE_PX
  ) {
    clearLongPressTimer()
  }
}

function onRowPointerEnd(): void {
  clearLongPressTimer()
}

function onRowClickCapture(e: MouseEvent): void {
  if (!suppressRowClick) return
  e.preventDefault()
  e.stopPropagation()
  suppressRowClick = false
}

function onRowContextMenu(e: Event): void {
  if (isNarrow.value && (selectMode.value || suppressRowClick)) e.preventDefault()
}

/** Browse index nearest the reading focus — drives the scrub cursor while scrolling. */
const scrubScrollIndex = ref(0)
let scrubScrollRaf = 0

function browseFocusY(): number {
  const rail = document.querySelector('.scrub-rail') as HTMLElement | null
  if (rail) {
    const r = rail.getBoundingClientRect()
    return Math.min(window.innerHeight - 48, Math.max(96, r.bottom + 28))
  }
  return Math.min(220, window.innerHeight * 0.32)
}

function syncScrubFromScroll(): void {
  if (!showScrub.value) return
  const nodes = document.querySelectorAll<HTMLElement>('[data-browse-index]')
  if (!nodes.length) return
  const y = browseFocusY()
  let bestIdx = scrubScrollIndex.value
  let bestDist = Infinity
  for (const el of nodes) {
    const raw = el.getAttribute('data-browse-index')
    if (raw == null) continue
    const idx = Number(raw)
    if (!Number.isFinite(idx)) continue
    const rect = el.getBoundingClientRect()
    const mid = (rect.top + rect.bottom) / 2
    const dist =
      rect.bottom < y - 8
        ? y - rect.bottom
        : rect.top > y + 8
          ? rect.top - y
          : Math.abs(mid - y) * 0.25
    if (dist < bestDist) {
      bestDist = dist
      bestIdx = idx
    }
  }
  scrubScrollIndex.value = bestIdx
}

function onBrowseScroll(): void {
  windowScrollY.value = window.scrollY
  if (scrubbing.value) return
  if (scrubScrollRaf) return
  scrubScrollRaf = requestAnimationFrame(() => {
    scrubScrollRaf = 0
    if (scrubbing.value) return
    syncScrubFromScroll()
  })
}

type ScrubGhostItem = {
  key: string
  row: BrowseRow
  focus: boolean
}

/**
 * Full-format rows in normal document flow while scrubbing (same spacing/radius as
 * the real list). Absolute 72px packing overlapped real row heights and hid gaps.
 */
const scrubGhostItems = computed((): ScrubGhostItem[] => {
  if (!scrubbing.value || !showScrub.value) return []
  const rows = browseRows.value
  if (!rows.length) return []
  let focus = browseRowIndexForTagIndex(scrubScrollIndex.value)
  if (focus < 0) focus = Math.min(rows.length - 1, Math.max(0, scrubScrollIndex.value))
  if (!rows[focus]) return []

  const bottomNav =
    typeof window !== 'undefined'
      ? Number.parseFloat(
          getComputedStyle(document.documentElement).getPropertyValue('--bottom-nav-h'),
        ) || 60
      : 60
  const viewH =
    typeof window !== 'undefined'
      ? Math.max(240, window.innerHeight - stickyBrowsePad.value - bottomNav)
      : 480

  // How many rows to cover the viewport (estimates only size the window, not gaps).
  let before = 0
  let used = 0
  for (let i = focus - 1; i >= 0 && used < viewH; i--) {
    used += rows[i]!.type === 'section' ? SCRUB_GHOST_SECTION_H : SCRUB_GHOST_TAG_H
    before++
  }
  const start = focus - before
  const out: ScrubGhostItem[] = []
  let afterUsed = 0
  for (let i = start; i < rows.length; i++) {
    const row = rows[i]!
    const key = row.type === 'section' ? `g-s-${row.key}-${i}` : `g-t-${row.tag.id}-${i}`
    out.push({ key, row, focus: i === focus })
    if (i > focus) {
      afterUsed += row.type === 'section' ? SCRUB_GHOST_SECTION_H : SCRUB_GHOST_TAG_H
      if (afterUsed > viewH) break
    }
  }
  return out
})

/** Rough offset so the focused ghost row sits near mid-viewport. */
const scrubGhostShiftY = computed(() => {
  const items = scrubGhostItems.value
  if (!items.length) return 0
  const bottomNav =
    typeof window !== 'undefined'
      ? Number.parseFloat(
          getComputedStyle(document.documentElement).getPropertyValue('--bottom-nav-h'),
        ) || 60
      : 60
  const viewH =
    typeof window !== 'undefined'
      ? Math.max(240, window.innerHeight - stickyBrowsePad.value - bottomNav)
      : 480
  let before = 0
  let focusH = SCRUB_GHOST_TAG_H
  for (const item of items) {
    const h = item.row.type === 'section' ? SCRUB_GHOST_SECTION_H : SCRUB_GHOST_TAG_H
    if (item.focus) {
      focusH = h
      break
    }
    before += h
  }
  return viewH / 2 - before - focusH / 2
})

/** Year scrub: newest-first → reverse axis. Tag #: ascending → normal axis. */
const scrubReverseAxis = computed(() => {
  if (catalog.sortMode === 'year') return !catalog.sortReverse
  if (catalog.sortMode === 'id') return catalog.sortReverse
  return false
})

/** Tag # uses equal-width 100s bins; year keeps density-softened spacing. */
const scrubAxisBlend = computed(() => (catalog.sortMode === 'id' ? 1 : DEFAULT_AXIS_BLEND))

const scrubAriaLabel = computed(() =>
  catalog.sortMode === 'id' ? 'Scrub by tag number' : 'Scrub by year',
)

function scrubLabelAtIndex(index: number): string {
  const tag = catalog.allResults[index]
  if (!tag) return ''
  if (catalog.sortMode === 'id') return tagIdHundredKey(tag.id)
  return yearSectionKey(normalizeYear(tag.year))
}

function scrubValueAtIndex(index: number): number {
  return catalog.allResults[index]?.id ?? 0
}

function onScrub(index: number): void {
  scrubbing.value = true
  const idx = catalog.revealIndex(index)
  if (idx < 0) return
  scrubScrollIndex.value = idx
  if (idx === 0) {
    scrollBrowseTop()
    return
  }
  scrollToBrowseRow(browseRowIndexForTagIndex(idx), 'center')
}

function onScrubEnd(): void {
  scrubbing.value = false
  // Do not sync from scroll immediately: the list may still be at the pre-jump
  // offset for a frame (and used to snap the ↑ jump right back). Keep the last
  // scrubbed index; the next user scroll will re-sync if needed.
}

function jumpSectionTip(key: string): string {
  const row = catalog.browseWindow.rows.find((r) => r.type === 'section' && r.key === key)
  return row?.type === 'section' ? `Jump to ${row.label}` : `Jump to ${key}`
}
function jumpKeyLabel(key: string): string {
  if (catalog.sortMode === 'collection') {
    return collectionJumpLabel(key, userCollections.collections)
  }
  const row = catalog.browseWindow.rows.find((r) => r.type === 'section' && r.key === key)
  return row?.type === 'section' ? row.label : key
}

function isCustomJumpKey(key: string): boolean {
  return isUserCollectionFilterId(key)
}



/** Whether this section can map onto a catalog filter. */
function canFilterSection(key: string): boolean {
  const mode = catalog.sortMode
  if (mode === 'title') return true
  if (mode === 'year') return yearBoundsForSectionKey(key) != null
  if (mode === 'collection') {
    return collectionIdForSectionKey(key, catalog.collections) != null
  }
  return false
}

function isSectionFilterActive(key: string): boolean {
  const mode = catalog.sortMode
  const f = catalog.filters
  if (mode === 'title') return f.titleLetters.includes(key)
  if (mode === 'year') {
    const bounds = yearBoundsForSectionKey(key)
    if (!bounds) return false
    return f.yearMin === bounds.yearMin && f.yearMax === bounds.yearMax
  }
  if (mode === 'collection') {
    const id = collectionIdForSectionKey(key, catalog.collections)
    return id != null && f.collections.includes(id)
  }
  return false
}

function sectionFilterTip(key: string, label: string): string {
  return isSectionFilterActive(key) ? `Remove filter: ${label}` : `Filter to ${label}`
}

/** After filtering to a section, reset scroll and pin that heading under sticky chrome. */
async function scrollToFilteredSection(key: string): Promise<void> {
  scrollBrowseTop()
  syncListScrollMargin()
  syncStickyBrowsePad()

  // Filter rebuilds section rows asynchronously — retry until the target header exists.
  for (let attempt = 0; attempt < 8; attempt++) {
    await nextTick()
    const rowIndex = browseRowIndexForSection(key)
    if (rowIndex >= 0) {
      scrollToBrowseRow(rowIndex, 'start')
      requestAnimationFrame(() => {
        syncListScrollMargin()
        syncStickyBrowsePad()
        const again = browseRowIndexForSection(key)
        if (again >= 0) scrollToBrowseRow(again, 'start')
      })
      return
    }
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
  }
  scrollBrowseTop()
}

function toggleSectionFilter(key: string): void {
  const mode = catalog.sortMode
  const wasActive = isSectionFilterActive(key)

  if (mode === 'title') {
    const cur = catalog.filters.titleLetters
    const next = wasActive ? cur.filter((x) => x !== key) : [...cur, key]
    catalog.patchFilters({ titleLetters: next })
  } else if (mode === 'year') {
    const bounds = yearBoundsForSectionKey(key)
    if (!bounds) return
    if (wasActive) {
      catalog.patchFilters({ yearMin: null, yearMax: null })
    } else {
      catalog.patchFilters({ yearMin: bounds.yearMin, yearMax: bounds.yearMax })
    }
  } else if (mode === 'collection') {
    const id = collectionIdForSectionKey(key, catalog.collections)
    if (!id) return
    const cur = catalog.filters.collections
    let next: string[]
    if (wasActive) {
      next = cur.filter((x) => x !== id)
    } else if (isUserCollectionFilterId(id)) {
      // Custom collection filter only — tags may still appear under catalog headers below.
      next = [id]
    } else {
      next = [...cur.filter((x) => !isUserCollectionFilterId(x)), id]
    }
    catalog.patchFilters({ collections: next })
  } else {
    return
  }

  // Activating: jump to the sole/filtered group under the chrome.
  // Clearing: reset to top so the restored long list isn't mid-void.
  if (!wasActive) void scrollToFilteredSection(key)
  else scrollBrowseTop()
}

async function jumpToSection(key: string): Promise<void> {
  catalog.revealSection(key)
  syncStickyBrowsePad()
  await nextTick()
  const rowIndex = browseRowIndexForSection(key)
  scrollToBrowseRow(rowIndex, 'start')
  // Re-align after the section row measures — first pass may use the estimate.
  await nextTick()
  syncStickyBrowsePad()
  requestAnimationFrame(() => {
    scrollToBrowseRow(rowIndex, 'start')
  })
}

/** Enter: `n123` → Tag #; `c99` / bare digits → classic or tag when unique. */
function submitSearch(e?: Event): void {
  if (e) e.preventDefault()
  const q = catalog.queryText
  const tagNum = parseTagNumberQuery(q)
  if (tagNum != null && catalog.getById(tagNum)) {
    void router.push(`/tag/${tagNum}`)
    return
  }
  const classicNum = parseClassicNumberQuery(q)
  if (classicNum != null) {
    const hits = catalog.tags.filter(
      (t) => t.collection?.toLowerCase() === 'classic' && Number(t.classic) === classicNum,
    )
    if (hits.length === 1) {
      void router.push(`/tag/${hits[0]!.id}`)
    }
    return
  }
  const daysNum = parse100DaysNumberQuery(q)
  if (daysNum != null) {
    const hits = catalog.tags.filter(
      (t) => t.collection === '100' && Number(t.classic) === daysNum,
    )
    if (hits.length === 1) {
      void router.push(`/tag/${hits[0]!.id}`)
    }
    return
  }
  const id = parseExactTagIdQuery(q)
  if (id != null && catalog.getById(id)) {
    void router.push(`/tag/${id}`)
  }
}

function onSearchKeydown(e: KeyboardEvent): void {
  if (e.key !== 'Enter') return
  submitSearch(e)
}

/**
 * After Back from a tag: pin the opened row (virtualizer) or fall back to saved Y.
 * Raw window.scrollTo alone often no-ops while the list height is still estimating.
 */
function restoreBrowseScrollFromTag(): void {
  const tagId = peekTagReturnOrigin()?.tagId
  const y = peekTagReturnScrollY()
  if (tagId != null) {
    const rowIndex = browseRows.value.findIndex(
      (r) => r.type === 'tag' && r.tag.id === tagId,
    )
    if (rowIndex >= 0) {
      consumeTagReturnScrollY()
      const pin = () => scrollToBrowseRow(rowIndex, 'start')
      pin()
      requestAnimationFrame(() => {
        pin()
        requestAnimationFrame(pin)
      })
      window.setTimeout(pin, 50)
      window.setTimeout(pin, 200)
      window.setTimeout(pin, 500)
      return
    }
  }
  if (y != null) applyTagReturnScrollIfAny()
}

onMounted(async () => {
  void offlineLib.refreshCacheReady().catch(() => undefined)
  await Promise.all([catalog.load(), favorites.ensureLoaded()])
  applyRoute()
  if (!prefs.browseWelcomeDismissed) welcomeOpen.value = true
  await nextTick()
  syncListScrollMargin()
  syncStickyBrowsePad()
  syncScrubFromScroll()
  syncJumpCols()
  // Fresh Browse entry (app open, home nav, reload): land on search.
  // Back-from-tag: keep / re-apply click position (virtualizer needs post-load height).
  if (browseScrollIntent !== 'restore') {
    scrollToSearchTop()
    requestAnimationFrame(() => {
      scrollToSearchTop()
    })
  } else {
    restoreBrowseScrollFromTag()
  }
  windowScrollY.value = window.scrollY
  window.addEventListener('scroll', onBrowseScroll, { passive: true })
  jumpRailRo = new ResizeObserver(() => {
    syncJumpCols()
    syncListScrollMargin()
    syncStickyBrowsePad()
  })
  if (jumpRailEl.value) jumpRailRo.observe(jumpRailEl.value)
  if (listEl.value) jumpRailRo.observe(listEl.value)
  narrowMq = window.matchMedia(NARROW_SELECT_MQ)
  syncNarrowSelect()
  narrowMq.addEventListener('change', syncNarrowSelect)
})

onUnmounted(() => {
  jumpRailRo?.disconnect()
  jumpRailRo = null
  narrowMq?.removeEventListener('change', syncNarrowSelect)
  narrowMq = null
  clearLongPressTimer()
  window.removeEventListener('scroll', onBrowseScroll)
  if (scrubScrollRaf) cancelAnimationFrame(scrubScrollRaf)
})

watch(collectionStripRows, () => {
  if (catalog.sortMode !== 'collection') return
  syncJumpCols()
  syncStickyBrowsePad()
})

watch(
  () => [showJump.value, jumpKeyCount.value, catalog.sortMode, browseRows.value.length] as const,
  async () => {
    await nextTick()
    syncJumpCols()
    syncListScrollMargin()
    syncStickyBrowsePad()
    if (jumpRailRo && jumpRailEl.value) {
      jumpRailRo.disconnect()
      jumpRailRo.observe(jumpRailEl.value)
      if (listEl.value) jumpRailRo.observe(listEl.value)
    }
  },
)

watch(
  () => [showScrub.value, catalog.allResults.length, catalog.browseWindow.rows.length] as const,
  async () => {
    await nextTick()
    syncScrubFromScroll()
  },
)
</script>

<template>
  <section
    class="home"
    :class="{
      'has-selection': catalog.selectedIds.size,
      'jump-rows-2': showJump && jumpRows === 2,
      'jump-rows-1': showJump && jumpRows === 1,
    }"
  >
    <div class="search-toolbar">
      <div class="searchrow">
        <div class="search-field">
          <input
            v-model="catalog.queryText"
            type="search"
            enterkeyhint="search"
            autocomplete="off"
            autocorrect="off"
            spellcheck="false"
            placeholder="Search titles, arrangers, or n123…"
            aria-label="Search tags"
            title="Search titles and arrangers. Enter n123 for Tag #123, c45 for Classic #45, p12 for 100 Days #12."
            @keydown="onSearchKeydown"
          />
          <div class="search-infield">
            <button
              v-if="catalog.queryText"
              type="button"
              class="icon-btn clear-infield"
              aria-label="Clear search"
              title="Clear search"
              @click="catalog.queryText = ''"
            >
              ✕
            </button>
            <button
              type="button"
              class="icon-btn scan-qr-btn"
              aria-label="Scan SingTags QR code"
              title="Scan a SingTags QR code to open a tag"
              @click="onScanQrClick"
            >
              <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M4 8h3l1.5-2h7L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z" />
                <circle cx="12" cy="13" r="3.25" />
              </svg>
            </button>
            <div class="tips-wrap">
              <button
                type="button"
                class="icon-btn tips-btn"
                aria-label="Search tips"
                aria-describedby="search-tips-popover"
                title="Search tips — n123, c45, quotes, exclusions"
                @click="openSearchTips"
              >
                i
              </button>
              <div id="search-tips-popover" class="tips-popover" role="tooltip">
                <p>
                  Enter on <code>n123</code> opens Tag #123; <code>c45</code> Classic #45; <code>p12</code> 100 Days #12. Exclude with
                  <code>-word</code>; quotes for an exact phrase.
                </p>
              </div>
            </div>
          </div>
        </div>
        <button
          type="button"
          class="options-btn"
          :class="{ open: optionsOpen }"
          :aria-expanded="optionsOpen"
          aria-controls="browse-options"
          :aria-label="optionsToggleTip"
          :title="optionsToggleTip"
          @click="optionsOpen = !optionsOpen"
        >
          <svg
            class="options-icon"
            viewBox="0 0 24 24"
            width="22"
            height="22"
            aria-hidden="true"
          >
            <circle cx="12" cy="5" r="2" fill="currentColor" />
            <circle cx="12" cy="12" r="2" fill="currentColor" />
            <circle cx="12" cy="19" r="2" fill="currentColor" />
          </svg>
        </button>
      </div>
      <div v-show="optionsOpen" id="browse-options" class="options-panel">
        <div class="options-setting">
          <label
            class="setting-row"
            :class="{ on: catalog.filters.fullText, disabled: catalog.lyricsLoading && !catalog.filters.fullText }"
            :title="searchLyricsTip"
          >
            <span class="setting-copy">
              <span class="setting-title">Search lyrics</span>
              <span class="setting-desc">Match words in lyrics, not just titles</span>
            </span>
            <input
              type="checkbox"
              class="setting-switch"
              role="switch"
              :checked="catalog.filters.fullText"
              :disabled="catalog.lyricsLoading && !catalog.filters.fullText"
              :aria-checked="catalog.filters.fullText"
              :aria-label="
                catalog.lyricsLoading && !catalog.filters.fullText
                  ? 'Search lyrics (loading…)'
                  : 'Search lyrics'
              "
              @change="onLyricsChange"
            />
          </label>
        </div>
        <div class="options-filters">
          <p class="filters-heading">Filters</p>
          <SearchChips
            :open="optionsOpen"
            :filters="catalog.filters"
            :years="catalog.years"
            :arrangers="catalog.arrangers"
            :types="catalog.types"
            :collections="catalog.collections"
            :user-collections="userCollections.collections"
            @patch="catalog.patchFilters($event)"
            @clear="catalog.clearFilters()"
          />
        </div>
      </div>
    </div>
    <FilterSheet :open="tipsOpen" title="Search tips" @close="closeSearchTips">
      <p class="search-hint">
        Enter on <code>n123</code> opens Tag #123; <code>c45</code> Classic #45; <code>p12</code> 100 Days #12. Exclude with
        <code>-word</code>; quotes for an exact phrase.
      </p>
    </FilterSheet>
    <TagQrScanner
      :open="qrScannerOpen"
      @close="qrScannerOpen = false"
      @detected="onQrScannerDetected"
      @error="onQrScannerError"
      @sheet-transfer-progress="onSheetTransferProgress"
      @sheet-transfer-complete="onSheetTransferComplete"
      @sheet-transfer-error="onSheetTransferError"
    />
    <BrowseWelcomeDialog
      :open="welcomeOpen"
      @close="closeWelcome"
      @continue="onWelcomeContinue"
    />
    <p v-if="ftsPending" class="warn" role="status">
      Search lyrics is on — matching titles until the lyrics index finishes loading.
    </p>
    <p v-if="lyricsError" class="warn" role="alert">{{ lyricsError }}</p>

    <p v-if="catalog.loading || (!catalog.loaded && !catalog.error)" class="text-muted" role="status">
      Loading catalog…
    </p>
    <EmptyState
      v-else-if="catalog.error"
      :title="offline ? 'Offline — nothing cached yet' : 'Catalog failed to load'"
      :message="
        offline
          ? 'Connect once to download the full catalog, or receive Local Library songs and files from another device with optical transfer.'
          : catalog.error
      "
      tone="danger"
    >
      <OfflineOpticalTransferPrompt v-if="offline && prefs.opticalTransferEnabled" />
    </EmptyState>
    <template v-else>
      <div class="results-meta" aria-live="polite">
        <div class="text-muted count">
          <template v-if="!catalog.queryText.trim() && !catalog.filterCount">
            {{ catalog.tags.length }} tags in catalog
          </template>
          <template v-else>
            Matched {{ catalog.allResults.length }} of {{ catalog.tags.length }}
            <button
              v-if="catalog.filterCount"
              type="button"
              class="clear-filters"
              :aria-label="`Clear ${catalog.filterCount} filter${catalog.filterCount === 1 ? '' : 's'}`"
              :title="`Clear ${catalog.filterCount} filter${catalog.filterCount === 1 ? '' : 's'}`"
              @click="catalog.clearFilters()"
            >
              · {{ catalog.filterCount }} filter{{ catalog.filterCount === 1 ? '' : 's' }}
              <span aria-hidden="true">✕</span>
            </button>
          </template>
        </div>
        <div class="sort-controls">
          <label class="sort-field" title="Choose how matching tags are grouped and ordered">
            <span class="sort-lbl">View by</span>
            <select
              v-model="catalog.sortMode"
              aria-label="View results by"
              @change="($event.target as HTMLSelectElement).blur()"
            >
              <option v-for="s in availableSorts" :key="s.id" :value="s.id" :title="sortOptionTip(s.id)">
                {{ s.label }}
              </option>
            </select>
          </label>
          <button
            type="button"
            class="sort-rev"
            :class="{ on: catalog.sortReverse }"
            :aria-pressed="catalog.sortReverse"
            :title="sortReverseTip()"
            aria-label="Reverse view order"
            @click="catalog.toggleSortReverse()"
          >
            ⇅
          </button>
        </div>
      </div>

      <nav
        v-if="showJump"
        ref="jumpRailEl"
        class="jump-rail"
        :class="{ 'jump-rail-fit': catalog.sortMode === 'collection' }"
        aria-label="Jump to section"
      >
        <button
          type="button"
          class="jump jump-top"
          :disabled="jumpTopDisabled"
          :title="jumpTopLabel"
          :aria-label="jumpTopLabel"
          @click="onJumpTopClick"
        >
          ↑
        </button>
        <p v-if="singleJumpGroup" class="jump-rail-status" role="status">
          {{ jumpRailStatus }}
        </p>
        <div
          v-else-if="catalog.sortMode === 'collection'"
          class="collection-strip"
          :class="{ paged: showCollectionJumpPager }"
          role="group"
          :aria-label="
            showCollectionJumpPager
              ? `Collection page ${collectionJumpPage + 1} of ${collectionJumpPageCount}`
              : 'Collections'
          "
        >
          <button
            v-if="showCollectionJumpPager"
            type="button"
            class="collection-strip-nav"
            :disabled="collectionJumpPage <= 0"
            aria-label="Previous collections"
            @click="collectionJumpPage -= 1"
          >
            <span aria-hidden="true">‹</span>
          </button>
          <div ref="collectionStripHost" class="collection-strip-body">
            <div ref="collectionMeasureEl" class="collection-measure" aria-hidden="true">
              <span
                v-for="key in collectionJumpKeys"
                :key="key"
                class="jump"
                :class="{ custom: isCustomJumpKey(key) }"
              >
                <CustomCollectionMark v-if="isCustomJumpKey(key)" />
                {{ jumpKeyLabel(key) }}
              </span>
            </div>
            <div class="collection-page jump-keys-collection">
              <button
                v-for="key in pagedCollectionJumpKeys"
                :key="key"
                type="button"
                class="jump"
                :class="{ custom: isCustomJumpKey(key) }"
                :title="jumpSectionTip(key)"
                @click="jumpToSection(key)"
              >
                <CustomCollectionMark v-if="isCustomJumpKey(key)" />
                {{ jumpKeyLabel(key) }}
              </button>
            </div>
          </div>
          <button
            v-if="showCollectionJumpPager"
            type="button"
            class="collection-strip-nav"
            :disabled="collectionJumpPage >= collectionJumpPageCount - 1"
            aria-label="Next collections"
            @click="collectionJumpPage += 1"
          >
            <span aria-hidden="true">›</span>
          </button>
        </div>
        <div v-else class="jump-keys" :style="jumpKeysStyle">
          <button
            v-for="key in catalog.browseWindow.jumpKeys"
            :key="key"
            type="button"
            class="jump"
            :class="{ custom: isCustomJumpKey(key) }"
            :title="jumpSectionTip(key)"
            @click="jumpToSection(key)"
          >
            <CustomCollectionMark v-if="isCustomJumpKey(key)" />
            {{ jumpKeyLabel(key) }}
          </button>
        </div>
      </nav>

      <div
        v-if="showScrub"
        class="scrub-rail"
        :aria-label="scrubAriaLabel"
      >
        <ScrubRail
          :length="catalog.allResults.length"
          :label-at-index="scrubLabelAtIndex"
          :active-index="scrubScrollIndex"
          :reverse-axis="scrubReverseAxis"
          :axis-blend="scrubAxisBlend"
          :aria-label="scrubAriaLabel"
          :jump-top-label="jumpTopLabel"
          :jump-top-disabled="jumpTopDisabled"
          :dense-loupe-ticks="catalog.sortMode === 'id'"
          :value-at-index="scrubValueAtIndex"
          :tick-at-start="catalog.sortMode === 'id'"
          @scrub="onScrub"
          @scrub-end="onScrubEnd"
          @jump-top="onJumpTopClick"
        />
      </div>

      <EmptyState
        v-if="!catalog.results.length"
        title="No matching tags"
        message="Try clearing filters or turning off Search lyrics."
      />
      <div
        v-else
        ref="listEl"
        class="list"
        :class="{ 'is-scrubbing': scrubbing }"
        aria-label="Search results"
        :style="{ height: `${browseListHeight}px`, position: 'relative', width: '100%' }"
      >
        <div
          v-if="scrubbing && scrubGhostItems.length"
          class="scrub-ghost"
          aria-hidden="true"
          :style="{ top: `${stickyBrowsePad}px` }"
        >
          <div
            class="scrub-ghost-layer"
            :style="{ transform: `translateY(${scrubGhostShiftY}px)` }"
          >
            <div
              v-for="g in scrubGhostItems"
              :key="g.key"
              class="virt-row scrub-ghost-row"
              :class="{ focus: g.focus }"
            >
              <h2 v-if="g.row.type === 'section'" class="section-head">
                <span class="section-head-label">
                  <CustomCollectionMark v-if="g.row.custom" />
                  {{ g.row.label }}
                </span>
              </h2>
              <div
                v-else
                class="list-row"
                :class="{ 'show-select': showRowSelect }"
              >
                <span
                  v-if="showRowSelect"
                  class="sel-btn"
                  :class="{ on: catalog.selectedIds.has(g.row.tag.id) }"
                >{{ catalog.selectedIds.has(g.row.tag.id) ? '✓' : '' }}</span>
                <div class="row-link">
                  <TagListRowContent
                    :tag="g.row.tag"
                    :lyrics-snippet="catalog.lyricsSnippet(g.row.tag.id)"
                  />
                </div>
                <span class="row-fav" aria-hidden="true">
                  <span
                    v-if="favorites.isTagCaching(g.row.tag.id)"
                    class="row-fav-spinner"
                  />
                  <font-awesome-icon
                    v-else
                    :icon="favorites.isStarred(g.row.tag.id) ? ['fas', 'heart'] : ['far', 'heart']"
                  />
                </span>
              </div>
            </div>
          </div>
        </div>
        <div
          v-for="item in virtualBrowseItems"
          :key="String(item.v.key)"
          :ref="measureBrowseRow"
          class="virt-row"
          :data-index="item.v.index"
          :style="{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            transform: `translateY(${item.v.start - listScrollMargin}px)`,
          }"
        >
          <h2
            v-if="item.row.type === 'section'"
            :id="`sec-${item.row.key}`"
            class="section-head"
          >
            <span class="section-head-label">
              <CustomCollectionMark v-if="item.row.custom" />
              {{ item.row.label }}
            </span>
            <button
              v-if="canFilterSection(item.row.key)"
              type="button"
              class="section-filter-btn"
              :class="{ on: isSectionFilterActive(item.row.key) }"
              :aria-pressed="isSectionFilterActive(item.row.key)"
              :aria-label="sectionFilterTip(item.row.key, item.row.label)"
              :title="sectionFilterTip(item.row.key, item.row.label)"
              @click.stop="toggleSectionFilter(item.row.key)"
            >
              <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
                <path
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.75"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  d="M4 6h16M7 12h10M10 18h4"
                />
              </svg>
            </button>
          </h2>
          <div
            v-else
            class="list-row"
            :class="{ 'show-select': showRowSelect }"
            :data-browse-index="item.row.index"
            tabindex="0"
            @keydown="onResultKey($event, item.row.tag.id)"
            @pointerdown="onRowPointerDown($event, item.row.tag.id)"
            @pointermove="onRowPointerMove"
            @pointerup="onRowPointerEnd"
            @pointercancel="onRowPointerEnd"
            @click.capture="onRowClickCapture"
            @contextmenu="onRowContextMenu"
          >
            <button
              v-if="showRowSelect"
              type="button"
              class="sel-btn"
              :class="{ on: catalog.selectedIds.has(item.row.tag.id) }"
              :aria-pressed="catalog.selectedIds.has(item.row.tag.id)"
              :aria-label="`Select ${item.row.tag.title || item.row.tag.id}`"
              :title="selectRowTip(item.row.tag)"
              @click.stop="catalog.toggleSelect(item.row.tag.id)"
            >
              {{ catalog.selectedIds.has(item.row.tag.id) ? '✓' : '' }}
            </button>
            <RouterLink
              :to="tagOpenLocation(item.row.tag.id, { fullscreen: prefs.singMode })"
              class="row-link"
              :title="rowOpenTip(item.row.tag)"
              @click="markBrowseOpen(item.row.tag.id)"
            >
              <TagListRowContent
                :tag="item.row.tag"
                :lyrics-snippet="catalog.lyricsSnippet(item.row.tag.id)"
              />
            </RouterLink>
            <button
              type="button"
              class="row-fav"
              :aria-pressed="favorites.isStarred(item.row.tag.id)"
              :aria-busy="favorites.isTagCaching(item.row.tag.id)"
              :aria-label="rowStarLabel(item.row.tag)"
              :title="rowStarTip(item.row.tag)"
              @click.stop="toggleRowStar(item.row.tag)"
            >
              <span
                v-if="favorites.isTagCaching(item.row.tag.id)"
                class="row-fav-spinner"
                aria-hidden="true"
              />
              <font-awesome-icon
                v-else
                :icon="favorites.isStarred(item.row.tag.id) ? ['fas', 'heart'] : ['far', 'heart']"
                aria-hidden="true"
              />
            </button>
          </div>
        </div>
      </div>
    </template>

    <TagSelectionBar
      :count="catalog.selectedIds.size"
      toolbar-label="Selected tags"
      @favorite="starSelected"
      @collection="collectionPickerOpen = true"
      @zip="addSelectedToQueue"
      @clear="catalog.clearSelection()"
    />

    <CollectionPickerSheet
      :open="collectionPickerOpen"
      :tag-ids="selectedTagIds"
      title="Add to collection"
      @close="collectionPickerOpen = false"
      @done="favoriteSelectedToCollection"
    />

  </section>
</template>

<style scoped>
.home {
  min-width: 0;
  max-width: 100%;
  /* Measured --header-h (set on :root by App) already includes safe-area padding. */
  --jump-rail-offset: var(--header-h, 3.5rem);
  /* Sticky section scroll-margin: 3-row jump rail (narrow); row classes override. */
  --jump-rail-h: 7.5rem;
}
.home.jump-rows-2 {
  --jump-rail-h: 5.5rem;
}
.home.jump-rows-1 {
  --jump-rail-h: 3.25rem;
}
.home.has-selection {
  padding-bottom: 5.5rem;
}
.warn {
  color: var(--danger);
}
.ok {
  color: var(--accent);
  font-size: 0.9rem;
}
.search-toolbar {
  display: grid;
  gap: 0.4rem;
  margin-bottom: 0.35rem;
  padding: 0.35rem 0 0;
}
.searchrow {
  display: flex;
  flex-wrap: nowrap;
  align-items: stretch;
  gap: 0.4rem;
}
.search-field {
  position: relative;
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  align-items: stretch;
}
.search-field input[type='search'] {
  flex: 1;
  min-width: 0;
  width: 100%;
  min-height: 48px;
  padding: 0.75rem 6.5rem 0.75rem 0.95rem;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface);
  font: inherit;
  font-size: 16px;
}
.search-field input[type='search']::-webkit-search-cancel-button {
  -webkit-appearance: none;
  appearance: none;
  display: none;
}
.search-field input[type='search']::-moz-search-clear-button {
  display: none;
}
.search-infield {
  position: absolute;
  right: 0.35rem;
  top: 50%;
  transform: translateY(-50%);
  display: flex;
  align-items: center;
  gap: 0.1rem;
}
.icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  padding: 0;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--muted);
  font: inherit;
  font-size: 0.95rem;
  font-weight: 700;
  line-height: 1;
}
.icon-btn:hover {
  background: color-mix(in srgb, var(--border) 45%, transparent);
  color: var(--text);
}
.clear-infield {
  font-size: 0.85rem;
}
.scan-qr-btn svg {
  display: block;
}
.tips-btn {
  font-family: Georgia, 'Times New Roman', serif;
  font-style: italic;
  font-size: 0.95rem;
}
.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
.options-btn {
  position: relative;
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  min-width: 48px;
  min-height: 48px;
  padding: 0;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface);
  color: var(--muted);
  cursor: pointer;
}
.options-btn:hover {
  color: var(--text);
  border-color: color-mix(in srgb, var(--text) 22%, var(--border));
  background: color-mix(in srgb, var(--border) 28%, var(--surface));
}
.options-btn.open {
  color: var(--accent-hover, var(--accent));
  border-color: var(--accent);
  background: color-mix(in srgb, var(--accent) 16%, var(--surface));
  box-shadow: inset 0 1px 2px color-mix(in srgb, var(--text) 12%, transparent);
}
.options-btn.open:hover {
  border-color: var(--accent);
  background: color-mix(in srgb, var(--accent) 22%, var(--surface));
}
.options-btn:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
.options-icon {
  display: block;
}
.options-panel {
  display: grid;
  gap: 0.75rem;
  margin-top: 0.15rem;
  padding: 0.65rem 0.7rem 0.75rem;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--bg);
}
.options-setting {
  padding: 0.55rem 0.65rem;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: var(--surface);
}
.setting-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  margin: 0;
  cursor: pointer;
}
.setting-row.on .setting-title {
  color: var(--accent-hover);
}
.setting-row.disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
.setting-copy {
  display: grid;
  gap: 0.1rem;
  min-width: 0;
}
.setting-title {
  font-size: 0.92rem;
  font-weight: 650;
  color: var(--text);
}
.setting-desc {
  font-size: 0.78rem;
  color: var(--muted);
  line-height: 1.35;
}
.setting-switch {
  appearance: none;
  position: relative;
  flex: 0 0 auto;
  width: 2.6rem;
  height: 1.45rem;
  margin: 0;
  border-radius: 999px;
  border: 1px solid var(--border);
  background: color-mix(in srgb, var(--border) 55%, var(--surface));
  cursor: pointer;
  transition: background 0.15s ease, border-color 0.15s ease;
}
.setting-switch::after {
  content: '';
  position: absolute;
  top: 1px;
  left: 1px;
  width: calc(1.45rem - 4px);
  height: calc(1.45rem - 4px);
  border-radius: 50%;
  background: var(--surface);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.12);
  transition: transform 0.15s ease;
}
.setting-switch:checked {
  background: var(--accent);
  border-color: var(--accent);
}
.setting-switch:checked::after {
  transform: translateX(1.15rem);
}
.setting-switch:disabled {
  cursor: not-allowed;
}
.setting-switch:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
.filters-heading {
  margin: 0 0 0.4rem;
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--muted);
}
.tips-wrap {
  position: relative;
  /* Above sticky jump/scrub rails (z-index: 4) so the [i] popover isn’t covered. */
  z-index: 5;
}
.tips-popover {
  display: none;
  position: absolute;
  right: 0;
  top: calc(100% + 0.35rem);
  z-index: 12;
  width: min(18rem, 70vw);
  padding: 0.65rem 0.75rem;
  border-radius: 10px;
  border: 1px solid var(--border);
  background: var(--surface);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.1);
  font-size: 0.85rem;
  line-height: 1.45;
  color: var(--muted);
  pointer-events: none;
}
.tips-popover p {
  margin: 0;
}
.tips-popover code {
  font-size: 0.85em;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 0.05rem 0.3rem;
}
@media (hover: hover) {
  .tips-wrap:hover .tips-popover,
  .tips-wrap:focus-within .tips-popover {
    display: block;
  }
}
.search-options {
  display: none;
}
.search-hint {
  margin: 0;
  color: var(--muted);
  font-size: 0.9rem;
  line-height: 1.45;
}
.search-hint code {
  font-size: 0.85em;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 0.05rem 0.3rem;
}
.clear-q {
  display: none;
}
@media (min-width: 640px) {
  .searchrow {
    flex-wrap: nowrap;
  }
}
.results-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.45rem 0.75rem;
  margin: 0.5rem 0 0.35rem;
}
.results-meta .count {
  margin: 0;
  flex: 1 1 12rem;
  min-width: 0;
  font-size: 0.88rem;
  line-height: 1.35;
}
.clear-filters {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  margin: 0;
  padding: 0.15rem 0.35rem;
  min-height: 36px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--muted);
  font: inherit;
  font-size: inherit;
  line-height: inherit;
  cursor: pointer;
  vertical-align: baseline;
}
.clear-filters:hover {
  color: var(--danger);
  background: color-mix(in srgb, var(--danger) 8%, transparent);
}
.clear-filters:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
.sort-controls {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  flex-shrink: 0;
}
.sort-rev {
  min-width: 40px;
  min-height: 40px;
  padding: 0.35rem 0.5rem;
  border-radius: 10px;
  border: 1px solid var(--border);
  background: var(--surface);
  font: inherit;
  font-size: 1rem;
  line-height: 1;
  color: var(--muted);
  font-weight: 700;
}
.sort-rev.on {
  background: color-mix(in srgb, var(--accent) 12%, var(--surface));
  border-color: var(--accent);
  color: var(--accent-hover);
}
.sort-field {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  flex: 0 0 auto;
  margin: 0;
}
.sort-lbl {
  font-size: 0.85rem;
  color: var(--muted);
  font-weight: 600;
  white-space: nowrap;
}
.sort-field select {
  font: inherit;
  font-size: 0.9rem;
  min-height: 40px;
  padding: 0.35rem 0.55rem;
  border-radius: 10px;
  border: 1px solid var(--border);
  background: var(--surface);
  max-width: 100%;
}
.jump-rail {
  position: sticky;
  top: var(--jump-rail-offset);
  z-index: 4;
  display: grid;
  /* Same chrome as year scrub: ↑ fixed left, keys/track fill the rest. */
  grid-template-columns: auto 1fr;
  gap: 0.45rem;
  align-items: center;
  padding: 0.4rem 0;
  margin: 0 0 0.5rem;
  background: color-mix(in srgb, var(--bg) 94%, transparent);
  backdrop-filter: blur(8px);
}
.jump-rail-status {
  margin: 0;
  min-width: 0;
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--muted);
  line-height: 1.2;
}
.jump-keys {
  display: grid;
  gap: 0.3rem;
  min-width: 0;
}
/* Collection jumps: chevrons flank up to two pill rows (no scroll). */
.jump-rail-fit {
  align-items: center;
}
.collection-strip {
  min-width: 0;
}
.collection-strip-body {
  position: relative;
  min-width: 0;
}
.collection-measure {
  position: fixed;
  left: -10000px;
  top: 0;
  visibility: hidden;
  pointer-events: none;
  display: flex;
  flex-wrap: wrap;
  align-content: flex-start;
  align-items: center;
  gap: 0.35rem;
  overflow: visible;
}
.collection-strip.paged {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 0.35rem;
}
.collection-strip-nav {
  box-sizing: border-box;
  flex: 0 0 auto;
  width: 2.75rem;
  min-width: 2.75rem;
  max-width: 2.75rem;
  height: 44px;
  min-height: 44px;
  max-height: 44px;
  padding: 0;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text);
  font-size: 1.35rem;
  font-weight: 700;
  line-height: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}
.collection-strip-nav:hover:not(:disabled) {
  border-color: color-mix(in srgb, var(--accent) 35%, var(--border));
  color: var(--accent-hover);
}
.collection-strip-nav:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
.collection-strip-nav:disabled {
  opacity: 0.35;
  cursor: default;
}
.jump-keys-collection,
.collection-page {
  display: flex;
  flex-wrap: wrap;
  align-content: flex-start;
  align-items: center;
  gap: 0.35rem;
  min-width: 0;
  max-height: calc(36px * 2 + 0.35rem);
  overflow: hidden;
}
.collection-strip.paged .collection-page {
  /* Keep a fixed two-row slot while paging, even on single-row pages. */
  min-height: calc(36px * 2 + 0.35rem);
}
.jump-rail-fit .jump.custom {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
}
.jump-rail-fit .jump-keys-collection .jump {
  flex: 0 0 auto;
  min-width: auto;
  padding: 0.2rem 0.55rem;
  font-size: 0.85rem;
  white-space: nowrap;
}
.scrub-rail {
  position: sticky;
  top: var(--jump-rail-offset);
  z-index: 4;
  margin: 0.15rem 0 0.65rem;
  padding: 0.35rem 5px 0.5rem;
  background: color-mix(in srgb, var(--bg) 94%, transparent);
  backdrop-filter: blur(8px);
}
.jump.custom {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
}
.jump {
  min-width: 0;
  min-height: 36px;
  padding: 0.2rem 0.2rem;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: var(--surface);
  font: inherit;
  font-size: clamp(0.72rem, 2.4vw, 0.85rem);
  line-height: 1.1;
  text-align: center;
}
.jump-top {
  /* Match year-scrub ↑: fixed footprint so title/collection rails don’t resize it. */
  box-sizing: border-box;
  width: 2.75rem;
  min-width: 2.75rem;
  max-width: 2.75rem;
  flex: 0 0 2.75rem;
  min-height: 44px;
  padding: 0.35rem 0.55rem;
  font-size: 1.35rem;
  font-weight: 800;
  line-height: 1;
  color: #fff;
  background: var(--accent);
  border-color: var(--accent);
  box-shadow: 0 1px 0 color-mix(in srgb, var(--accent) 55%, #000);
  align-self: center;
}
.jump-top:hover:not(:disabled),
.jump-top:focus-visible:not(:disabled) {
  filter: brightness(1.08);
  outline: none;
}
.jump-top:disabled {
  opacity: 0.45;
  cursor: default;
  filter: none;
  box-shadow: none;
}
.section-head {
  /* Padding (not margin) so window-virtualizer measureElement includes spacing. */
  display: flex;
  align-items: center;
  gap: 0.45rem;
  margin: 0;
  padding: 1.35rem 0 0.7rem;
  font-family: var(--font-display);
  font-size: 1.1rem;
  border-bottom: 1px solid var(--border);
  scroll-margin-top: calc(var(--jump-rail-offset) + var(--jump-rail-h));
}
.section-head-label {
  min-width: 0;
}
.section-filter-btn {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  margin: 0;
  padding: 0;
  border-radius: 8px;
  border: 1px solid transparent;
  background: transparent;
  color: var(--muted);
  cursor: pointer;
}
.section-filter-btn:hover,
.section-filter-btn:focus-visible {
  color: var(--accent);
  border-color: var(--border);
  background: var(--surface);
  outline: none;
}
.section-filter-btn.on {
  color: var(--accent);
  border-color: color-mix(in srgb, var(--accent) 45%, var(--border));
  background: color-mix(in srgb, var(--accent) 12%, var(--surface));
}
.list {
  list-style: none;
  padding: 0;
  margin: 0;
  /* Virtual rows are absolutely positioned; spacing lives on .virt-row. */
}
.list.is-scrubbing > .virt-row {
  /* Hide only real virtualized rows (direct children). Ghost rows nest under .scrub-ghost. */
  opacity: 0;
  pointer-events: none;
}
.scrub-ghost {
  position: fixed;
  left: 0;
  right: 0;
  bottom: calc(var(--bottom-nav-h, 3.75rem) + env(safe-area-inset-bottom));
  z-index: 3;
  overflow: hidden;
  pointer-events: none;
  background: var(--bg, #f4f6f5);
}
.scrub-ghost-layer {
  position: relative;
  height: 100%;
  max-width: 56rem;
  margin: 0 auto;
  box-sizing: border-box;
  will-change: transform;
}
.scrub-ghost-row {
  padding-left: 0.75rem;
  padding-right: 0.75rem;
  box-sizing: border-box;
}
.scrub-ghost-row .list-row {
  /* Match real rows: surface card + radius (ghost sits on page bg). */
  border-radius: var(--radius);
  background: var(--surface);
  border: 1px solid transparent;
}
.scrub-ghost .row-link {
  /* Non-interactive stand-in for RouterLink — keep normal row-link layout. */
  color: inherit;
  text-decoration: none;
}
.scrub-ghost .row-fav {
  pointer-events: none;
}
.scrub-ghost .sel-btn {
  pointer-events: none;
}
.virt-row {
  padding-bottom: 0.35rem;
  box-sizing: border-box;
}
.list-row {
  display: grid;
  /* Default: title + favorite (narrow idle). `.show-select` adds the select column. */
  grid-template-columns: 1fr auto;
  gap: 0.5rem;
  align-items: center;
  padding: 0.45rem 0.35rem;
  border-radius: var(--radius);
  background: var(--surface);
  border: 1px solid transparent;
  touch-action: manipulation;
  user-select: none;
  -webkit-user-select: none;
}
.list-row.show-select {
  grid-template-columns: auto 1fr auto;
}
.list-row:focus-within {
  border-color: var(--border);
}
.meta-only {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.85rem;
  color: var(--muted);
  min-height: 44px;
}
.row-link {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  padding: 0.55rem 0.35rem;
  color: inherit;
  text-decoration: none;
  min-height: 56px;
  justify-content: center;
  min-width: 0;
}
.row-link:hover {
  text-decoration: none;
  color: var(--accent-hover);
}
.row-fav {
  position: relative;
  z-index: 1;
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 44px;
  min-height: 44px;
  padding: 0.35rem 0.55rem;
  align-self: center;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--surface);
  color: var(--muted);
  font: inherit;
  font-size: 1.15rem;
  font-weight: 700;
  line-height: 1;
  cursor: pointer;
}
.row-fav:hover:not(:disabled) {
  border-color: color-mix(in srgb, var(--accent) 45%, var(--border));
  color: var(--accent);
  background: color-mix(in srgb, var(--accent) 8%, var(--surface));
}
.row-fav[aria-pressed='true'] {
  background: color-mix(in srgb, var(--accent) 18%, var(--surface));
  border-color: var(--accent);
  color: var(--accent);
}
.row-fav[aria-busy='true'] {
  color: var(--muted);
}
.row-fav-spinner {
  display: block;
  width: 1.1rem;
  height: 1.1rem;
  border: 2px solid color-mix(in srgb, var(--accent) 28%, transparent);
  border-top-color: var(--accent);
  border-radius: 50%;
  animation: row-fav-spin 0.65s linear infinite;
}
@keyframes row-fav-spin {
  to {
    transform: rotate(360deg);
  }
}
.sel-btn {
  position: relative;
  z-index: 1;
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 44px;
  min-height: 44px;
  width: 44px;
  padding: 0.35rem 0.55rem;
  margin: 0;
  border-radius: 10px;
  border: 1px solid var(--border);
  background: var(--surface);
  font: inherit;
  font-size: 1.15rem;
  font-weight: 700;
  line-height: 1;
  color: var(--accent);
  align-self: center;
  cursor: pointer;
}
.sel-btn.on {
  background: color-mix(in srgb, var(--accent) 18%, var(--surface));
  border-color: var(--accent);
}
.sel {
  display: flex;
  align-items: center;
  padding: 0 0.35rem;
  min-width: 44px;
  justify-content: center;
}
.sel input {
  width: 1.15rem;
  height: 1.15rem;
}
.more {
  margin: 1rem auto;
  display: block;
}
code {
  font-size: 0.9em;
}
</style>
