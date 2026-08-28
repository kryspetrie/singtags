<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { useCatalogStore, type SortMode } from '../stores/catalog'
import { useQueueStore } from '../stores/queue'
import { useStarsStore } from '../stores/stars'
import { useRecentStore } from '../stores/recent'
import type { PartId, TagDetail, TagSummary } from '../types/tag'
import { catalogOriginalPaths } from '../lib/audioTiers'
import { downloadableSheetAssets } from '../lib/sheetAssets'
import { partTrackLabel } from '../lib/parts'
import EmptyState from '../components/EmptyState.vue'
import SearchChips from '../components/SearchChips.vue'
import FilterSheet from '../components/FilterSheet.vue'
import BrowseWelcomeDialog from '../components/BrowseWelcomeDialog.vue'
import StarsNoticeLine from '../components/StarsNoticeLine.vue'
import { tagDetailUrl, mediaUrl } from '../lib/mediaUrl'
import { fetchCached } from '../lib/manualOfflineFetch'
import { sheetsPack } from '../offline/libraryPack'
import { getStarred } from '../offline/starredDb'
import { useOfflineLibraryStore } from '../stores/offlineLibrary'
import { usePreferencesStore } from '../stores/preferences'
import {
  bookletBadgeForTag,
  formatArrangerLastFirst,
  hasJumpRail,
  parse100DaysNumberQuery,
  parseClassicNumberQuery,
  parseExactTagIdQuery,
  parseTagNumberQuery,
} from '../search/browse'
import { visibleAltTitle } from '../lib/tagDisplay'
import { useOnline } from '../composables/useOnline'

const catalog = useCatalogStore()
const queue = useQueueStore()
const stars = useStarsStore()
const recent = useRecentStore()
const offlineLib = useOfflineLibraryStore()
const prefs = usePreferencesStore()
const { offline } = useOnline()
const route = useRoute()
const router = useRouter()
const lyricsError = ref<string | null>(null)
const syncingRoute = ref(false)
const bulkMsg = ref<string | null>(null)
const tipsOpen = ref(false)
const filtersOpen = ref(false)
const welcomeOpen = ref(false)

