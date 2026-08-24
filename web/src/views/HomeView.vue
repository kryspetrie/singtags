<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { useCatalogStore, type SortMode } from '../stores/catalog'
import { useQueueStore } from '../stores/queue'
import { useStarsStore } from '../stores/stars'
import { useRecentStore } from '../stores/recent'
import type { PartId, TagDetail } from '../types/tag'
import EmptyState from '../components/EmptyState.vue'
import SearchChips from '../components/SearchChips.vue'
import { useOnline } from '../composables/useOnline'
import { tagDetailUrl } from '../lib/mediaUrl'
import { useOfflineLibraryStore } from '../stores/offlineLibrary'
import {
  classicLabel,
  formatArrangerLastFirst,
  hasJumpRail,
  parseClassicNumberQuery,
  parseExactTagIdQuery,
  parseTagNumberQuery,
} from '../search/browse'

const catalog = useCatalogStore()
const queue = useQueueStore()
const stars = useStarsStore()
const recent = useRecentStore()
const offlineLib = useOfflineLibraryStore()
const route = useRoute()
const router = useRouter()
const { offline } = useOnline()
const lyricsError = ref<string | null>(null)
const syncingRoute = ref(false)
const bulkMsg = ref<string | null>(null)

const offlineBanner = computed(() => {
  if (!offline.value) return null
  return offlineLib.statusLabel
})

const recentTags = computed(() =>
  recent.list.map((id) => catalog.getById(id)).filter(Boolean),
)

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
  () => [catalog.debouncedQuery, catalog.filters, catalog.sortMode] as const,
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

async function addSelectedToQueue(): Promise<void> {
  bulkMsg.value = null
  let ok = 0
  let skipped = 0
  for (const id of catalog.selectedIds) {
    const res = await fetch(tagDetailUrl(id))
    if (!res.ok) {
      skipped++
      continue
    }
    const d = (await res.json()) as TagDetail
    const parts = Object.keys(d.audio) as PartId[]
    const prefer = parts.filter((p) => p !== 'mix')
    const use = prefer.length ? prefer : parts
    if (!use.length) {
      skipped++
      continue
    }
    queue.addMany(
      use.map((part) => ({
        tagId: d.tag_id,
        title: d.title || `Tag ${d.tag_id}`,
        part,
        path: d.audio[part]!,
      })),
    )
    ok++
  }
  bulkMsg.value =
    skipped > 0
      ? `Queued tracks from ${ok} tag(s); skipped ${skipped}.`
      : ok
        ? `Queued tracks from ${ok} tag(s).`
        : 'No tracks queued.'
}

async function starSelected(): Promise<void> {
  const summaries = [...catalog.selectedIds]
    .map((id) => catalog.getById(id))
    .filter((t): t is NonNullable<typeof t> => !!t)
  await stars.starMany(summaries, { metadataOnly: false })
}

async function toggleRowStar(id: number): Promise<void> {
  const summary = catalog.getById(id)
  if (!summary) return
  let detail: TagDetail | null = null
  if (!stars.isStarred(id)) {
    try {
      const res = await fetch(tagDetailUrl(id))
      if (res.ok) detail = (await res.json()) as TagDetail
    } catch {
      /* metadata */
    }
  }
  await stars.toggle(summary, detail, {
    metadataOnly: !detail && !stars.isStarred(id),
  })
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
]

const showJump = computed(() => hasJumpRail(catalog.sortMode) && catalog.browseWindow.jumpKeys.length > 1)

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

/** Enter: `n123` → Tag #; `c99` / bare digits → classic or tag when unique. */
function onSearchKeydown(e: KeyboardEvent): void {
  if (e.key !== 'Enter') return
  const q = catalog.queryText
  const tagNum = parseTagNumberQuery(q)
  if (tagNum != null && catalog.getById(tagNum)) {
    e.preventDefault()
    void router.push(`/tag/${tagNum}`)
    return
  }
  const classicNum = parseClassicNumberQuery(q)
  if (classicNum != null) {
    const hits = catalog.tags.filter((t) => Number(t.classic) === classicNum)
    if (hits.length === 1) {
      e.preventDefault()
      void router.push(`/tag/${hits[0]!.id}`)
    }
    return
  }
  const id = parseExactTagIdQuery(q)
  if (id != null && catalog.getById(id)) {
    e.preventDefault()
    void router.push(`/tag/${id}`)
  }
}

