<script setup lang="ts">
/**
 * Favorites list: sort/reorder, collections, practice set, backup import/export,
 * and bulk unfavorite with confirm dialog.
 */
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import EmptyState from '../components/EmptyState.vue'
import FilterSheet from '../components/FilterSheet.vue'
import CollectionPickerSheet from '../components/CollectionPickerSheet.vue'
import CollectionsOrderSheet from '../components/CollectionsOrderSheet.vue'
import CustomCollectionMark from '../components/CustomCollectionMark.vue'
import ConfirmDialog from '../components/ConfirmDialog.vue'
import { useFavoritesStore } from '../stores/favorites'
import { useCatalogStore } from '../stores/catalog'
import { usePracticeStore } from '../stores/practice'
import { useUserCollectionsStore } from '../stores/userCollections'
import { buildFavoritesBackup, parseFavoritesBackup } from '../lib/favoritesBackup'
import { downloadBlob } from '../download/zip'
import { useOnline } from '../composables/useOnline'
import {
  decodeFavoritesSharePayload,
  favoritesSharePath,
  parseTagIdList,
  type FavoritesSharePayload,
} from '../lib/favoritesShare'
import { applyTagReturnScrollIfAny } from '../lib/tagReturn'
import {
  FAVORITES_SORT_OPTIONS,
  type FavoritesSortMode,
  sortFavoriteRecords,
} from '../lib/favoritesSort'
import { useOfflineLibraryStore } from '../stores/offlineLibrary'
import { usePreferencesStore } from '../stores/preferences'
import { tagOpenLocation } from '../lib/tagOpen'
import { qrDataUrl } from '../lib/qr'

const SHARE_URL_WARN_LEN = 2000

const favorites = useFavoritesStore()
const catalog = useCatalogStore()
const practice = usePracticeStore()
const userCollections = useUserCollectionsStore()
const offlineLibrary = useOfflineLibraryStore()
const prefs = usePreferencesStore()
const route = useRoute()
const router = useRouter()
const { offline } = useOnline()
const fileInput = ref<HTMLInputElement | null>(null)
const fetchMediaOnImport = ref(false)
const backupOpen = ref(false)
const manageOpen = ref(false)
const collectionPickerOpen = ref(false)
const reorderCollectionsOpen = ref(false)
/** ~2 wrap lines of collection chips on a typical phone Favorites toolbar. */
const COLLECTION_BAR_PAGE_SIZE = 6
const collectionPage = ref(0)
const tagIdsOpen = ref(false)
const shareOpen = ref(false)
const shareUrl = ref('')
const shareQr = ref('')
const shareUrlTooLong = ref(false)
const tagIdText = ref('')
const tagIdNotice = ref<string | null>(null)
const pendingImport = ref<FavoritesSharePayload | null>(null)
const importFetchMedia = ref(true)
const activeCollectionId = ref<string | null>(null)
const pendingUnfavorite = ref<{ tagId: number; title: string } | null>(null)
const renameDraft = ref<Record<string, string>>({})
const newCollectionName = ref('')
const manageError = ref<string | null>(null)
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

const DRAG_HOLD_MS = 280

const draggingId = ref<number | null>(null)
const dragOverIndex = ref<number | null>(null)
const dragOverEdge = ref<'before' | 'after' | null>(null)
const dragFromIndex = ref(-1)
const dragActive = ref(false)
let holdTimer: ReturnType<typeof setTimeout> | null = null
let holdPointerId: number | null = null
let holdStartY = 0

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

/** Store order (reorder modal); not A–Z. */
const collectionChips = computed(() => userCollections.collections)

const collectionPageCount = computed(() =>
  Math.max(1, Math.ceil(collectionChips.value.length / COLLECTION_BAR_PAGE_SIZE)),
)

const showCollectionPager = computed(
  () => collectionChips.value.length > COLLECTION_BAR_PAGE_SIZE,
)

