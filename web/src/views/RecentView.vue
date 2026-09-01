<script setup lang="ts">
/**
 * Recently opened tags with sort by last visit or open count; inline favorite toggle.
 * Multi-select (Browse/Favorites-like) for favorite, collection, and zip actions.
 */
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import CollectionPickerSheet from '../components/CollectionPickerSheet.vue'
import EmptyState from '../components/EmptyState.vue'
import TagListRowContent from '../components/TagListRowContent.vue'
import TagSelectionBar from '../components/TagSelectionBar.vue'
import { useCatalogStore } from '../stores/catalog'
import { useFavoritesStore } from '../stores/favorites'
import { usePreferencesStore } from '../stores/preferences'
import { useRecentStore, type RecentSort } from '../stores/recent'
import { useQueueStore } from '../stores/queue'
import { useSnackbarStore } from '../stores/snackbar'
import { useOnline } from '../composables/useOnline'
import { tagOpenLocation } from '../lib/tagOpen'
import { applyTagReturnScrollIfAny } from '../lib/tagReturn'
import { navigateToOpticalTransfer } from '../lib/decimen/opticalTransferNav'
import { catalogOriginalPaths } from '../lib/audioTiers'
import { downloadableSheetAssets } from '../lib/sheetAssets'
import { partTrackLabel } from '../lib/parts'
import { tagDetailUrl } from '../lib/mediaUrl'
import { fetchCached } from '../lib/manualOfflineFetch'
import { sheetsPack } from '../offline/libraryPack'
import { getStarred } from '../offline/favoritesDb'
import type { PartId, TagDetail, TagSummary } from '../types/tag'

const catalog = useCatalogStore()
const favorites = useFavoritesStore()
const recent = useRecentStore()
const router = useRouter()
const prefs = usePreferencesStore()
const queue = useQueueStore()
const snackbar = useSnackbarStore()
const { offline } = useOnline()

const sorts: Array<{ id: RecentSort; label: string }> = [
  { id: 'recent', label: 'Most recent' },
  { id: 'opens', label: 'Most opens' },
]

/** Bound to persisted store sort (changing clears visit freeze). */
const sort = computed({
  get: () => recent.listSort,
  set: (v: RecentSort) => recent.setListSort(v),
})

const rows = computed(() =>
  recent.displayRecords().map((rec) => ({
    rec,
    tag: summaryForId(rec.id),
  })),
)

/** Multi-select for adding recent tags to collections. */
const selectedIds = ref<Set<number>>(new Set())
const selectMode = ref(false)
const collectionPickerOpen = ref(false)
const NARROW_SELECT_MQ = '(max-width: 639px)'
const LONG_PRESS_MS = 450
const LONG_PRESS_MOVE_PX = 10
const isNarrow = ref(false)
let narrowMq: MediaQueryList | null = null
let longPressTimer: ReturnType<typeof setTimeout> | null = null
let longPressId: number | null = null
let longPressX = 0
let longPressY = 0
let suppressRowClick = false

const selectedTagIds = computed(() => [...selectedIds.value])

const showRowSelect = computed(
  () => selectMode.value || selectedIds.value.size > 0 || !isNarrow.value,
)

function syncNarrowSelect(): void {
  isNarrow.value = narrowMq?.matches ?? false
}

function toggleSelect(id: number): void {
  const next = new Set(selectedIds.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  selectedIds.value = next
  if (next.size) selectMode.value = true
}

function summaryForId(id: number): TagSummary | null {
  return catalog.getById(id) ?? favorites.records.find((r) => r.tagId === id)?.summary ?? null
}

function selectedSummaries(): TagSummary[] {
  return selectedTagIds.value
    .map((id) => summaryForId(id))
    .filter((x): x is TagSummary => !!x)
}

function clearSelection(): void {
  selectedIds.value = new Set()
  selectMode.value = false
}

function selectRowTip(title: string, tagId: number): string {
  const name = title || `tag #${tagId}`
  return selectedIds.value.has(tagId)
    ? `Deselect ${name}`
    : `Select ${name} for bulk favorite or zip`
}

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
  if (t?.closest('.sel-btn, .row-fav, .row-remove')) return
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
    if (!selectedIds.value.has(tagId)) toggleSelect(tagId)
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

/** Tag metadata for queueing — Cache API, sheets pack, or favorites detail. */
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
    /* try favorites IndexedDB */
  }
  const starred = await getStarred(id)
  return starred?.detail ?? null
}

