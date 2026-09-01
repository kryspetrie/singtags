<script setup lang="ts">
/**
 * Favorites list: sort/reorder, collections, practice set, backup import/export,
 * and bulk unfavorite with confirm dialog.
 */
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import EmptyState from '../components/EmptyState.vue'
import OfflineOpticalTransferPrompt from '../components/OfflineOpticalTransferPrompt.vue'
import FilterSheet from '../components/FilterSheet.vue'
import CollectionPickerSheet from '../components/CollectionPickerSheet.vue'
import CollectionsManageSheet from '../components/CollectionsManageSheet.vue'
import FavoritesShareSheet from '../components/FavoritesShareSheet.vue'
import CustomCollectionMark from '../components/CustomCollectionMark.vue'
import ConfirmDialog from '../components/ConfirmDialog.vue'
import TagListRowContent from '../components/TagListRowContent.vue'
import TagSelectionBar from '../components/TagSelectionBar.vue'
import type { TagSummary } from '../types/tag'
import { useFavoritesStore } from '../stores/favorites'
import { useCatalogStore } from '../stores/catalog'
import { usePracticeStore } from '../stores/practice'
import { useUserCollectionsStore } from '../stores/userCollections'
import { buildFavoritesBackup, parseFavoritesBackup } from '../lib/favoritesBackup'
import { downloadBlob } from '../download/zip'
import { useOnline } from '../composables/useOnline'
import { useTwoRowStripPaging } from '../composables/useTwoRowStripPaging'
import { useSortableListDrag } from '../composables/useSortableListDrag'
import {
  decodeFavoritesSharePayload,
  favoritesSharePath,
  parseTagIdList,
  type FavoritesSharePayload,
} from '../lib/favoritesShare'
import { applyTagReturnScrollIfAny } from '../lib/tagReturn'
import { navigateToOpticalTransfer } from '../lib/decimen/opticalTransferNav'
import {
  FAVORITES_SORT_OPTIONS,
  type FavoritesSortMode,
  sortFavoriteRecords,
} from '../lib/favoritesSort'
import { useOfflineLibraryStore } from '../stores/offlineLibrary'
import { usePreferencesStore } from '../stores/preferences'
import { useQueueStore } from '../stores/queue'
import { useSnackbarStore } from '../stores/snackbar'
import { tagOpenLocation } from '../lib/tagOpen'
import { catalogOriginalPaths } from '../lib/audioTiers'
import { downloadableSheetAssets } from '../lib/sheetAssets'
import { partTrackLabel } from '../lib/parts'
import { tagDetailUrl } from '../lib/mediaUrl'
import { fetchCached } from '../lib/manualOfflineFetch'
import { sheetsPack } from '../offline/libraryPack'
import { getStarred } from '../offline/favoritesDb'
import type { PartId, TagDetail } from '../types/tag'

const favorites = useFavoritesStore()
const catalog = useCatalogStore()
const practice = usePracticeStore()
const userCollections = useUserCollectionsStore()
const offlineLibrary = useOfflineLibraryStore()
const prefs = usePreferencesStore()
const queue = useQueueStore()
const snackbar = useSnackbarStore()
const route = useRoute()

function rowTag(tagId: number, summary: TagSummary): TagSummary {
  return catalog.getById(tagId) ?? summary
}
const router = useRouter()
const { offline } = useOnline()
const fileInput = ref<HTMLInputElement | null>(null)
const fetchMediaOnImport = ref(false)
const backupOpen = ref(false)
const manageOpen = ref(false)
const moreMenuOpen = ref(false)
const moreMenuRef = ref<HTMLElement | null>(null)
const collectionPickerOpen = ref(false)
const tagIdsOpen = ref(false)
const shareOpen = ref(false)
const shareUrl = ref('')
const tagIdText = ref('')
const tagIdNotice = ref<string | null>(null)
const pendingImport = ref<FavoritesSharePayload | null>(null)
const importFetchMedia = ref(true)
const activeCollectionId = ref<string | null>(null)
const pendingUnfavorite = ref<{ tagId: number; title: string } | null>(null)
const sortMode = ref<FavoritesSortMode>('custom')
const sortOptions = FAVORITES_SORT_OPTIONS

/** Browse-like multi-select for adding favorites to collections. */
const selectedIds = ref<Set<number>>(new Set())
const selectMode = ref(false)
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

const orderedRecords = computed(() => {
  const byId = new Map(favorites.records.map((r) => [r.tagId, r]))
  const colId = activeCollectionId.value
  if (colId) {
    const colIds = userCollections.byId(colId)?.tagIds ?? []
    const members = colIds.map((id) => byId.get(id)).filter(Boolean)
    if (sortMode.value === 'custom') return members
    return sortFavoriteRecords(
      members as NonNullable<(typeof members)[number]>[],
      sortMode.value,
    )
  }
  if (sortMode.value === 'custom') {
    return practice.order.map((id) => byId.get(id)).filter(Boolean)
  }
  return sortFavoriteRecords(favorites.records, sortMode.value)
})