const pagedCollectionChips = computed(() => {
  const start = collectionPage.value * COLLECTION_BAR_PAGE_SIZE
  return collectionChips.value.slice(start, start + COLLECTION_BAR_PAGE_SIZE)
})

watch(collectionPageCount, (n) => {
  if (collectionPage.value > n - 1) collectionPage.value = Math.max(0, n - 1)
})

watch(
  () => activeCollectionId.value,
  (id) => {
    if (!id || !showCollectionPager.value) return
    const idx = collectionChips.value.findIndex((c) => c.id === id)
    if (idx < 0) return
    collectionPage.value = Math.floor(idx / COLLECTION_BAR_PAGE_SIZE)
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
const canNativeShare = computed(
  () => typeof navigator !== 'undefined' && typeof navigator.share === 'function',
)

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
  return selectedIds.value.has(tagId) ? `Deselect ${name}` : `Select ${name}`
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
  if (t?.closest('.sel-btn, .row-fav, .drag-handle, .row-remove-col')) return
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

watch(manageOpen, (open) => {
  if (!open) return
  manageError.value = null
  newCollectionName.value = ''
  const drafts: Record<string, string> = {}
  for (const c of userCollections.collections) drafts[c.id] = c.name
  renameDraft.value = drafts
})

const finePointer = computed(() =>
  typeof window !== 'undefined' && window.matchMedia('(hover: hover) and (pointer: fine)').matches,
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
  clearHoldTimer()
  stopDragListeners()
  clearLongPressTimer()
  narrowMq?.removeEventListener('change', syncNarrowSelect)
  narrowMq = null
})

watch(
  () => favorites.records.map((r) => r.tagId).join(','),
  () => {
    practice.syncFromStarred(favorites.records.map((r) => r.tagId))
  },
)

function clearHoldTimer(): void {
  if (holdTimer) {
    clearTimeout(holdTimer)
    holdTimer = null
  }
}

function stopDragListeners(): void {
  window.removeEventListener('pointermove', onHoldMove)
  window.removeEventListener('pointermove', onDragMove)
  window.removeEventListener('pointerup', onDragEnd)
  window.removeEventListener('pointercancel', onDragEnd)
}

function beginDrag(tagId: number, index: number, pointerId: number, handle: HTMLElement): void {
  dragActive.value = true
  draggingId.value = tagId
  dragFromIndex.value = index
  dragOverIndex.value = index
  dragOverEdge.value = null
  handle.setPointerCapture(pointerId)
  window.addEventListener('pointermove', onDragMove)
  window.addEventListener('pointerup', onDragEnd)
  window.addEventListener('pointercancel', onDragEnd)
}

function onHandlePointerDown(e: PointerEvent, tagId: number, index: number): void {
  if (dragActive.value) return
  const handle = e.currentTarget as HTMLElement
  holdPointerId = e.pointerId
  holdStartY = e.clientY

  const start = (): void => {
    clearHoldTimer()
    window.removeEventListener('pointermove', onHoldMove)
    window.removeEventListener('pointerup', cancelHold)
    window.removeEventListener('pointercancel', cancelHold)
    if (holdPointerId !== e.pointerId) return
    beginDrag(tagId, index, e.pointerId, handle)
  }

  if (finePointer.value) {
    e.preventDefault()
    start()
    return
  }

  window.addEventListener('pointermove', onHoldMove)
  window.addEventListener('pointerup', cancelHold)
  window.addEventListener('pointercancel', cancelHold)
  holdTimer = setTimeout(start, DRAG_HOLD_MS)
}

function onHoldMove(e: PointerEvent): void {
  if (holdPointerId !== e.pointerId) return
  if (Math.abs(e.clientY - holdStartY) > 8) cancelHold()
}

function cancelHold(): void {
  clearHoldTimer()
  holdPointerId = null
  window.removeEventListener('pointermove', onHoldMove)
  window.removeEventListener('pointerup', cancelHold)
  window.removeEventListener('pointercancel', cancelHold)
}

function setDropTarget(row: HTMLElement, clientY: number): void {
  const index = Number(row.dataset.index)
  if (!Number.isFinite(index)) return
  if (index === dragFromIndex.value) {
    dragOverIndex.value = index
    dragOverEdge.value = null
    return
  }
  const rect = row.getBoundingClientRect()
  const edge: 'before' | 'after' = clientY < rect.top + rect.height / 2 ? 'before' : 'after'
  dragOverIndex.value = index
  dragOverEdge.value = edge
}

function insertIndexForDrop(): number | null {
  const over = dragOverIndex.value
  const edge = dragOverEdge.value
  const from = dragFromIndex.value
  if (over == null || edge == null || from < 0) return null
  let insertAt = edge === 'after' ? over + 1 : over
  if (from < insertAt) insertAt--
  return insertAt
}

function onDragMove(e: PointerEvent): void {
  if (!dragActive.value) return
  const el = document.elementFromPoint(e.clientX, e.clientY)
  const row = el?.closest<HTMLElement>('li.favorites-row')
  if (!row) return
  setDropTarget(row, e.clientY)
}

function onDragEnter(e: PointerEvent, index: number): void {
  if (!dragActive.value) return
  const row = e.currentTarget as HTMLElement
  if (Number(row.dataset.index) !== index) return
  setDropTarget(row, e.clientY)
}

function onDragEnd(): void {
  clearHoldTimer()
  window.removeEventListener('pointermove', onHoldMove)
  if (dragActive.value && draggingId.value != null) {
    const toIndex = insertIndexForDrop()
    if (toIndex != null) {
      const colId = activeCollectionId.value
      const ids = orderedRecords.value.map((r) => r!.tagId)
      // Dragging adopts the current view as custom order, then reorders.
      if (sortMode.value !== 'custom') {
        if (colId) userCollections.setTagOrder(colId, ids)
        else practice.resetFromStarred(ids)
        sortMode.value = 'custom'
      }
      if (colId) userCollections.reorderTag(colId, draggingId.value, toIndex)
      else practice.reorder(draggingId.value, toIndex)
    }
  }
  dragActive.value = false
  draggingId.value = null
  dragFromIndex.value = -1
  dragOverIndex.value = null
  dragOverEdge.value = null
  holdPointerId = null
  stopDragListeners()
}

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

function saveRename(id: string): void {
  manageError.value = null
  if (!userCollections.rename(id, renameDraft.value[id] ?? '')) {
    manageError.value = 'Enter a collection name'
  }
}

function deleteCollection(id: string): void {
  manageError.value = null
  const col = userCollections.byId(id)
  if (!col) return
  if (!confirm(`Delete collection “${col.name}”? Favorites stay favorited.`)) return
  userCollections.remove(id)
  if (activeCollectionId.value === id) activeCollectionId.value = null
  const { [id]: _removed, ...rest } = renameDraft.value
  renameDraft.value = rest
}

function createManagedCollection(): void {
  manageError.value = null
  const col = userCollections.create(newCollectionName.value)
  if (!col) {
    manageError.value = 'Enter a collection name'
    return
  }
  renameDraft.value = { ...renameDraft.value, [col.id]: col.name }
  newCollectionName.value = ''
  activeCollectionId.value = col.id
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

function requestUnfavorite(tagId: number, title: string): void {
  const inCollections = userCollections.collections.some((c) => c.tagIds.includes(tagId))
  if (activeCollectionId.value || inCollections) {
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
  if (activeCollectionId.value) {
    return `Unfavorite ${title || `tag #${tagId}`} — removes from favorites and all collections`
  }
  return `Unfavorite ${title || `tag #${tagId}`} — remove from saved tags`
}

function rowStarLabel(title: string, tagId: number): string {
  if (favorites.isTagCaching(tagId)) return 'Saving for offline'
  return `Unfavorite ${title || `tag #${tagId}`}`
}

async function openShare(): Promise<void> {
  const ids = orderedRecords.value.map((record) => record!.tagId)
  const path = favoritesSharePath(ids, activeCollection.value?.name)
  shareUrl.value = new URL(path, window.location.origin).toString()
  shareUrlTooLong.value = shareUrl.value.length > SHARE_URL_WARN_LEN
  shareQr.value = ''
  shareOpen.value = true
  try {
    shareQr.value = await qrDataUrl(shareUrl.value, 200)
  } catch {
    shareQr.value = ''
  }
}

async function copyShareUrl(): Promise<void> {
  try {
    await navigator.clipboard.writeText(shareUrl.value)
    favorites.lastNotice = { type: 'text', message: 'Share link copied' }
  } catch {
    favorites.error = 'Could not copy the share link. Select and copy it manually.'
  }
}

function selectShareUrl(event: Event): void {
  const input = event.target as HTMLInputElement
  input.select()
}

async function shareFavorites(): Promise<void> {
  if (!navigator.share) return
  try {
    await navigator.share({
      title: activeCollection.value?.name || 'SingTags favorites',
      url: shareUrl.value,
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return
    favorites.error = 'Could not open the device share menu.'
  }
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

function formatCollectionDate(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString()
}
</script>

<template>
  <section
    class="favorites"
    :class="{ 'has-selection': selectedIds.size }"
    aria-label="Favorites"
  >
    <div class="actions">
      <button type="button" class="btn" @click="backupOpen = true">Backup &amp; restore</button>
      <button type="button" class="btn" @click="manageOpen = true">Manage collections</button>
      <button
        type="button"
        class="btn"
        :disabled="!collectionChips.length"
        title="Change which collections appear first"
        @click="reorderCollectionsOpen = true"
      >
        Reorder collections
      </button>
      <button type="button" class="btn" :disabled="!orderedRecords.length" @click="openShare">
        Share list
      </button>
      <button type="button" class="btn" @click="openTagIdsAdd">Bulk add</button>
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
    <div
      v-if="showCollectionPager"
      class="collection-pager"
      role="group"
      aria-label="Collection pages"
    >
      <button
        type="button"
        class="btn"
        :disabled="collectionPage <= 0"
        aria-label="Previous collection page"
        @click="collectionPage -= 1"
      >
        ← Prev
      </button>
      <span class="collection-page-ind" aria-live="polite">
        {{ collectionPage + 1 }} / {{ collectionPageCount }}
      </span>
      <button
        type="button"
        class="btn"
        :disabled="collectionPage >= collectionPageCount - 1"
        aria-label="Next collection page"
        @click="collectionPage += 1"
      >
        Next →
      </button>
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
      message="Favorite from Browse or a tag page to save for quick recall and offline use."
    />
    <EmptyState
      v-else-if="!orderedRecords.length && activeCollection"
      title="Nothing in this collection"
      message="Select favorites with the checkboxes, then use Add to collection — or pick another collection."
    />

    <ol
      v-else-if="orderedRecords.length"
      class="list"
      :class="{ 'list-dragging': dragActive, 'has-selection': selectedIds.size }"
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
          dragging: draggingId === r!.tagId,
          'drop-before':
            dragActive &&
            dragOverIndex === i &&
            dragOverEdge === 'before' &&
            draggingId !== r!.tagId,
          'drop-after':
            dragActive &&
            dragOverIndex === i &&
            dragOverEdge === 'after' &&
            draggingId !== r!.tagId,
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
            <span class="title"
              ><span class="num">{{ i + 1 }}.</span> {{ r!.summary.title || `Tag ${r!.tagId}` }}</span
            >
            <span class="meta">
              <span v-if="r!.summary.key">{{ r!.summary.key }}</span>
              <span v-if="r!.summary.arranger">{{ r!.summary.arranger }}</span>
              <span class="badge" :data-on="!!(r!.audioBlobs && Object.keys(r!.audioBlobs).length)">{{
                r!.audioBlobs && Object.keys(r!.audioBlobs).length
                  ? 'Audio offline'
                  : r!.offlineMedia
                    ? 'Sheets offline'
                    : 'Metadata'
              }}</span>
            </span>
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
        <div class="row-actions" :class="{ 'in-collection': !!activeCollectionId }">
          <button
            v-if="activeCollectionId"
            type="button"
            class="row-remove-col"
            :aria-label="`Remove ${r!.summary.title || r!.tagId} from collection`"
            title="Remove from this collection only — keeps it favorited"
            @click.stop="removeFromActiveCollection(r!.tagId)"
          >
            Remove from collection
          </button>
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

    <FilterSheet :open="shareOpen" title="Share favorites" @close="shareOpen = false">
      <div class="share-panel">
        <p>
          Anyone with this link can review and add these {{ orderedRecords.length }} tags to their
          favorites.
        </p>
        <label for="favorites-share-url">Share link</label>
        <input id="favorites-share-url" :value="shareUrl" readonly @focus="selectShareUrl" />
        <p v-if="shareUrlTooLong" class="share-warn" role="status">
          This link is very long ({{ shareUrl.length }} chars) and may fail in SMS or some QR scanners.
          Prefer Copy URL or Share… on the same network.
        </p>
        <img
          v-if="shareQr"
          class="share-qr"
          :src="shareQr"
          width="200"
          height="200"
          alt="QR code for this favorites share link"
        />
        <div class="share-actions">
          <button type="button" class="primary" @click="copyShareUrl">Copy URL</button>
          <button v-if="canNativeShare" type="button" @click="shareFavorites">Share…</button>
        </div>
      </div>
    </FilterSheet>

    <CollectionPickerSheet
      :open="collectionPickerOpen"
      :tag-ids="selectedTagIds"
      title="Add to collection"
      @close="collectionPickerOpen = false"
      @done="onAddedToCollection"
    />
    <CollectionsOrderSheet
      :open="reorderCollectionsOpen"
      @close="reorderCollectionsOpen = false"
    />

    <Teleport to="body">
      <div
        v-if="selectedIds.size"
        class="selection-bar"
        role="toolbar"
        aria-label="Selected favorites"
      >
        <span class="sel-count">{{ selectedIds.size }} selected</span>
        <button
          type="button"
          class="btn"
          title="Add selected favorites to a collection"
          @click="collectionPickerOpen = true"
        >
          Add to collection
        </button>
        <button
          v-if="activeCollectionId"
          type="button"
          class="btn"
          title="Remove selected tags from this collection only — keeps them favorited"
          @click="removeSelectedFromActiveCollection"
        >
          Remove from collection
        </button>
        <button
          type="button"
          class="btn btn-ghost"
          title="Clear selection"
          @click="clearSelection"
        >
          Clear
        </button>
      </div>
    </Teleport>

    <FilterSheet :open="manageOpen" title="Manage collections" @close="manageOpen = false">
      <div class="manage">
        <p class="manage-desc">
          Collections group favorites. They stay on this device. Unfavoriting a tag
          removes it from every collection.
        </p>
        <p v-if="manageError" class="manage-err" role="alert">{{ manageError }}</p>

        <ul v-if="collectionChips.length" class="manage-list" aria-label="Your collections">
          <li v-for="c in collectionChips" :key="c.id" class="manage-row">
            <label class="manage-field">
              <span class="manage-lbl">
                {{ c.name }}
                <span class="manage-count">{{ c.tagIds.length }} tag{{ c.tagIds.length === 1 ? '' : 's' }}</span>
              </span>
              <span class="manage-dates">
                Created {{ formatCollectionDate(c.createdAt) }} · Updated
                {{ formatCollectionDate(c.updatedAt) }}
              </span>
              <input
                v-model="renameDraft[c.id]"
                type="text"
                maxlength="80"
                :aria-label="`Rename ${c.name}`"
                @keydown.enter.prevent="saveRename(c.id)"
              />
            </label>
            <div class="manage-row-actions">
              <button
                type="button"
                class="manage-btn manage-btn-primary"
                :disabled="!(renameDraft[c.id] ?? '').trim() || (renameDraft[c.id] ?? '').trim() === c.name"
                @click="saveRename(c.id)"
              >
                Save name
              </button>
              <button type="button" class="manage-btn manage-btn-danger" @click="deleteCollection(c.id)">
                Delete
              </button>
            </div>
          </li>
        </ul>
        <p v-else class="manage-empty">No collections yet.</p>

        <div class="manage-create">
          <label class="manage-field">
            <span class="manage-lbl">New collection</span>
            <input
              v-model="newCollectionName"
              type="text"
              maxlength="80"
              placeholder="e.g. Contest set"
              aria-label="New collection name"
              @keydown.enter.prevent="createManagedCollection"
            />
          </label>
          <button
            type="button"
            class="manage-btn manage-btn-primary manage-create-btn"
            :disabled="!newCollectionName.trim()"
            @click="createManagedCollection"
          >
            Create
          </button>
        </div>
      </div>
    </FilterSheet>

    <ConfirmDialog
      :open="!!pendingUnfavorite"
      title="Unfavorite this tag?"
      :message="pendingUnfavorite
        ? `“${pendingUnfavorite.title || ('tag #' + pendingUnfavorite.tagId)}” will be removed from your favorites and from every collection.`
        : ''"
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
.tag-id-actions .primary,
.share-actions .primary {
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
li {
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
li.show-select {
  grid-template-columns: auto auto 1fr auto;
}
li.no-nav .row-link {
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
li.dragging {
  z-index: 3;
  opacity: 1;
  transform: scale(1.02) translateY(-2px);
  border-color: var(--accent);
  background: color-mix(in srgb, var(--accent) 10%, var(--surface));
  box-shadow: 0 10px 28px color-mix(in srgb, var(--text) 18%, transparent);
}
li.dragging .drag-handle {
  color: var(--accent);
  cursor: grabbing;
  border-color: color-mix(in srgb, var(--accent) 45%, var(--border));
}
li.drop-before::before,
li.drop-after::after {
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
li.drop-before::before {
  top: -0.28rem;
}
li.drop-after::after {
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
.row-actions.in-collection {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 0.4rem;
  align-items: center;
  min-width: 12.5rem;
  max-width: 16rem;
}
.row-remove-col {
  min-height: 44px;
  padding: 0.35rem 0.6rem;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text);
  font: inherit;
  font-size: 0.8rem;
  font-weight: 600;
  line-height: 1.2;
  text-align: center;
  cursor: pointer;
  white-space: normal;
}
.row-remove-col:hover {
  border-color: color-mix(in srgb, var(--accent) 45%, var(--border));
  background: color-mix(in srgb, var(--accent) 8%, var(--surface));
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
.title {
  font-weight: 600;
}
.num {
  color: var(--muted);
  font-weight: 500;
  margin-right: 0.15rem;
}
.meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0.65rem;
  color: var(--muted);
  font-size: 0.9rem;
}
.badge {
  color: var(--muted);
}
.badge[data-on='true'] {
  color: var(--accent);
  font-weight: 600;
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
  margin: 0 0 0.45rem;
}
.collection-page {
  display: flex;
  flex-wrap: wrap;
  align-content: flex-start;
  gap: 0.4rem;
  flex: 1 1 12rem;
  min-width: 0;
  /* Cap to ~2 chip rows; prev/next pages the rest. */
  max-height: calc(36px * 2 + 0.4rem);
  overflow: hidden;
}
.collection-pager {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.45rem;
  margin: 0 0 0.65rem;
}
.collection-pager .btn {
  min-height: 36px;
  padding: 0.3rem 0.65rem;
  font-size: 0.85rem;
}
.collection-page-ind {
  font-size: 0.85rem;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: var(--muted);
  min-width: 3.5rem;
  text-align: center;
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
.tag-id-add-panel label,
.share-panel label {
  font-size: 0.85rem;
  font-weight: 600;
}
.tag-id-add-panel textarea,
.share-panel input {
  box-sizing: border-box;
  width: 100%;
  padding: 0.6rem 0.7rem;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface);
  color: var(--text);
  font: inherit;
  font-size: 16px;
}
.tag-id-add-panel textarea {
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
.tag-id-actions,
.share-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.55rem;
}
.tag-id-actions button,
.share-actions button {
  min-height: 44px;
  padding: 0.55rem 0.9rem;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--surface);
  color: var(--text);
  font: inherit;
}
.tag-id-add-panel p,
.share-panel p {
  margin: 0;
  color: var(--muted);
  font-size: 0.9rem;
}
.share-panel {
  display: grid;
  gap: 0.75rem;
}
.share-warn {
  margin: 0;
  font-size: 0.85rem;
  color: var(--muted, #666);
}
.import-media {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  font-size: 0.92rem;
}
.share-qr {
  width: 200px;
  max-width: 100%;
  height: auto;
  margin: 0 auto;
  border-radius: 6px;
  background: #fff;
}
.share-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.55rem;
}
.manage {
  display: grid;
  gap: 0.9rem;
}
.manage-desc {
  margin: 0;
  color: var(--muted);
  font-size: 0.92rem;
  line-height: 1.45;
}
.manage-empty {
  margin: 0;
  color: var(--muted);
  font-size: 0.92rem;
}
.manage-err {
  margin: 0;
  color: var(--danger, #9b2c2c);
  font-size: 0.9rem;
}
.manage-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0.75rem;
  max-height: min(45vh, 18rem);
  overflow: auto;
}
.manage-row {
  display: grid;
  gap: 0.45rem;
  padding: 0.65rem 0.7rem;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--bg, var(--surface));
}
.manage-field {
  display: grid;
  gap: 0.3rem;
  min-width: 0;
}
.manage-lbl {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.5rem;
  font-size: 0.85rem;
  font-weight: 600;
}
.manage-count {
  font-weight: 500;
  color: var(--muted);
  font-variant-numeric: tabular-nums;
}
.manage-dates {
  color: var(--muted);
  font-size: 0.75rem;
  font-weight: 400;
  line-height: 1.35;
}
.manage-row input,
.manage-create input {
  box-sizing: border-box;
  width: 100%;
  min-height: 44px;
  padding: 0.45rem 0.65rem;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface);
  color: var(--text);
  font: inherit;
  font-size: 16px;
}
.manage-row-actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.4rem;
}
.manage-btn {
  min-height: 44px;
  padding: 0.45rem 0.75rem;
  border-radius: 10px;
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text);
  font: inherit;
  font-weight: 600;
  cursor: pointer;
}
.manage-btn:hover:not(:disabled) {
  border-color: color-mix(in srgb, var(--accent) 45%, var(--border));
}
.manage-btn-primary {
  background: var(--accent);
  border-color: var(--accent);
  color: #fff;
}
.manage-btn-primary:hover:not(:disabled) {
  border-color: var(--accent);
  filter: brightness(1.05);
}
.manage-btn-primary:disabled {
  opacity: 0.45;
  cursor: not-allowed;
  filter: none;
}
.manage-btn-danger {
  color: var(--danger, #9b2c2c);
}
.manage-btn-danger:hover:not(:disabled) {
  border-color: color-mix(in srgb, var(--danger, #9b2c2c) 45%, var(--border));
  background: color-mix(in srgb, var(--danger, #9b2c2c) 8%, var(--surface));
}
.manage-create {
  display: grid;
  gap: 0.55rem;
  padding-top: 0.85rem;
  border-top: 1px solid var(--border);
}
.manage-create-btn {
  width: 100%;
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