async function addSelectedToQueue(): Promise<void> {
  let ok = 0
  let skipped = 0
  for (const id of selectedIds.value) {
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

function transferSelectedOptically(): void {
  if (!selectedIds.value.size) return
  navigateToOpticalTransfer(router, {
    tagIds: selectedTagIds.value,
    name: 'Recent',
  })
}

async function starSelected(): Promise<void> {
  void favorites.starMany(selectedSummaries(), { metadataOnly: false })
}

async function favoriteSelectedToCollection(
  _collectionId: string,
  collectionName: string,
): Promise<void> {
  const summaries = selectedSummaries()
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
  clearSelection()
  collectionPickerOpen.value = false
}

watch(
  () => selectedIds.value.size,
  (n) => {
    if (n === 0) selectMode.value = false
  },
)

watch(
  () => recent.displayRecords().map((r) => r.id).join(','),
  () => {
    const alive = new Set(recent.displayRecords().map((r) => r.id))
    const next = new Set([...selectedIds.value].filter((id) => alive.has(id)))
    if (next.size !== selectedIds.value.size) selectedIds.value = next
  },
)

onMounted(async () => {
  narrowMq = window.matchMedia(NARROW_SELECT_MQ)
  syncNarrowSelect()
  narrowMq.addEventListener('change', syncNarrowSelect)
  await Promise.all([catalog.load(), favorites.ensureLoaded()])
  applyTagReturnScrollIfAny()
})

onUnmounted(() => {
  clearLongPressTimer()
  narrowMq?.removeEventListener('change', syncNarrowSelect)
  narrowMq = null
})

function formatWhen(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: d.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined,
    hour: 'numeric',
    minute: '2-digit',
  })
}

function toggleRowStar(summary: TagSummary): void {
  void favorites.toggle(summary, null, { metadataOnly: false })
}

function rowStarTip(tag: TagSummary): string {
  if (favorites.isTagCaching(tag.id)) {
    return favorites.tagCachingLabel(tag.id) || 'Caching for offline'
  }
  return favorites.isStarred(tag.id) ? 'Unfavorite' : 'Favorite'
}

function rowStarLabel(tag: TagSummary): string {
  if (favorites.isTagCaching(tag.id)) return 'Caching for offline'
  return favorites.isStarred(tag.id) ? 'Unfavorite' : 'Favorite'
}
</script>

<template>
  <section
    class="recent-page"
    :class="{ 'has-selection': selectedIds.size }"
    aria-label="Recent tags"
  >
    <p v-if="catalog.loading && !catalog.loaded" class="muted intro" role="status">
      Loading catalog…
    </p>

    <div class="toolbar">
      <label class="sort-field">
        <span class="sort-lbl">Sort</span>
        <select v-model="sort" aria-label="Sort recent tags">
          <option v-for="s in sorts" :key="s.id" :value="s.id">{{ s.label }}</option>
        </select>
      </label>
      <button v-if="recent.count" type="button" class="btn btn-ghost" @click="recent.clear()">
        Clear all
      </button>
    </div>

    <EmptyState
      v-if="!recent.count"
      title="No recent tags yet"
      message="Open tags from Browse or Recent — they will show up here with how often you visit them."
    />
    <ul v-else class="list">
      <li
        v-for="{ rec, tag } in rows"
        :key="rec.id"
        class="list-row"
        :class="{ 'show-select': showRowSelect && tag }"
        @pointerdown="tag && onRowPointerDown($event, rec.id)"
        @pointermove="onRowPointerMove"
        @pointerup="onRowPointerEnd"
        @pointercancel="onRowPointerEnd"
        @click.capture="onRowClickCapture"
      >
        <button
          v-if="showRowSelect && tag"
          type="button"
          class="sel-btn"
          :class="{ on: selectedIds.has(rec.id) }"
          :aria-pressed="selectedIds.has(rec.id)"
          :aria-label="`Select ${tag.title || rec.id}`"
          :title="selectRowTip(tag.title || '', rec.id)"
          @click.stop="toggleSelect(rec.id)"
        >
          {{ selectedIds.has(rec.id) ? '✓' : '' }}
        </button>
        <RouterLink
          v-if="tag"
          :to="tagOpenLocation(rec.id, { fullscreen: prefs.singMode })"
          class="row-link"
          @click="
            (e) => {
              if (suppressRowClick) e.preventDefault()
              else recent.markBrowseNavigation(rec.id)
            }
          "
        >
          <TagListRowContent :tag="tag">
            <template #extra-meta>
              <span>{{ rec.opens }} open{{ rec.opens === 1 ? '' : 's' }}</span>
              <span>{{ formatWhen(rec.lastOpenedAt) }}</span>
            </template>
          </TagListRowContent>
        </RouterLink>
        <div v-else-if="catalog.loaded" class="row-link missing">
          <span class="title">#{{ rec.id }}</span>
          <span class="meta muted">Not in catalog</span>
        </div>
        <div v-else class="row-link missing">
          <span class="title">#{{ rec.id }}</span>
          <span class="meta muted">Loading…</span>
        </div>
        <button
          v-if="tag"
          type="button"
          class="row-fav"
          :aria-pressed="favorites.isStarred(tag.id)"
          :aria-busy="favorites.isTagCaching(tag.id)"
          :aria-label="rowStarLabel(tag)"
          :title="rowStarTip(tag)"
          @click.stop="toggleRowStar(tag)"
        >
          <span
            v-if="favorites.isTagCaching(tag.id)"
            class="row-fav-spinner"
            aria-hidden="true"
          />
          <span v-else>{{ favorites.isStarred(tag.id) ? '♥' : '♡' }}</span>
        </button>
        <button
          type="button"
          class="row-remove"
          :aria-label="`Remove ${tag?.title || `tag #${rec.id}`} from recent`"
          title="Remove from recent"
          @click.stop="recent.remove(rec.id)"
        >
          ×
        </button>
      </li>
    </ul>

    <CollectionPickerSheet
      :open="collectionPickerOpen"
      :tag-ids="selectedTagIds"
      title="Add to collection"
      @close="collectionPickerOpen = false"
      @done="favoriteSelectedToCollection"
    />

    <TagSelectionBar
      :count="selectedIds.size"
      toolbar-label="Selected recent tags"
      @favorite="starSelected"
      @collection="collectionPickerOpen = true"
      @optical="transferSelectedOptically"
      @zip="addSelectedToQueue"
      @clear="clearSelection"
    />
  </section>