const {
  dragActive,
  onHandlePointerDown,
  onDragEnter,
  rowDragClass,
  listDraggingClass,
} = useSortableListDrag<number>({
  rowSelector: 'li.favorites-row',
  onReorder: (tagId, toIndex) => {
    const colId = activeCollectionId.value
    const ids = orderedRecords.value.map((r) => r!.tagId)
    if (sortMode.value !== 'custom') {
      if (colId) userCollections.setTagOrder(colId, ids)
      else practice.resetFromStarred(ids)
      sortMode.value = 'custom'
    }
    if (colId) userCollections.reorderTag(colId, tagId, toIndex)
    else practice.reorder(tagId, toIndex)
  },
})

/** Store order (reorder modal); not A–Z. */
const collectionChips = computed(() => userCollections.collections)

const collectionStripHost = ref<HTMLElement | null>(null)
const collectionMeasureEl = ref<HTMLElement | null>(null)

const {
  page: collectionPage,
  showPager: showCollectionPager,
  pageCount: collectionPageCount,
  pagedItems: pagedCollectionChips,
  pageForIndex: collectionPageForIndex,
} = useTwoRowStripPaging(collectionChips, {
  hostEl: collectionStripHost,
  measureEl: collectionMeasureEl,
})

watch(
  () => activeCollectionId.value,
  (id) => {
    if (!id || !showCollectionPager.value) return
    const idx = collectionChips.value.findIndex((c) => c.id === id)
    if (idx < 0) return
    collectionPage.value = collectionPageForIndex(idx)
  },
)

const activeCollection = computed(() =>
  activeCollectionId.value ? userCollections.byId(activeCollectionId.value) : null,
)

const selectedTagIds = computed(() => [...selectedIds.value])

const showRowSelect = computed(
  () => selectMode.value || selectedIds.value.size > 0 || !isNarrow.value,
)

const canApplySort = computed(() => favorites.count > 0 && sortMode.value !== 'custom')

/** Collections that include this tag (for at-a-glance membership). */
function collectionsForTag(tagId: number) {
  return collectionChips.value.filter((c) => c.tagIds.includes(tagId))
}

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

function clearSelection(): void {
  selectedIds.value = new Set()
  selectMode.value = false
}

function selectRowTip(title: string, tagId: number): string {
  const name = title || `tag #${tagId}`
  return selectedIds.value.has(tagId)
    ? `Deselect ${name}`
    : `Select ${name} for bulk collection or zip`
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
  if (t?.closest('.sel-btn, .row-fav, .drag-handle, .row-remove')) return
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

/** Tag metadata for queueing — in-memory favorite, cache, pack, or IndexedDB detail. */
async function loadTagDetailForQueue(id: number): Promise<TagDetail | null> {
  const rec = favorites.records.find((r) => r.tagId === id)
  if (rec?.detail) return rec.detail
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
    name: activeCollection.value?.name ?? 'Favorites',
  })
}

function removeSelectedFromActiveCollection(): void {
  const colId = activeCollectionId.value
  if (!colId || !selectedIds.value.size) return
  userCollections.removeTags(colId, [...selectedIds.value])
  clearSelection()
}

watch(
  () => selectedIds.value.size,
  (n) => {
    if (n === 0) selectMode.value = false
  },
)

watch(
  () => favorites.records.map((r) => r.tagId).join(','),
  () => {
    const alive = new Set(favorites.records.map((r) => r.tagId))
    const next = new Set([...selectedIds.value].filter((id) => alive.has(id)))
    if (next.size !== selectedIds.value.size) selectedIds.value = next
  },
)

watch(
  () => favorites.records.map((r) => r.tagId),
  (ids) => userCollections.pruneToStarred(ids),
)

watch(
  () => userCollections.collections.map((c) => c.id).join(','),
  () => {
    const id = activeCollectionId.value
    if (id && !userCollections.byId(id)) activeCollectionId.value = null
  },
)

onMounted(async () => {
  narrowMq = window.matchMedia(NARROW_SELECT_MQ)
  syncNarrowSelect()
  narrowMq.addEventListener('change', syncNarrowSelect)
  void offlineLibrary.refreshCacheReady().catch(() => undefined)
  await favorites.ensureLoaded()
  practice.syncFromStarred(favorites.records.map((r) => r.tagId))
  const rawImport = Array.isArray(route.query.import) ? route.query.import[0] : route.query.import
  if (typeof rawImport === 'string') {
    const decoded = decodeFavoritesSharePayload(rawImport)
    if (decoded?.tagIds.length) {
      pendingImport.value = decoded
    } else {
      favorites.error = 'This favorites share link is invalid.'
      await clearImportQuery()
    }
  }
  // Back-from-tag: restore scroll where the row was clicked.
  applyTagReturnScrollIfAny()
})

onUnmounted(() => {
  clearLongPressTimer()
  document.removeEventListener('pointerdown', onMoreMenuDocPointer)
  narrowMq?.removeEventListener('change', syncNarrowSelect)
  narrowMq = null
})

watch(
  () => favorites.records.map((r) => r.tagId).join(','),
  () => {
    practice.syncFromStarred(favorites.records.map((r) => r.tagId))
  },
)