function closeWelcome(): void {
  prefs.dismissBrowseWelcome()
  welcomeOpen.value = false
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

const chipFilterCount = computed(() => {
  const f = catalog.filters
  let n = 0
  if (f.hasSheet === true) n++
  if (f.hasAudio === true) n++
  if (f.minRating != null) n++
  n += f.keys.length + f.arrangers.length + f.types.length + f.collections.length
  return n
})

const hasChipFilters = computed(() => chipFilterCount.value > 0)

const ftsPending = computed(() => catalog.filters.fullText && !catalog.lyricsLoaded)

watch(
  () => catalog.filters.fullText,
  (on) => {
    if (on) void onEnsureLyrics()
  },
)

function toggleFullTextSearch(): void {
  if (!catalog.filters.fullText && catalog.lyricsLoading) return
  catalog.patchFilters({ fullText: !catalog.filters.fullText })
}

function openSearchTips(): void {
  if (window.matchMedia('(hover: none)').matches) tipsOpen.value = true
}

function closeSearchTips(): void {
  tipsOpen.value = false
}

function markBrowseOpen(id: number): void {
  recent.markBrowseNavigation(id)
}

function browseAltTitle(tag: TagSummary): string | null {
  return visibleAltTitle(tag.altTitle, tag.title)
}

function applyRoute(): void {
  syncingRoute.value = true
  const sort = (typeof route.query.sort === 'string' ? route.query.sort : 'rating') as SortMode
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

/** Tag metadata for queueing — Cache API, sheets pack, or starred detail (works offline). */
async function loadTagDetailForQueue(id: number): Promise<TagDetail | null> {
  try {
    const res = await fetchCached(tagDetailUrl(id))
    if (res.ok) return (await res.json()) as TagDetail
  } catch {
    /* try pack / starred */
  }
  try {
    const packed = await sheetsPack.get(tagDetailUrl(id))
    if (packed) return (await packed.json()) as TagDetail
  } catch {
    /* try starred */
  }
  const starred = await getStarred(id)
  return starred?.detail ?? null
}

async function addSelectedToQueue(): Promise<void> {
  bulkMsg.value = null
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
  bulkMsg.value =
    skipped > 0
      ? offline.value
        ? `Queued files from ${ok} tag(s); ${skipped} skipped (not cached on device).`
        : `Queued files from ${ok} tag(s); skipped ${skipped}.`
      : ok
        ? `Queued sheets and tracks from ${ok} tag(s).`
        : offline.value
          ? 'No cached tag details — open tags online once, or reconnect.'
          : 'No files queued.'
}

async function starSelected(): Promise<void> {
  const summaries = [...catalog.selectedIds]
    .map((id) => catalog.getById(id))
    .filter((t): t is NonNullable<typeof t> => !!t)
  void stars.starMany(summaries, { metadataOnly: false })
}

function toggleRowStar(summary: TagSummary): void {
  void stars.toggle(summary, null, { metadataOnly: false })
}

function onResultKey(e: KeyboardEvent, id: number): void {
  if (e.key === ' ' || e.key === 'x' || e.key === 'X') {
    e.preventDefault()
    catalog.toggleSelect(id)
  }
}

const sorts: Array<{ id: SortMode; label: string }> = [
  { id: 'rating', label: 'Rating' },
  { id: 'title', label: 'Title A–Z' },
  { id: 'arranger', label: 'Arranger (First Last)' },
  { id: 'arranger-last', label: 'Arranger (Last, First)' },
  { id: 'year', label: 'Year' },
  { id: 'downloads', label: 'Downloads' },
  { id: 'id', label: 'Tag #' },
  { id: 'collection', label: 'Collection #' },
]

const filterToggleTip = computed(() => {
  if (filtersOpen.value) return 'Hide filters'
  if (hasChipFilters.value) {
    return `${chipFilterCount.value} filter${chipFilterCount.value === 1 ? '' : 's'} active — click to edit`
  }
  return 'Filter by sheet, audio, key, arranger, and more'
})

const searchLyricsTip = computed(() => {
  if (catalog.filters.fullText) return 'Searching lyrics too — click to turn off'
  if (catalog.lyricsLoading) return 'Loading lyrics index…'
  return 'Also match words in tag lyrics (uses the lyrics index)'
})

function rowStarTip(tag: TagSummary): string {
  if (stars.isTagCaching(tag.id)) {
    return stars.tagCachingLabel(tag.id) || 'Caching for offline'
  }
  return stars.isStarred(tag.id)
    ? 'Unstar — remove from saved tags'
    : 'Star — save for offline use and practice sets'
}

function rowStarLabel(tag: TagSummary): string {
  if (stars.isTagCaching(tag.id)) return 'Caching for offline'
  return stars.isStarred(tag.id) ? 'Unstar' : 'Star'
}

function selectRowTip(tag: TagSummary): string {
  const name = tag.title || `Tag ${tag.id}`
  return catalog.selectedIds.has(tag.id)
    ? `Deselect ${name}`
    : `Select ${name} for bulk star or zip (Space while row is focused)`
}

function rowOpenTip(tag: TagSummary): string {
  const title = tag.title || `Tag ${tag.id}`
  const alt = browseAltTitle(tag)
  return alt ? `Open ${title} (${alt})` : `Open ${title}`
}

function sortOptionTip(id: SortMode): string {
  const tips: Record<SortMode, string> = {
    rating: 'Highest rated tags first',
    title: 'Alphabetical by title',
    arranger: 'Alphabetical by arranger (first name)',
    'arranger-last': 'Alphabetical by arranger (last name)',
    year: 'Newest year first',
    downloads: 'Most downloaded first',
    id: 'Numeric tag ID order',
    collection: 'By collection booklet # (Classic, then 100 Days), then tag #',
  }
  const base = tips[id]
  return catalog.sortReverse ? `${base} (reversed)` : base
}

function sortReverseTip(): string {
  return catalog.sortReverse
    ? 'Reverse sort is on — click for default direction'
    : 'Reverse the current sort order'
}

function formatDownloads(n: number | null | undefined): string | null {
  if (n == null || n <= 0) return null
  return n.toLocaleString()
}

function scrollBrowseTop(): void {
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

const showJump = computed(() => hasJumpRail(catalog.sortMode) && catalog.browseWindow.jumpKeys.length > 1)

function jumpSectionTip(key: string): string {
  const row = catalog.browseWindow.rows.find((r) => r.type === 'section' && r.key === key)
  return row?.type === 'section' ? `Jump to ${row.label}` : `Jump to ${key}`
}

const scrollSentinel = ref<HTMLElement | null>(null)
let observer: IntersectionObserver | null = null

function setupInfiniteScroll(): void {
  observer?.disconnect()
  if (!scrollSentinel.value) return
  observer = new IntersectionObserver(
    (entries) => {
      if (entries.some((e) => e.isIntersecting) && catalog.hasMoreResults) {
        catalog.showMoreResults()
      }
    },
    { rootMargin: '240px' },
  )
  observer.observe(scrollSentinel.value)
}

async function jumpToSection(key: string): Promise<void> {
  catalog.revealSection(key)
  await nextTick()
  document.getElementById(`sec-${key}`)?.scrollIntoView({
    behavior: 'smooth',
    block: 'start',
  })
}

/** Enter or search button: `n123` → Tag #; `c99` / bare digits → classic or tag when unique. */
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

onMounted(async () => {
  await Promise.all([catalog.load(), stars.ensureLoaded()])
  applyRoute()
  if (!prefs.browseWelcomeDismissed) welcomeOpen.value = true
  await nextTick()
  setupInfiniteScroll()
})

onUnmounted(() => observer?.disconnect())

watch(
  () => [catalog.hasMoreResults, catalog.results.length] as const,
  async () => {
    await nextTick()
    setupInfiniteScroll()
  },
)
</script>

<template>
  <section class="home" :class="{ 'has-selection': catalog.selectedIds.size }">
    <header class="hero">
      <div class="search-toolbar sticky-search">
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
              autofocus
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
            class="search-submit"
            aria-label="Search"
            title="Run search (Enter)"
            @click="submitSearch()"
          >
            <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true">
              <circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke="currentColor" stroke-width="2.25" />
              <path
                d="M15.5 15.5 L21 21"
                fill="none"
                stroke="currentColor"
                stroke-width="2.25"
                stroke-linecap="round"
              />
            </svg>
          </button>
          <button
            type="button"
            class="search-mode"
            :class="{ on: catalog.filters.fullText }"
            :aria-pressed="catalog.filters.fullText"
            :disabled="catalog.lyricsLoading && !catalog.filters.fullText"
            :title="searchLyricsTip"
            @click="toggleFullTextSearch"
          >
            {{
              catalog.lyricsLoading && !catalog.filters.fullText ? 'Search lyrics…' : 'Search lyrics'
            }}
          </button>
          <button
            type="button"
            class="filter-toggle"
            :class="{ on: filtersOpen || hasChipFilters }"
            :aria-expanded="filtersOpen"
            aria-controls="browse-filters"
            :title="filterToggleTip"
            @click="filtersOpen = !filtersOpen"
          >
            Filter{{ chipFilterCount ? ` (${chipFilterCount})` : '' }}
          </button>
        </div>
        <div v-show="filtersOpen" id="browse-filters" class="filters-panel">
          <SearchChips
            :open="filtersOpen"
            :filters="catalog.filters"
            :keys="catalog.keys"
            :arrangers="catalog.arrangers"
            :types="catalog.types"
            :collections="catalog.collections"
            @patch="catalog.patchFilters($event)"
            @clear="catalog.clearFilters()"
          />
        </div>
      </div>
      <FilterSheet :open="tipsOpen" title="Search tips" @close="closeSearchTips">
        <p class="search-hint">
          Enter on <code>n123</code> opens Tag #123; <code>c45</code> Classic #45; <code>p12</code> 100 Days #12. Exclude with
          <code>-word</code>; quotes for an exact phrase.
        </p>
      </FilterSheet>
      <BrowseWelcomeDialog
        :open="welcomeOpen"
        @close="closeWelcome"
        @continue="onWelcomeContinue"
      />
      <p v-if="ftsPending" class="warn" role="status">
        Search lyrics is on — matching titles until the lyrics index finishes loading.
      </p>
      <p v-if="lyricsError" class="warn" role="alert">{{ lyricsError }}</p>
      <p v-if="bulkMsg" class="ok" role="status">{{ bulkMsg }}</p>
      <p v-if="stars.lastNotice" class="ok stars-notice-wrap" role="status">
        <StarsNoticeLine :notice="stars.lastNotice" />
      </p>
    </header>

    <p v-if="catalog.loading || (!catalog.loaded && !catalog.error)" class="text-muted" role="status">
      Loading catalog…
    </p>
    <EmptyState
      v-else-if="catalog.error"
      :title="offline ? 'Offline — catalog not cached yet' : 'Catalog failed to load'"
      :message="
        offline
          ? 'Open SingTags online once so the catalog saves to this device, then try again.'
          : catalog.error
      "
      tone="danger"
    />
    <template v-else>
      <div class="results-meta" aria-live="polite">
        <p class="text-muted count">
          Showing {{ catalog.results.length }} of {{ catalog.allResults.length }} matches
          <span v-if="catalog.filterCount">
            · {{ catalog.filterCount }} filter{{ catalog.filterCount === 1 ? '' : 's' }}
          </span>
          · {{ catalog.tags.length }} in catalog
        </p>
        <div class="sort-controls">
          <label class="sort-field" title="Choose how matching tags are ordered">
            <span class="sort-lbl">Sort</span>
            <select v-model="catalog.sortMode" aria-label="Sort results">
              <option v-for="s in sorts" :key="s.id" :value="s.id" :title="sortOptionTip(s.id)">
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
            aria-label="Reverse sort order"
            @click="catalog.toggleSortReverse()"
          >
            ⇅
          </button>
        </div>
      </div>

      <nav
        v-if="showJump"
        class="jump-rail"
        aria-label="Jump to section"
      >
        <button
          type="button"
          class="jump jump-top"
          title="Back to top"
          aria-label="Back to top"
          @click="scrollBrowseTop"
        >
          ↑
        </button>
        <button
          v-for="key in catalog.browseWindow.jumpKeys"
          :key="key"
          type="button"
          class="jump"
          :title="jumpSectionTip(key)"
          @click="jumpToSection(key)"
        >
          {{ key }}
        </button>
      </nav>

      <EmptyState
        v-if="!catalog.results.length"
        title="No matching tags"
        message="Try clearing filters or turning off Search lyrics."
      />
      <div v-else class="list" aria-label="Search results">
        <template v-for="row in catalog.browseWindow.rows" :key="row.type === 'section' ? `s-${row.key}` : row.tag.id">
          <h2
            v-if="row.type === 'section'"
            :id="`sec-${row.key}`"
            class="section-head"
          >
            {{ row.label }}
          </h2>
          <div
            v-else
            class="list-row"
            tabindex="0"
            @keydown="onResultKey($event, row.tag.id)"
          >
            <button
              type="button"
              class="sel-btn"
              :class="{ on: catalog.selectedIds.has(row.tag.id) }"
              :aria-pressed="catalog.selectedIds.has(row.tag.id)"
              :aria-label="`Select ${row.tag.title || row.tag.id}`"
              :title="selectRowTip(row.tag)"
              @click.stop="catalog.toggleSelect(row.tag.id)"
            >
              {{ catalog.selectedIds.has(row.tag.id) ? '✓' : '' }}
            </button>
            <RouterLink
              :to="`/tag/${row.tag.id}`"
              class="row-link"
              :title="rowOpenTip(row.tag)"
              @click="markBrowseOpen(row.tag.id)"
            >
              <span class="title">
                <span class="title-line">
                  <span class="tag-num" title="Tag number">#{{ row.tag.id }}</span>
                  <span
                    v-if="bookletBadgeForTag(row.tag)"
                    class="classic-num"
                    :class="'booklet-' + bookletBadgeForTag(row.tag)!.kind"
                    :title="bookletBadgeForTag(row.tag)!.label"
                  >{{ bookletBadgeForTag(row.tag)!.short }}</span>
                  {{ row.tag.title || `Tag ${row.tag.id}` }}
                </span>
                <span v-if="browseAltTitle(row.tag)" class="alt-title">{{ browseAltTitle(row.tag) }}</span>
              </span>
              <span class="meta">
                <span v-if="row.tag.key" title="Written key">{{ row.tag.key }}</span>
                <span
                  v-if="row.tag.arranger"
                  :title="`Arranger: ${row.tag.arranger}`"
                >{{
                  catalog.sortMode === 'arranger-last'
                    ? formatArrangerLastFirst(row.tag.arranger)
                    : row.tag.arranger
                }}</span>
                <span v-if="row.tag.year" title="Year published or added">{{ row.tag.year }}</span>
                <span
                  v-if="row.tag.rating != null"
                  :title="`Average rating${row.tag.ratingCount != null ? ` (${row.tag.ratingCount} votes)` : ''}`"
                >★ {{ row.tag.rating.toFixed(2) }}</span>
                <span
                  v-if="formatDownloads(row.tag.downloads)"
                  class="dl-count"
                  title="Downloads on barbershoptags.com"
                >↓ {{ formatDownloads(row.tag.downloads) }}</span>
                <span v-if="!row.tag.hasSheet" class="badge" title="No sheet music on file">No sheet</span>
                <span v-if="!row.tag.audioParts?.length" class="badge" title="No learning tracks on file">No audio</span>
              </span>
              <span
                v-for="snip in [catalog.lyricsSnippet(row.tag.id)]"
                v-show="snip"
                :key="'ly-' + row.tag.id"
                class="lyrics-snip"
                title="Lyrics match"
                >{{ snip }}</span
              >
            </RouterLink>
            <button
              type="button"
              class="row-star"
              :aria-pressed="stars.isStarred(row.tag.id)"
              :aria-busy="stars.isTagCaching(row.tag.id)"
              :aria-label="rowStarLabel(row.tag)"
              :title="rowStarTip(row.tag)"
              @click.stop="toggleRowStar(row.tag)"
            >
              <span
                v-if="stars.isTagCaching(row.tag.id)"
                class="row-star-spinner"
                aria-hidden="true"
              />
              <span v-else>{{ stars.isStarred(row.tag.id) ? '★' : '☆' }}</span>
            </button>
          </div>
        </template>
        <div ref="scrollSentinel" class="scroll-sentinel" aria-hidden="true" />
        <p v-if="catalog.hasMoreResults" class="text-muted more-hint">Scroll for more…</p>
      </div>
    </template>

    <Teleport to="body">
      <div
        v-if="catalog.selectedIds.size"
        class="selection-bar"
        role="toolbar"
        aria-label="Selected tags"
      >
        <span class="sel-count">{{ catalog.selectedIds.size }} selected</span>
        <button
          type="button"
          class="btn btn-primary"
          title="Star selected tags and cache for offline"
          @click="starSelected"
        >
          Star
        </button>
        <button
          type="button"
          class="btn"
          title="Add selected tags' sheets and tracks to the download queue"
          @click="addSelectedToQueue"
        >
          Add to zip
        </button>
        <button
          type="button"
          class="btn btn-ghost"
          title="Clear selection"
          @click="catalog.clearSelection()"
        >
          Clear
        </button>
      </div>
    </Teleport>
  </section>
</template>

<style scoped>
.home {
  min-width: 0;
  max-width: 100%;
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
.sticky-search {
  position: sticky;
  top: calc(var(--header-h, 3.5rem) + env(safe-area-inset-top));
  z-index: 5;
  padding: 0.35rem 0;
  background: color-mix(in srgb, var(--bg) 92%, transparent);
  backdrop-filter: blur(8px);
}
.search-toolbar {
  display: grid;
  gap: 0.4rem;
  margin-bottom: 0.35rem;
}
.searchrow {
  display: flex;
  flex-wrap: wrap;
  align-items: stretch;
  gap: 0.4rem;
}
.search-field {
  position: relative;
  flex: 1 1 10rem;
  min-width: 0;
  display: flex;
  align-items: stretch;
}
.search-field input[type='search'] {
  flex: 1;
  min-width: 0;
  width: 100%;
  min-height: 48px;
  padding: 0.75rem 4.25rem 0.75rem 0.95rem;
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
.tips-btn {
  font-family: Georgia, 'Times New Roman', serif;
  font-style: italic;
  font-size: 0.95rem;
}
.search-mode,
.filter-toggle {
  flex: 0 0 auto;
  align-self: center;
  min-height: 44px;
  padding: 0.35rem 0.7rem;
  border-radius: 999px;
  border: 1px solid var(--border);
  background: var(--surface);
  font: inherit;
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--muted);
  white-space: nowrap;
}
.search-mode.on,
.filter-toggle.on {
  background: color-mix(in srgb, var(--accent) 12%, var(--surface));
  border-color: var(--accent);
  color: var(--accent-hover);
}
.filter-toggle[aria-expanded='true'] {
  background: color-mix(in srgb, var(--accent) 12%, var(--surface));
  border-color: var(--accent);
  color: var(--accent-hover);
}
.search-mode:disabled {
  opacity: 0.55;
}
.search-submit {
  flex: 0 0 auto;
  align-self: center;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 52px;
  height: 52px;
  min-width: 52px;
  min-height: 52px;
  padding: 0;
  border: 0;
  border-radius: var(--radius);
  background: var(--accent);
  color: #fff;
  cursor: pointer;
}
.search-submit:hover {
  background: var(--accent-hover);
}
.search-submit svg {
  display: block;
}
.filters-panel {
  padding-top: 0.15rem;
}
.tips-wrap {
  position: relative;
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
  .search-mode,
  .filter-toggle {
    font-size: 0.85rem;
    padding: 0.35rem 0.85rem;
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
  top: calc(var(--header-h, 3.5rem) + 3.75rem + env(safe-area-inset-top));
  z-index: 4;
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem;
  padding: 0.4rem 0;
  margin: 0 0 0.5rem;
  background: color-mix(in srgb, var(--bg) 94%, transparent);
  backdrop-filter: blur(8px);
}
.jump {
  min-width: 2rem;
  min-height: 36px;
  padding: 0.2rem 0.45rem;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: var(--surface);
  font: inherit;
  font-size: 0.85rem;
}
.jump-top {
  font-weight: 700;
  color: var(--accent);
}
.dl-count {
  font-variant-numeric: tabular-nums;
}
.section-head {
  margin: 1rem 0 0.35rem;
  padding: 0.35rem 0;
  font-family: var(--font-display);
  font-size: 1.1rem;
  border-bottom: 1px solid var(--border);
  scroll-margin-top: calc(var(--header-h, 3.5rem) + 6.5rem + env(safe-area-inset-top));
}
.list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: grid;
  gap: 0.35rem;
}
.list-row {
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 0.5rem;
  align-items: center;
  padding: 0.45rem 0.35rem;
  border-radius: var(--radius);
  background: var(--surface);
  border: 1px solid transparent;
}
.list-row:focus-within {
  border-color: var(--border);
}
.tag-num {
  display: inline-block;
  margin-right: 0.35rem;
  color: var(--muted);
  font-variant-numeric: tabular-nums;
  font-weight: 600;
  font-size: 0.9em;
}
.classic-num.booklet-days100 {
  color: color-mix(in srgb, var(--accent) 70%, var(--text));
}
.classic-num.booklet-easytags {
  color: color-mix(in srgb, var(--text) 75%, var(--accent));
  border-color: color-mix(in srgb, var(--border) 70%, var(--accent));
  background: color-mix(in srgb, var(--surface) 92%, var(--accent));
}
.classic-num {
  display: inline-block;
  margin-right: 0.4rem;
  padding: 0.05rem 0.4rem;
  border-radius: 6px;
  border: 1px solid color-mix(in srgb, var(--accent) 35%, var(--border));
  background: color-mix(in srgb, var(--accent) 12%, var(--surface));
  color: var(--accent);
  font-variant-numeric: tabular-nums;
  font-weight: 600;
  font-size: 0.78em;
  letter-spacing: 0.02em;
  vertical-align: 0.05em;
}
.scroll-sentinel {
  height: 1px;
}
.more-hint {
  text-align: center;
  font-size: 0.85rem;
  padding: 0.75rem 0 1.25rem;
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
.row-star {
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
.row-star:hover:not(:disabled) {
  border-color: color-mix(in srgb, var(--accent) 45%, var(--border));
  color: var(--accent);
  background: color-mix(in srgb, var(--accent) 8%, var(--surface));
}
.row-star[aria-pressed='true'] {
  background: color-mix(in srgb, var(--accent) 18%, var(--surface));
  border-color: var(--accent);
  color: var(--accent);
}
.row-star[aria-busy='true'] {
  color: var(--muted);
}
.row-star-spinner {
  display: block;
  width: 1.1rem;
  height: 1.1rem;
  border: 2px solid color-mix(in srgb, var(--accent) 28%, transparent);
  border-top-color: var(--accent);
  border-radius: 50%;
  animation: row-star-spin 0.65s linear infinite;
}
@keyframes row-star-spin {
  to {
    transform: rotate(360deg);
  }
}
.title {
  font-weight: 600;
}
.title-line {
  min-width: 0;
}
.alt-title {
  display: block;
  color: var(--muted);
  font-weight: 500;
  font-size: 0.88em;
  line-height: 1.35;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  color: var(--muted);
  font-size: 0.92rem;
}
.lyrics-snip {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  color: var(--muted);
  font-size: 0.86rem;
  line-height: 1.35;
  font-weight: 400;
  max-width: 42rem;
}
.badge {
  color: var(--danger);
  font-size: 0.8rem;
}
.sel-btn {
  position: relative;
  z-index: 1;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  min-width: 48px;
  min-height: 48px;
  margin: 0.15rem;
  border-radius: 10px;
  border: 1px solid var(--border);
  background: var(--bg);
  font: inherit;
  font-size: 1.1rem;
  font-weight: 700;
  color: var(--accent);
  align-self: center;
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

<style>
.selection-bar {
  position: fixed;
  left: 0;
  right: 0;
  z-index: 25;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.45rem;
  padding: 0.65rem 0.75rem;
  background: color-mix(in srgb, var(--surface) 94%, transparent);
  border-top: 1px solid var(--border);
  box-shadow: 0 -8px 24px rgba(0, 0, 0, 0.08);
  backdrop-filter: blur(10px);
  bottom: calc(var(--bottom-nav-h, 3.75rem) + env(safe-area-inset-bottom));
}
.selection-bar .sel-count {
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  margin-right: auto;
  font-size: 0.95rem;
}
.selection-bar .btn {
  flex: 0 1 auto;
  min-width: 0;
}
@media (min-width: 768px) {
  .selection-bar {
    left: 50%;
    right: auto;
    transform: translateX(-50%);
    width: min(960px, calc(100% - 2rem));
    bottom: 1rem;
    border: 1px solid var(--border);
    border-radius: 14px;
    box-shadow: 0 10px 32px rgba(0, 0, 0, 0.12);
  }
}
</style>