</template>

<style scoped>
.recent-page.has-selection {
  padding-bottom: 5.5rem;
}
.intro {
  color: var(--muted);
  margin: 0 0 1rem;
  max-width: 36rem;
  line-height: 1.45;
}
.toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.65rem;
  margin-bottom: 0.65rem;
}
.sort-field {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  font-size: 0.9rem;
  color: var(--muted);
}
.sort-field select {
  font: inherit;
  min-height: 40px;
  padding: 0.35rem 0.55rem;
  border-radius: 10px;
  border: 1px solid var(--border);
  background: var(--surface);
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
  grid-template-columns: 1fr auto auto;
  gap: 0.35rem;
  align-items: center;
  padding: 0.45rem 0.35rem;
  border-radius: var(--radius);
  background: var(--surface);
  border: 1px solid transparent;
}
.list-row.show-select {
  grid-template-columns: auto 1fr auto auto;
}
.list-row:not(:has(.row-fav)) {
  grid-template-columns: 1fr auto;
}
.list-row.show-select:not(:has(.row-fav)) {
  grid-template-columns: auto 1fr auto;
}
.list-row:focus-within {
  border-color: var(--border);
}
.sel-btn {
  position: relative;
  z-index: 1;
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  align-self: center;
  min-width: 44px;
  min-height: 44px;
  width: 44px;
  padding: 0;
  margin: 0;
  border-radius: 10px;
  border: 1px solid var(--border);
  background: color-mix(in srgb, var(--surface) 88%, var(--bg));
  font: inherit;
  font-size: 1.15rem;
  font-weight: 700;
  line-height: 1;
  color: var(--accent);
  cursor: pointer;
}
.sel-btn.on {
  background: color-mix(in srgb, var(--accent) 18%, var(--surface));
  border-color: var(--accent);
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
.row-link.missing {
  color: var(--muted);
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
.row-remove {
  z-index: 1;
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 44px;
  min-height: 44px;
  align-self: center;
  border: 0;
  background: transparent;
  color: var(--muted);
  font-size: 1.5rem;
  line-height: 1;
  cursor: pointer;
}
.row-remove:hover {
  color: var(--danger, #b42318);
}
.row-fav[aria-busy='true'] {
  color: var(--muted);
}
.row-fav-spinner {
  display: block;
  width: 1.1rem;
  height: 1.1rem;
  margin: 0 auto;
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
</style>