function downloadStarredFile(): void {
  const data = buildFavoritesBackup({
    records: favorites.records,
    collections: userCollections.exportSnapshot(),
    practice: practice.exportSnapshot(),
  })
  const bytes = new TextEncoder().encode(JSON.stringify(data, null, 2))
  downloadBlob(bytes, 'favorites.tags', 'application/json')
}

async function onImportFile(e: Event): Promise<void> {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  try {
    const text = await file.text()
    const backup = parseFavoritesBackup(JSON.parse(text))
    await favorites.importFromJson(backup.starred, fetchMediaOnImport.value && !offline.value)
    userCollections.replaceAll(backup.collections)
    practice.importSnapshot(backup.practice)
    backupOpen.value = false
  } catch (err) {
    favorites.error = err instanceof Error ? err.message : String(err)
  } finally {
    input.value = ''
  }
}

function applySort(): void {
  if (sortMode.value === 'custom') return
  const ids = orderedRecords.value.map((r) => r!.tagId)
  const colId = activeCollectionId.value
  if (colId) userCollections.setTagOrder(colId, ids)
  else practice.resetFromStarred(ids)
  sortMode.value = 'custom'
}

function selectCollection(id: string | null): void {
  activeCollectionId.value = id
}

function onManageCollectionCreated(id: string): void {
  activeCollectionId.value = id
}

function onManageCollectionDeleted(id: string): void {
  if (activeCollectionId.value === id) activeCollectionId.value = null
}

function removeFromActiveCollection(tagId: number): void {
  const colId = activeCollectionId.value
  if (!colId) return
  userCollections.removeTags(colId, [tagId])
}

function onAddedToCollection(_id: string, name: string): void {
  favorites.lastNotice = { type: 'text', message: `Added to “${name}”` }
  clearSelection()
}

function collectionIdsForTag(tagId: number): string[] {
  return userCollections.collections.filter((c) => c.tagIds.includes(tagId)).map((c) => c.id)
}

/** Whether unfavoriting should show the multi-collection confirm dialog. */
function unfavoriteNeedsConfirm(tagId: number): boolean {
  const memberIds = collectionIdsForTag(tagId)
  if (!memberIds.length) return false
  const active = activeCollectionId.value
  return !(active && memberIds.length === 1 && memberIds[0] === active)
}

function unfavoriteConfirmMessage(title: string, tagId: number): string {
  const label = title || `tag #${tagId}`
  return `“${label}” will be removed from your favorites and from every collection.`
}

const pendingUnfavoriteMessage = computed(() => {
  const pending = pendingUnfavorite.value
  if (!pending) return ''
  return unfavoriteConfirmMessage(pending.title, pending.tagId)
})

function requestUnfavorite(tagId: number, title: string): void {
  if (unfavoriteNeedsConfirm(tagId)) {
    pendingUnfavorite.value = { tagId, title }
    return
  }
  void favorites.unstar(tagId)
}

async function confirmPendingUnfavorite(): Promise<void> {
  const pending = pendingUnfavorite.value
  pendingUnfavorite.value = null
  if (!pending) return
  await favorites.unstar(pending.tagId)
}

function rowStarTip(title: string, tagId: number): string {
  if (favorites.isTagCaching(tagId)) {
    return favorites.tagCachingLabel(tagId) || 'Saving for offline…'
  }
  const memberIds = collectionIdsForTag(tagId)
  const active = activeCollectionId.value
  if (active && memberIds.length === 1 && memberIds[0] === active) {
    return `Unfavorite ${title || `tag #${tagId}`} — removes from favorites and this collection`
  }
  if (memberIds.length) {
    return `Unfavorite ${title || `tag #${tagId}`} — removes from favorites and all collections`
  }
  return `Unfavorite ${title || `tag #${tagId}`} — remove from saved tags`
}

function rowStarLabel(title: string, tagId: number): string {
  if (favorites.isTagCaching(tagId)) return 'Saving for offline'
  return `Unfavorite ${title || `tag #${tagId}`}`
}

function openShare(): void {
  const ids = orderedRecords.value.map((record) => record!.tagId)
  const path = favoritesSharePath(ids, activeCollection.value?.name)
  shareUrl.value = new URL(path, window.location.origin).toString()
  shareOpen.value = true
}

async function addTagIds(tagIds: number[], collectionName?: string): Promise<void> {
  if (!catalog.loaded) await catalog.load()
  const summaries = tagIds
    .map((id) => catalog.getById(id))
    .filter((summary): summary is NonNullable<typeof summary> => !!summary)
  const knownIds = new Set(summaries.map((summary) => summary.id))
  const alreadyFavoriteIds = tagIds.filter((id) => favorites.isStarred(id))
  const importable = summaries.filter((summary) => !favorites.isStarred(summary.id))
  const metadataOnly = !(importFetchMedia.value && !offline.value)
  const added = await favorites.starMany(importable, { metadataOnly })
  const collectionIds = [...new Set([...alreadyFavoriteIds, ...summaries.map((s) => s.id)])]
  if (collectionName && collectionIds.length) {
    const existing = userCollections.collections.find(
      (c) => c.name.trim().toLowerCase() === collectionName.trim().toLowerCase(),
    )
    if (existing) {
      userCollections.addTags(existing.id, collectionIds)
    } else {
      userCollections.create(collectionName, collectionIds)
    }
  }
  const missing = tagIds.filter((id) => !knownIds.has(id) && !favorites.isStarred(id)).length
  tagIdNotice.value = `Added ${added} favorite${added === 1 ? '' : 's'}${missing ? `; ${missing} tag${missing === 1 ? '' : 's'} not found` : ''}${metadataOnly ? ' (metadata only — enable “Download media” when online to sing offline).' : ''}.`
}