onMounted(async () => {
  await Promise.all([catalog.load(), stars.ensureLoaded()])
  applyRoute()
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
  <section class="home">
    <header class="hero">
      <h1>SingTags</h1>
      <p class="lede">Search and practice barbershop tags.</p>
      <p v-if="offlineBanner" class="warn" role="status">
        {{ offlineBanner }}
        <RouterLink to="/settings">Offline settings</RouterLink>
      </p>
      <div class="searchrow sticky-search">
        <input
          v-model="catalog.queryText"
          type="search"
          enterkeyhint="search"
          autocomplete="off"
          autocorrect="off"
          spellcheck="false"
          placeholder="Search titles, arrangers, or n123…"
          aria-label="Search tags"
          autofocus
          @keydown="onSearchKeydown"
        />
        <button
          v-if="catalog.queryText"
          type="button"
          class="btn btn-ghost clear-q"
          aria-label="Clear search"
          @click="catalog.queryText = ''"
        >
          Clear
        </button>
      </div>
      <p class="search-hint">
        Tip: Enter on <code>n123</code> opens Tag #123; <code>c45</code> opens Classic #45.
        Exclude with <code>-word</code>; quotes for an exact phrase.
      </p>
      <SearchChips
        :filters="catalog.filters"
        :keys="catalog.keys"
        :arrangers="catalog.arrangers"
        :types="catalog.types"
        :collections="catalog.collections"
        :lyrics-loading="catalog.lyricsLoading"
        :lyrics-loaded="catalog.lyricsLoaded"
        @patch="catalog.patchFilters($event)"
        @clear="catalog.clearFilters()"
        @ensure-lyrics="onEnsureLyrics"
      />
      <p v-if="catalog.searching" class="text-muted dwell" role="status">Waiting for you to pause typing…</p>
      <p v-if="lyricsError" class="warn" role="alert">{{ lyricsError }}</p>
      <div class="toolbar">
        <label>
          Sort
          <select v-model="catalog.sortMode" aria-label="Sort results">
            <option v-for="s in sorts" :key="s.id" :value="s.id">{{ s.label }}</option>
          </select>
        </label>
        <button
          type="button"
          class="btn"
          :disabled="!catalog.selectedIds.size || stars.busy"
          @click="starSelected"
        >
          Star selected ({{ catalog.selectedIds.size }})
        </button>
        <button
          type="button"
          class="btn"
          :disabled="!catalog.selectedIds.size"
          @click="addSelectedToQueue"
        >
          Add to zip ({{ catalog.selectedIds.size }})
        </button>
        <button
          type="button"
          class="btn"
          :disabled="!catalog.selectedIds.size"
          @click="catalog.clearSelection()"
        >
          Clear
        </button>
      </div>
      <p v-if="bulkMsg" class="ok" role="status">{{ bulkMsg }}</p>
      <p v-if="stars.lastMessage" class="ok" role="status">{{ stars.lastMessage }}</p>
      <p v-if="stars.error" class="warn" role="alert">{{ stars.error }}</p>
    </header>

    <section v-if="recentTags.length && catalog.loaded" class="recent" aria-label="Recently viewed">
      <div class="recent-head">
        <h2>Recent</h2>
        <button type="button" class="clear-recent" @click="recent.clear()">Clear recent</button>
      </div>
      <ul>
        <li v-for="t in recentTags" :key="t!.id">
          <RouterLink :to="`/tag/${t!.id}`">{{ t!.title || `Tag ${t!.id}` }}</RouterLink>
        </li>
      </ul>
    </section>

    <p v-if="catalog.loading" class="text-muted" role="status">Loading catalog…</p>
    <EmptyState
      v-else-if="catalog.error"
      title="Catalog failed to load"
      :message="catalog.error"
      tone="danger"
    />
    <template v-else>
      <p class="text-muted count" aria-live="polite">
        Showing {{ catalog.results.length }} of {{ catalog.allResults.length }} matches
        <span v-if="catalog.filterCount"> · {{ catalog.filterCount }} filter{{ catalog.filterCount === 1 ? '' : 's' }}</span>
        · {{ catalog.tags.length }} in catalog
      </p>

      <nav
        v-if="showJump"
        class="jump-rail"
        aria-label="Jump to section"
      >
        <button
          v-for="key in catalog.browseWindow.jumpKeys"
          :key="key"
          type="button"
          class="jump"
          @click="jumpToSection(key)"
        >
          {{ key }}
        </button>
      </nav>

      <EmptyState
        v-if="!catalog.results.length"
        title="No matching tags"
        message="Try clearing filters or turning off Full text."
      />
      <div v-else class="list" role="listbox" aria-label="Search results" aria-multiselectable="true">
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
            role="option"
            :aria-selected="catalog.selectedIds.has(row.tag.id)"
            tabindex="0"
            @keydown="onResultKey($event, row.tag.id)"
          >
            <button
              type="button"
              class="sel-btn"
              :class="{ on: catalog.selectedIds.has(row.tag.id) }"
              :aria-pressed="catalog.selectedIds.has(row.tag.id)"
              :aria-label="`Select ${row.tag.title || row.tag.id}`"
              @click="catalog.toggleSelect(row.tag.id)"
            >
              {{ catalog.selectedIds.has(row.tag.id) ? '✓' : '' }}
            </button>
            <RouterLink :to="`/tag/${row.tag.id}`" class="row-link">
              <span class="title">
                <span class="tag-num">#{{ row.tag.id }}</span>
                <span
                  v-if="classicLabel(row.tag.classic)"
                  class="classic-num"
                  title="Classic booklet number"
                >Classic #{{ classicLabel(row.tag.classic) }}</span>
                {{ row.tag.title || `Tag ${row.tag.id}` }}
              </span>
              <span class="meta">
                <span v-if="row.tag.key">{{ row.tag.key }}</span>
                <span v-if="row.tag.arranger">{{
                  catalog.sortMode === 'arranger-last'
                    ? formatArrangerLastFirst(row.tag.arranger)
                    : row.tag.arranger
                }}</span>
                <span v-if="row.tag.year">{{ row.tag.year }}</span>
                <span v-if="row.tag.rating != null">★ {{ row.tag.rating.toFixed(2) }}</span>
                <span v-if="!row.tag.hasSheet" class="badge">No sheet</span>
                <span v-if="!row.tag.audioParts?.length" class="badge">No audio</span>
              </span>
              <span
                v-for="snip in [catalog.lyricsSnippet(row.tag.id)]"
                v-show="snip"
                :key="'ly-' + row.tag.id"
                class="lyrics-snip"
                >{{ snip }}</span
              >
            </RouterLink>
            <button
              type="button"
              class="row-star"
              :aria-pressed="stars.isStarred(row.tag.id)"
              :aria-label="stars.isStarred(row.tag.id) ? 'Unstar' : 'Star'"
              :disabled="stars.busy"
              @click="toggleRowStar(row.tag.id)"
            >
              {{ stars.isStarred(row.tag.id) ? '★' : '☆' }}
            </button>
          </div>
        </template>
        <div ref="scrollSentinel" class="scroll-sentinel" aria-hidden="true" />
        <p v-if="catalog.hasMoreResults" class="text-muted more-hint">Scroll for more…</p>
      </div>
    </template>
  </section>
</template>

<style scoped>
.hero h1 {
  font-family: var(--font-display);
  font-size: clamp(1.75rem, 6vw, 2.6rem);
  margin: 0 0 0.25rem;
}
.lede {
  color: var(--muted);
  margin: 0 0 0.85rem;
  max-width: 36rem;
}
.warn {
  color: var(--danger);
}
.ok {
  color: var(--accent);
  font-size: 0.9rem;
}
.dwell {
  font-size: 0.85rem;
  margin: 0.35rem 0 0;
}
.sticky-search {
  position: sticky;
  top: calc(var(--header-h, 3.5rem) + env(safe-area-inset-top));
  z-index: 5;
  padding: 0.35rem 0;
  background: color-mix(in srgb, var(--bg) 92%, transparent);
  backdrop-filter: blur(8px);
}
.searchrow {
  display: flex;
  gap: 0.5rem;
  align-items: center;
  margin-bottom: 0.55rem;
}
.searchrow input[type='search'] {
  flex: 1;
  min-width: 0;
  width: 100%;
  min-height: 48px;
  padding: 0.75rem 0.95rem;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface);
  font: inherit;
  font-size: 16px;
}
.clear-q {
  flex: 0 0 auto;
}
.search-hint {
  margin: 0 0 0.65rem;
  color: var(--muted);
  font-size: 0.88rem;
  line-height: 1.45;
  max-width: 42rem;
}
.search-hint code {
  font-size: 0.85em;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 0.05rem 0.3rem;
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
.toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 0.65rem;
  margin-top: 0.75rem;
  align-items: center;
}
.toolbar select {
  font: inherit;
  font-size: 16px;
  min-height: 48px;
  padding: 0.45rem 0.75rem;
  border-radius: 10px;
  border: 1px solid var(--border);
  background: var(--surface);
}
.meta-only {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.85rem;
  color: var(--muted);
  min-height: 44px;
}
.recent {
  margin: 1rem 0 0.25rem;
}
.recent-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  margin: 0 0 0.35rem;
}
.recent h2 {
  font-size: 0.95rem;
  margin: 0;
  color: var(--muted);
  font-weight: 600;
}
.clear-recent {
  min-height: 36px;
  padding: 0.25rem 0.65rem;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--muted);
  font: inherit;
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
}
.clear-recent:hover {
  color: var(--text);
  border-color: color-mix(in srgb, var(--border) 60%, var(--text));
}
.recent ul {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}
.recent a {
  display: inline-flex;
  min-height: 36px;
  align-items: center;
  padding: 0.25rem 0.65rem;
  border-radius: 999px;
  border: 1px solid var(--border);
  background: var(--surface);
  text-decoration: none;
  color: inherit;
  font-size: 0.88rem;
}
.count {
  margin: 0.75rem 0 0.35rem;
}
.list-row:focus-within {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
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
  min-width: 44px;
  min-height: 44px;
  align-self: center;
  border: 0;
  background: transparent;
  color: var(--accent);
  font-size: 1.25rem;
}
.title {
  font-weight: 600;
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