async function addFromTagIds(): Promise<void> {
  const tagIds = parseTagIdList(tagIdText.value)
  if (!tagIds.length) {
    tagIdNotice.value = 'Enter at least one positive tag number.'
    return
  }
  await addTagIds(tagIds)
  tagIdText.value = ''
}

function openTagIdsAdd(): void {
  tagIdNotice.value = null
  tagIdsOpen.value = true
}

function closeMoreMenu(): void {
  moreMenuOpen.value = false
}

function openBackupFromMenu(): void {
  closeMoreMenu()
  backupOpen.value = true
}

function openBulkAddFromMenu(): void {
  closeMoreMenu()
  openTagIdsAdd()
}

function onMoreMenuDocPointer(e: PointerEvent): void {
  if (!moreMenuOpen.value) return
  const root = moreMenuRef.value
  if (root && !root.contains(e.target as Node)) closeMoreMenu()
}

watch(moreMenuOpen, (open) => {
  if (open) document.addEventListener('pointerdown', onMoreMenuDocPointer)
  else document.removeEventListener('pointerdown', onMoreMenuDocPointer)
})

function closeTagIdsAdd(): void {
  tagIdsOpen.value = false
  tagIdNotice.value = null
}

async function clearImportQuery(): Promise<void> {
  const { import: _import, ...query } = route.query
  await router.replace({ query })
}

async function closeImport(): Promise<void> {
  pendingImport.value = null
  await clearImportQuery()
}

async function confirmImport(): Promise<void> {
  const shared = pendingImport.value
  pendingImport.value = null
  if (!shared) return
  await addTagIds(shared.tagIds, shared.name)
  await clearImportQuery()
}
</script>

<template>
  <section
    class="favorites"
    :class="{ 'has-selection': selectedIds.size }"
    aria-label="Favorites"
  >
    <div class="actions">
      <button type="button" class="btn" @click="manageOpen = true">Manage collections</button>
      <button type="button" class="btn" :disabled="!orderedRecords.length" @click="openShare">
        Share
      </button>
      <div ref="moreMenuRef" class="more-menu-wrap">
        <button
          type="button"
          class="btn more-menu-btn"
          aria-haspopup="menu"
          :aria-expanded="moreMenuOpen"
          aria-label="More favorites actions"
          title="More actions"
          @click="moreMenuOpen = !moreMenuOpen"
        >
          <svg class="more-menu-icon" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
            <circle cx="12" cy="5" r="2" fill="currentColor" />
            <circle cx="12" cy="12" r="2" fill="currentColor" />
            <circle cx="12" cy="19" r="2" fill="currentColor" />
          </svg>
        </button>
        <div v-if="moreMenuOpen" class="more-menu" role="menu" aria-label="More favorites actions">
          <button type="button" role="menuitem" class="more-menu-item" @click="openBackupFromMenu">
            Backup &amp; restore
          </button>
          <button type="button" role="menuitem" class="more-menu-item" @click="openBulkAddFromMenu">
            Bulk add
          </button>
        </div>
      </div>
    </div>

    <div class="collection-bar" role="toolbar" aria-label="Favorite collections">
      <button
        type="button"
        class="chip"
        :class="{ on: !activeCollectionId }"
        :aria-pressed="!activeCollectionId"
        @click="selectCollection(null)"
      >
        All
      </button>
      <div class="collection-strip" :class="{ paged: showCollectionPager }">
        <button
          v-if="showCollectionPager"
          type="button"
          class="collection-strip-nav"
          :disabled="collectionPage <= 0"
          aria-label="Previous collections"
          @click="collectionPage -= 1"
        >
          <span aria-hidden="true">‹</span>
        </button>
        <div ref="collectionStripHost" class="collection-strip-body">
          <div ref="collectionMeasureEl" class="collection-measure" aria-hidden="true">
            <span v-for="c in collectionChips" :key="c.id" class="chip">
              <CustomCollectionMark />
              {{ c.name }}
              <span class="chip-n">{{ c.tagIds.length }}</span>
            </span>
          </div>
          <div class="collection-page" aria-label="Collection page">
            <button
              v-for="c in pagedCollectionChips"
              :key="c.id"
              type="button"
              class="chip"
              :class="{ on: activeCollectionId === c.id }"
              :aria-pressed="activeCollectionId === c.id"
              @click="selectCollection(c.id)"
            >
              <CustomCollectionMark />
              {{ c.name }}
              <span class="chip-n">{{ c.tagIds.length }}</span>
            </button>
          </div>
        </div>
        <button
          v-if="showCollectionPager"
          type="button"
          class="collection-strip-nav"
          :disabled="collectionPage >= collectionPageCount - 1"
          aria-label="Next collections"
          @click="collectionPage += 1"
        >
          <span aria-hidden="true">›</span>
        </button>
        <span v-if="showCollectionPager" class="sr">
          Page {{ collectionPage + 1 }} of {{ collectionPageCount }}
        </span>
      </div>
    </div>

    <div
      v-if="favorites.loaded && favorites.count"
      class="results-meta"
      aria-live="polite"
    >
      <div class="text-muted count">
        <template v-if="activeCollection">
          {{ orderedRecords.length }} in “{{ activeCollection.name }}”
        </template>
        <template v-else>{{ favorites.count }} favorite{{ favorites.count === 1 ? '' : 's' }}</template>
      </div>
      <div class="sort-controls">
        <label class="sort-field" title="Choose how favorites are ordered">
          <span class="sort-lbl">View by</span>
          <select
            v-model="sortMode"
            aria-label="View favorites by"
            :disabled="!favorites.count"
            @change="($event.target as HTMLSelectElement).blur()"
          >
            <option v-for="s in sortOptions" :key="s.id" :value="s.id">{{ s.label }}</option>
          </select>
        </label>
        <button
          type="button"
          class="sort-apply"
          :disabled="!canApplySort"
          title="Apply this order as your custom list (replaces drag order)"
          aria-label="Apply view order as custom order"
          @click="applySort"
        >
          <span aria-hidden="true">✓</span>
        </button>
      </div>
    </div>

    <div v-if="favorites.progress" class="progress" role="status">
      <div class="bar" :style="{ width: `${Math.round(favorites.progress.ratio * 100)}%` }" />
      <span>{{ favorites.progress.label }}</span>
    </div>

    <p v-if="!favorites.loaded" class="text-muted" role="status">Loading favorites…</p>
    <EmptyState
      v-else-if="!favorites.records.length"
      title="No favorites yet"
      :message="
        offline
          ? 'Favorite tags from Browse, receive sheets optically from another device, or import a backup.'
          : 'Favorite from Browse or a tag page to save for quick recall and offline use.'
      "
    >
      <OfflineOpticalTransferPrompt v-if="offline" />
    </EmptyState>
    <EmptyState
      v-else-if="!orderedRecords.length && activeCollection"
      title="Nothing in this collection"
      message="Select favorites with the checkboxes, then use Add to collection — or pick another collection."
    />

    <ol
      v-else-if="orderedRecords.length"
      class="list"
      :class="[{ 'has-selection': selectedIds.size }, listDraggingClass]"
      aria-label="Favorites"
    >
      <li
        v-for="(r, i) in orderedRecords"
        :key="r!.tagId"
        class="favorites-row"
        :data-index="i"
        :class="{
          'show-select': showRowSelect,
          'no-nav': dragActive,
          ...rowDragClass(r!.tagId, i),
        }"
        @pointerenter="onDragEnter($event, i)"
        @pointerdown="onRowPointerDown($event, r!.tagId)"
        @pointermove="onRowPointerMove"
        @pointerup="onRowPointerEnd"
        @pointercancel="onRowPointerEnd"
        @click.capture="onRowClickCapture"
      >
        <button
          type="button"
          class="drag-handle"
          :aria-label="`Drag ${r!.summary.title || r!.tagId} to reorder`"
          aria-roledescription="sortable"
          @pointerdown="onHandlePointerDown($event, r!.tagId, i)"
        >
          ⠿
        </button>
        <button
          v-if="showRowSelect"
          type="button"
          class="sel-btn"
          :class="{ on: selectedIds.has(r!.tagId) }"
          :aria-pressed="selectedIds.has(r!.tagId)"
          :aria-label="`Select ${r!.summary.title || r!.tagId}`"
          :title="selectRowTip(r!.summary.title || '', r!.tagId)"
          @click.stop="toggleSelect(r!.tagId)"
        >
          {{ selectedIds.has(r!.tagId) ? '✓' : '' }}
        </button>
        <div class="row-main">
          <RouterLink
            :to="tagOpenLocation(r!.tagId, { fullscreen: prefs.singMode })"
            class="row-link"
            @click="(dragActive || suppressRowClick) && $event.preventDefault()"
          >
            <TagListRowContent :tag="rowTag(r!.tagId, r!.summary)" />
          </RouterLink>
          <div
            v-if="collectionsForTag(r!.tagId).length"
            class="row-cols"
            role="group"
            :aria-label="`Collections for ${r!.summary.title || r!.tagId}`"
          >
            <button
              v-for="c in collectionsForTag(r!.tagId)"
              :key="c.id"
              type="button"
              class="col-chip"
              :class="{ on: activeCollectionId === c.id }"
              :aria-pressed="activeCollectionId === c.id"
              :title="
                activeCollectionId === c.id
                  ? `Showing “${c.name}” — tap to show all favorites`
                  : `Show only “${c.name}”`
              "
              :aria-label="
                activeCollectionId === c.id
                  ? `Clear filter for collection ${c.name}`
                  : `Filter favorites to collection ${c.name}`
              "
              @click="selectCollection(activeCollectionId === c.id ? null : c.id)"
            >
              <CustomCollectionMark />
              {{ c.name }}
            </button>
          </div>
        </div>
        <div class="row-actions">
          <button
            type="button"
            class="row-fav"
            :aria-pressed="true"
            :aria-busy="favorites.isTagCaching(r!.tagId)"
            :aria-label="rowStarLabel(r!.summary.title || '', r!.tagId)"
            :title="rowStarTip(r!.summary.title || '', r!.tagId)"
            @click.stop="requestUnfavorite(r!.tagId, r!.summary.title || '')"
          >
            <span
              v-if="favorites.isTagCaching(r!.tagId)"
              class="row-fav-spinner"
              aria-hidden="true"
            />
            <span v-else>♥</span>
          </button>
          <button
            v-if="activeCollectionId"
            type="button"
            class="row-remove"
            :aria-label="`Remove ${r!.summary.title || `tag #${r!.tagId}`} from ${activeCollection?.name ?? 'collection'}`"
            title="Remove from this collection only — keeps it favorited"
            @click.stop="removeFromActiveCollection(r!.tagId)"
          >
            ×
          </button>
        </div>
      </li>
    </ol>

    <FilterSheet :open="backupOpen" title="Backup & restore" @close="backupOpen = false">
      <div class="backup">
        <p class="backup-desc">
          Your favorites and custom collections live in this browser only. <strong>Backup</strong> downloads a
          <code>favorites.tags</code> file with favorited tags, collection membership, and practice order.
          <strong>Restore</strong> replaces favorites and collections on this device from that file.
          Optionally fetch sheet and audio media during restore so tags work offline right away.
        </p>
        <div class="backup-actions">
          <span
            class="backup-tip"
            :title="
              favorites.count
                ? undefined
                : 'Favorite at least one tag before backing up — there’s nothing to export yet.'
            "
          >
            <button
              type="button"
              class="primary"
              :disabled="!favorites.count"
              :aria-disabled="!favorites.count"
              @click="downloadStarredFile"
            >
              Backup favorites &amp; collections
            </button>
          </span>
          <button type="button" @click="fileInput?.click()">Restore from file…</button>
          <button
            type="button"
            class="toggle-btn"
            :class="{ on: fetchMediaOnImport }"
            :aria-pressed="fetchMediaOnImport"
            :disabled="offline"
            @click="fetchMediaOnImport = !fetchMediaOnImport"
          >
            Fetch media on restore
          </button>
        </div>
        <input
          ref="fileInput"
          type="file"
          accept=".tags,application/json,.json"
          class="sr"
          @change="onImportFile"
        />
      </div>
    </FilterSheet>

    <FilterSheet :open="tagIdsOpen" title="Bulk add" @close="closeTagIdsAdd">
      <div class="tag-id-add-panel">
        <p>Paste barbershop tag numbers to favorite them from the catalog.</p>
        <label for="favorite-tag-ids">Tag numbers (separated by commas or spaces)</label>
        <textarea
          id="favorite-tag-ids"
          v-model="tagIdText"
          rows="4"
          placeholder="123, 456 789"
        />
        <label v-if="!offline" class="tag-id-media">
          <input v-model="importFetchMedia" type="checkbox" />
          Download media now (for offline singing)
        </label>
        <div class="tag-id-actions">
          <button type="button" class="primary" @click="addFromTagIds">Add favorites</button>
        </div>
        <p v-if="tagIdNotice" role="status">{{ tagIdNotice }}</p>
      </div>
    </FilterSheet>

    <FavoritesShareSheet
      :open="shareOpen"
      :url="shareUrl"
      :tag-count="orderedRecords.length"
      :tag-ids="orderedRecords.map((record) => record!.tagId)"
      :collection-id="activeCollectionId"
      :title="activeCollection?.name"
      @close="shareOpen = false"
    />

    <CollectionPickerSheet
      :open="collectionPickerOpen"
      :tag-ids="selectedTagIds"
      title="Add to collection"
      @close="collectionPickerOpen = false"
      @done="onAddedToCollection"
    />
    <CollectionsManageSheet
      :open="manageOpen"
      @close="manageOpen = false"
      @created="onManageCollectionCreated"
      @deleted="onManageCollectionDeleted"
    />

    <TagSelectionBar
      :count="selectedIds.size"
      toolbar-label="Selected favorites"
      :show-favorite="false"
      @collection="collectionPickerOpen = true"
      @optical="transferSelectedOptically"
      @zip="addSelectedToQueue"
      @clear="clearSelection"
    >
      <button
        v-if="activeCollectionId"
        type="button"
        class="btn btn-remove-icon"
        :aria-label="`Remove selected from ${activeCollection?.name ?? 'collection'}`"
        title="Remove selected tags from this collection only — keeps them favorited"
        @click="removeSelectedFromActiveCollection"
      >
        ×
      </button>
    </TagSelectionBar>

    <ConfirmDialog
      :open="!!pendingUnfavorite"
      title="Unfavorite this tag?"
      :message="pendingUnfavoriteMessage"
      confirm-label="Unfavorite"
      @close="pendingUnfavorite = null"
      @confirm="confirmPendingUnfavorite"
    />
    <ConfirmDialog
      :open="!!pendingImport"
      title="Add shared favorites?"
      :message="pendingImport
        ? `${pendingImport.name ? `“${pendingImport.name}” contains ` : 'This link contains '}${pendingImport.tagIds.length} tag${pendingImport.tagIds.length === 1 ? '' : 's'}. Existing favorites will be kept.`
        : ''"
      confirm-label="Add favorites"
      :danger="false"
      @close="closeImport"
      @confirm="confirmImport"
    >
      <label v-if="!offline" class="import-media">
        <input v-model="importFetchMedia" type="checkbox" />
        Download media now (for offline singing)
      </label>
    </ConfirmDialog>
  </section>
</template>

<style scoped>
.favorites.has-selection {
  padding-bottom: 5.5rem;
}
.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.6rem;
  margin-bottom: 1rem;
  align-items: center;
}
.more-menu-wrap {
  position: relative;
  margin-left: auto;
}
.more-menu-btn {
  min-width: 44px;
  padding-inline: 0.65rem;
}
.more-menu-icon {
  display: block;
}
.more-menu {
  position: absolute;
  top: calc(100% + 0.35rem);
  right: 0;
  z-index: 12;
  min-width: 11.5rem;
  display: grid;
  gap: 0.2rem;
  padding: 0.35rem;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--surface);
  box-shadow: 0 10px 28px color-mix(in srgb, var(--text) 14%, transparent);
}
.more-menu-item {
  display: block;
  width: 100%;
  min-height: 44px;
  padding: 0.45rem 0.65rem;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--text);
  font: inherit;
  font-weight: 600;
  text-align: left;
  cursor: pointer;
}
.more-menu-item:hover {
  background: color-mix(in srgb, var(--accent) 10%, var(--surface));
  color: var(--accent-hover);
}
.results-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.45rem 0.75rem;
  margin: 0.65rem 0 0.5rem;
}
.results-meta .count {
  margin: 0;
  flex: 1 1 10rem;
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
  color: var(--text);
  max-width: 100%;
}
.sort-field select:disabled {
  opacity: 0.5;
}
.sort-apply {
  box-sizing: border-box;
  min-width: 40px;
  min-height: 40px;
  padding: 0.35rem 0.5rem;
  border-radius: 10px;
  border: 1px solid var(--border);
  background: var(--surface);
  font: inherit;
  font-size: 1.1rem;
  font-weight: 700;
  line-height: 1;
  color: var(--muted);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.sort-apply:not(:disabled):hover {
  border-color: var(--accent);
  color: var(--accent-hover);
  background: color-mix(in srgb, var(--accent) 12%, var(--surface));
}
.sort-apply:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.sort-apply:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
.backup-actions .primary,
.tag-id-actions .primary {
  background: var(--accent);
  color: #fff;
  border-color: var(--accent);
}
.backup-actions .primary:disabled {
  background: color-mix(in srgb, var(--muted) 35%, var(--surface));
  color: var(--muted);
  border-color: var(--border);
  cursor: not-allowed;
  opacity: 1;
}
.backup-tip {
  display: inline-flex;
}
.backup-tip:has(button:disabled) {
  cursor: not-allowed;
}
.toggle-btn {
  min-height: 48px;
  padding: 0.55rem 1rem;
  border-radius: 10px;
  border: 1px solid var(--border);
  background: var(--surface);
  font: inherit;
  font-weight: 600;
}
.toggle-btn.on {
  background: color-mix(in srgb, var(--accent) 16%, var(--surface));
  border-color: var(--accent);
  color: var(--accent-hover);
}
.toggle-btn:disabled {
  opacity: 0.5;
}
.backup {
  display: grid;
  gap: 1rem;
  padding: 0.25rem 0 0.5rem;
}
.backup-desc {
  margin: 0;
  color: var(--muted);
  font-size: 0.95rem;
  line-height: 1.45;
}
.backup-desc strong {
  color: var(--text);
  font-weight: 600;
}
.backup-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.6rem;
  align-items: center;
}
.backup-actions button {
  min-height: 44px;
  padding: 0.55rem 0.9rem;
  border-radius: 10px;
  border: 1px solid var(--border);
  background: var(--surface);
  font: inherit;
}
.progress {
  display: grid;
  gap: 0.35rem;
  margin-bottom: 0.75rem;
  font-size: 0.9rem;
  color: var(--muted);
}
.bar {
  height: 4px;
  border-radius: 2px;
  background: var(--accent);
}
.list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: grid;
  gap: 0.5rem;
}
.list-dragging {
  user-select: none;
  cursor: grabbing;
}
.list-dragging .favorites-row:not(.dragging) {
  opacity: 0.55;
}
.favorites-row {
  position: relative;
  display: grid;
  /* Drag | title/actions — `.show-select` adds the checkbox column (Browse-like). */
  grid-template-columns: auto 1fr auto;
  gap: 0.35rem;
  align-items: center;
  padding: 0.35rem 0.35rem 0.35rem 0.25rem;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  min-height: 44px;
  transition:
    transform 0.12s ease,
    box-shadow 0.12s ease,
    opacity 0.12s ease,
    border-color 0.12s ease,
    background 0.12s ease;
}
.favorites-row.show-select {
  grid-template-columns: auto auto 1fr auto;
}
.favorites-row.no-nav .row-link {
  pointer-events: none;
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
.favorites-row.dragging {
  z-index: 3;
  opacity: 1;
  transform: scale(1.02) translateY(-2px);
  border-color: var(--accent);
  background: color-mix(in srgb, var(--accent) 10%, var(--surface));
  box-shadow: 0 10px 28px color-mix(in srgb, var(--text) 18%, transparent);
}
.favorites-row.dragging .drag-handle {
  color: var(--accent);
  cursor: grabbing;
  border-color: color-mix(in srgb, var(--accent) 45%, var(--border));
}
.favorites-row.drop-before::before,
.favorites-row.drop-after::after {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  height: 3px;
  border-radius: 999px;
  background: var(--accent);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 22%, transparent);
  pointer-events: none;
  z-index: 4;
}
.favorites-row.drop-before::before {
  top: -0.28rem;
}
.favorites-row.drop-after::after {
  bottom: -0.28rem;
}
.drag-handle {
  flex-shrink: 0;
  align-self: center;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 40px;
  min-height: 44px;
  width: 40px;
  padding: 0;
  margin: 0;
  border: 0;
  border-radius: 10px;
  background: transparent;
  color: var(--muted);
  font: inherit;
  font-size: 1.05rem;
  line-height: 1;
  cursor: grab;
  touch-action: none;
}
.drag-handle:hover {
  color: var(--text);
  background: color-mix(in srgb, var(--text) 6%, transparent);
}
.drag-handle:active {
  cursor: grabbing;
}
.row-main {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}
.row-cols {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
  padding: 0 0.35rem 0.45rem;
}
.col-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.2rem;
  max-width: 9rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  margin: 0;
  padding: 0.15rem 0.45rem;
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--accent) 35%, var(--border));
  background: color-mix(in srgb, var(--accent) 10%, var(--surface));
  color: var(--accent-hover, var(--accent));
  font: inherit;
  font-size: 0.78rem;
  font-weight: 650;
  line-height: 1.25;
  cursor: pointer;
  touch-action: manipulation;
}
.col-chip:hover {
  border-color: color-mix(in srgb, var(--accent) 55%, var(--border));
  background: color-mix(in srgb, var(--accent) 16%, var(--surface));
}
.col-chip.on {
  border-color: var(--accent);
  background: color-mix(in srgb, var(--accent) 22%, var(--surface));
}
.col-chip:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
.row-actions {
  display: flex;
  flex-wrap: nowrap;
  align-items: center;
  justify-content: flex-end;
  gap: 0.4rem;
  flex-shrink: 0;
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
.row-link {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  padding: 0.55rem 0.35rem;
  color: inherit;
  text-decoration: none;
  min-width: 0;
  min-height: 44px;
  justify-content: center;
}
.row-link:hover {
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
.ok {
  color: var(--accent);
}
.error {
  color: var(--danger);
}
.sr {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
}
code {
  font-size: 0.9em;
}

.collection-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  gap: 0.4rem;
  margin: 0 0 0.65rem;
}
.collection-strip {
  flex: 1 1 12rem;
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
  gap: 0.4rem;
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
.collection-page {
  display: flex;
  flex-wrap: wrap;
  align-content: flex-start;
  gap: 0.4rem;
  min-width: 0;
  /* Cap to ~2 chip rows; side chevrons page the rest. */
  max-height: calc(36px * 2 + 0.4rem);
  overflow: hidden;
}
.collection-strip.paged .collection-page {
  /* Keep a fixed two-row slot while paging, even on single-row pages. */
  min-height: calc(36px * 2 + 0.4rem);
}
.chip {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  min-height: 36px;
  padding: 0.25rem 0.7rem;
  border-radius: 999px;
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text);
  font: inherit;
  font-size: 0.88rem;
  font-weight: 600;
  cursor: pointer;
}
.chip.on {
  border-color: var(--accent);
  background: color-mix(in srgb, var(--accent) 12%, var(--surface));
  color: var(--accent);
}
.chip-n {
  font-size: 0.75rem;
  font-weight: 700;
  opacity: 0.75;
}
.chip-add:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.tag-id-add-panel {
  display: grid;
  gap: 0.65rem;
}
.tag-id-add-panel label {
  font-size: 0.85rem;
  font-weight: 600;
}
.tag-id-add-panel textarea {
  box-sizing: border-box;
  width: 100%;
  padding: 0.6rem 0.7rem;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface);
  color: var(--text);
  font: inherit;
  font-size: 16px;
  resize: vertical;
  min-height: 6rem;
}
.tag-id-media {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  font-weight: 600;
  cursor: pointer;
}
.tag-id-media input {
  width: 1.1rem;
  height: 1.1rem;
}
.tag-id-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.55rem;
}
.tag-id-actions button {
  min-height: 44px;
  padding: 0.55rem 0.9rem;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--surface);
  color: var(--text);
  font: inherit;
}
.tag-id-add-panel p {
  margin: 0;
  color: var(--muted);
  font-size: 0.9rem;
}
.import-media {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  font-size: 0.92rem;
}
</style>
