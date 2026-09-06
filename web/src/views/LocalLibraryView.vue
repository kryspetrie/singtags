<script setup lang="ts">
/**
 * Local Library list — Favorites-like index of on-device songs.
 */
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import EmptyState from '../components/EmptyState.vue'
import ConfirmDialog from '../components/ConfirmDialog.vue'
import FilterSheet from '../components/FilterSheet.vue'
import LocalLibraryCombineStaging from '../components/LocalLibraryCombineStaging.vue'
import LocalImportModal from '../components/LocalImportModal.vue'
import LocalLibraryMergeStaging from '../components/LocalLibraryMergeStaging.vue'
import LocalEntryTransferSheet from '../components/LocalEntryTransferSheet.vue'
import LocalGroupPickerSheet from '../components/LocalGroupPickerSheet.vue'
import { navigateToOpticalTransfer } from '../lib/decimen/opticalTransferNav'
import { navigateToLocalEntry } from '../lib/localDocOpen'
import { useTwoRowStripPaging } from '../composables/useTwoRowStripPaging'
import { useSortableListDrag } from '../composables/useSortableListDrag'
import { useLocalLibraryStore } from '../stores/localLibrary'
import { useLocalPlaylistsStore } from '../stores/localPlaylists'
import { usePreferencesStore } from '../stores/preferences'
import { useSnackbarStore } from '../stores/snackbar'
import {
  LOCAL_LIBRARY_ACCEPT_MIME,
  defaultOpticalTransferAssets,
  matchLocalLibraryQuery,
  type LocalAssetRole,
} from '../types/localLibrary'
import {
  LOCAL_ENTRY_WARN_BYTES,
  formatLocalSizeWarn,
} from '../lib/localDocReceive'
import {
  estimateLocalLibraryBytes,
  exportLocalLibraryZip,
  importLocalLibraryZip,
} from '../lib/localLibraryBackup'
import { formatBytes, getStorageEstimate } from '../offline/storageEstimate'

const library = useLocalLibraryStore()
const playlists = useLocalPlaylistsStore()
const route = useRoute()
const prefs = usePreferencesStore()
const snackbar = useSnackbarStore()
const router = useRouter()

const separateInput = ref<HTMLInputElement | null>(null)
const combineInput = ref<HTMLInputElement | null>(null)
const importBusy = ref(false)
const combineFiles = ref<File[]>([])
const importModalOpen = ref(false)
const groupName = ref('')
const groupBusy = ref(false)
const manageGroupsOpen = ref(false)
const groupPickerOpen = ref(false)
const renameGroupId = ref<string | null>(null)
const renameGroupName = ref('')
const moreMenuOpen = ref(false)
const moreMenuRef = ref<HTMLElement | null>(null)
const pendingBulkDelete = ref(false)
const pendingDeleteGroupId = ref<string | null>(null)
const selectedIds = ref<Set<string>>(new Set())
const selectMode = ref(false)
const transferEntryId = ref<string | null>(null)
const searchQuery = ref('')
const searchOptionsOpen = ref(false)
const mergeEntryIds = ref<string[] | null>(null)
const mergeBusy = ref(false)
const pendingMultiTransferIds = ref<string[] | null>(null)

const backupBusy = ref(false)
const backupMessage = ref<string | null>(null)
const restoreInput = ref<HTMLInputElement | null>(null)
const libraryBytes = ref<number | null>(null)
const deviceStorage = ref<{ usage: number; quota: number } | null>(null)

async function refreshStorageMeter(): Promise<void> {
  try {
    libraryBytes.value = await estimateLocalLibraryBytes()
  } catch {
    libraryBytes.value = null
  }
  try {
    const est = await getStorageEstimate()
    deviceStorage.value =
      est && est.quota > 0 ? { usage: est.usage, quota: est.quota } : null
  } catch {
    deviceStorage.value = null
  }
}

async function onBackupExport(): Promise<void> {
  moreMenuOpen.value = false
  if (backupBusy.value) return
  backupBusy.value = true
  backupMessage.value = 'Building backup…'
  try {
    const result = await exportLocalLibraryZip((p) => {
      backupMessage.value = p.label
    })
    snackbar.show(
      `Backup downloaded (${formatBytes(result.bytes)}).`,
      { tone: 'ok', ms: 3500 },
    )
    backupMessage.value = null
    await refreshStorageMeter()
  } catch (e) {
    backupMessage.value = null
    snackbar.show(e instanceof Error ? e.message : 'Backup failed.', { tone: 'error' })
  } finally {
    backupBusy.value = false
  }
}

function openRestorePicker(): void {
  moreMenuOpen.value = false
  restoreInput.value?.click()
}

async function onRestoreSelected(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file || backupBusy.value) return
  backupBusy.value = true
  backupMessage.value = 'Restoring backup…'
  try {
    const result = await importLocalLibraryZip(file, (p) => {
      backupMessage.value = p.label
    })
    await Promise.all([library.refresh(), playlists.refresh()])
    await refreshStorageMeter()
    snackbar.show(
      `Restored ${result.entries} song${result.entries === 1 ? '' : 's'}, ${result.playlists} set list${result.playlists === 1 ? '' : 's'}.`,
      { tone: 'ok', ms: 4000 },
    )
    backupMessage.value = null
  } catch (e) {
    backupMessage.value = null
    snackbar.show(e instanceof Error ? e.message : 'Restore failed.', { tone: 'error' })
  } finally {
    backupBusy.value = false
  }
}


const canReorder = computed(() => !searchQuery.value.trim())

const {
  dragActive,
  onHandlePointerDown,
  onDragEnter,
  rowDragClass,
  listDraggingClass,
} = useSortableListDrag<string>({
  rowSelector: 'li.library-row',
  onReorder: (entryId, toIndex) => {
    if (!canReorder.value) return
    void library.reorderEntry(entryId, toIndex)
  },
})

const NARROW_SELECT_MQ = '(max-width: 639px)'
const LONG_PRESS_MS = 450
const LONG_PRESS_MOVE_PX = 10
const isNarrow = ref(false)
let narrowMq: MediaQueryList | null = null
let longPressTimer: ReturnType<typeof setTimeout> | null = null
let longPressId: string | null = null
let longPressX = 0
let longPressY = 0
let suppressRowClick = false

const acceptAttr = computed(() =>
  [
    ...LOCAL_LIBRARY_ACCEPT_MIME,
    '.pdf',
    '.png',
    '.jpg',
    '.jpeg',
    '.webp',
    '.gif',
    '.mp3',
    '.wav',
    '.m4a',
    '.aac',
    '.ogg',
    '.webm',
  ].join(','),
)

const groupChips = computed(() => library.groups)

const groupCounts = computed(() => {
  const map: Record<string, number> = {}
  for (const g of library.groups) {
    map[g.id] = g.entryIds.length || library.entries.filter((e) => e.groupIds.includes(g.id)).length
  }
  return map
})

const groupStripHost = ref<HTMLElement | null>(null)
const groupMeasureEl = ref<HTMLElement | null>(null)

const {
  page: groupPage,
  showPager: showGroupPager,
  pageCount: groupPageCount,
  pagedItems: pagedGroupChips,
  pageForIndex: groupPageForIndex,
} = useTwoRowStripPaging(groupChips, {
  hostEl: groupStripHost,
  measureEl: groupMeasureEl,
})

watch(
  () => library.activeGroupId,
  (id) => {
    if (!id || !showGroupPager.value) return
    const idx = groupChips.value.findIndex((c) => c.id === id)
    if (idx < 0) return
    groupPage.value = groupPageForIndex(idx)
  },
)

const activeGroup = computed(() =>
  library.activeGroupId
    ? library.groups.find((g) => g.id === library.activeGroupId) ?? null
    : null,
)

const orderedEntries = computed(() => {
  const list = library.filteredEntries
  const q = searchQuery.value
  if (!q.trim()) return list
  return list.filter((e) => matchLocalLibraryQuery(e, q))
})

const pendingBulkDeleteTitle = computed(() => {
  const ids = [...selectedIds.value]
  if (ids.length === 1) {
    const entry = library.entries.find((d) => d.id === ids[0])
    return entry ? `Delete “${entry.title}” from Local Library?` : 'Delete song from Local Library?'
  }
  return `Delete ${ids.length} songs from Local Library?`
})

const pendingDeleteGroupTitle = computed(() => {
  const g = pendingDeleteGroupId.value
    ? library.groups.find((x) => x.id === pendingDeleteGroupId.value)
    : null
  return g ? `Delete group “${g.name}”?` : 'Delete group?'
})

const showRowSelect = computed(
  () => selectMode.value || selectedIds.value.size > 0 || !isNarrow.value,
)

const transferEntry = computed(() =>
  transferEntryId.value
    ? library.entries.find((e) => e.id === transferEntryId.value) ?? null
    : null,
)

const transferAssets = computed(() =>
  transferEntryId.value ? library.assetsFor(transferEntryId.value) : [],
)

const resultsCountLabel = computed(() => {
  const n = orderedEntries.value.length
  const total = library.filteredEntries.length
  const searching = !!searchQuery.value.trim()
  if (activeGroup.value) {
    if (searching) return `${n} of ${total} in “${activeGroup.value.name}”`
    return `${n} in “${activeGroup.value.name}”`
  }
  if (searching) return `${n} of ${total} song${total === 1 ? '' : 's'}`
  return `${n} song${n === 1 ? '' : 's'}`
})

function syncNarrowSelect(): void {
  isNarrow.value = narrowMq?.matches ?? false
}

function onDocPointerDown(e: PointerEvent): void {
  if (!moreMenuOpen.value) return
  const t = e.target as Node | null
  if (t && moreMenuRef.value?.contains(t)) return
  moreMenuOpen.value = false
}

function restoreLibraryScroll(): void {
  try {
    const raw = sessionStorage.getItem('singtags.library.scrollY')
    if (raw == null) return
    sessionStorage.removeItem('singtags.library.scrollY')
    const y = Number(raw)
    if (!Number.isFinite(y)) return
    requestAnimationFrame(() => window.scrollTo(0, y))
  } catch {
    /* ignore */
  }
}

onMounted(() => {
  restoreLibraryScroll()
  void Promise.all([library.ensureLoaded(), playlists.ensureLoaded()]).then(() =>
    refreshStorageMeter(),
  )
  narrowMq = window.matchMedia(NARROW_SELECT_MQ)
  syncNarrowSelect()
  narrowMq.addEventListener('change', syncNarrowSelect)
  document.addEventListener('pointerdown', onDocPointerDown)
})

onUnmounted(() => {
  narrowMq?.removeEventListener('change', syncNarrowSelect)
  document.removeEventListener('pointerdown', onDocPointerDown)
  clearLongPressTimer()
})



function entryHasSheet(entryId: string): boolean {
  return library.assetsFor(entryId).some(
    (a) => a.role === 'sheet' || a.role === 'alternateSheet' || a.role === 'image',
  )
}

function localEntryLocation(entryId: string) {
  const fullscreen = prefs.singMode && entryHasSheet(entryId)
  return {
    path: `/library/${entryId}`,
    query: fullscreen ? { fullscreen: '1' } : {},
  }
}

function onOpenEntry(entryId: string, event: Event): void {
  if (dragActive.value || suppressRowClick) {
    event.preventDefault()
    return
  }
  // Sing mode wants fullscreen — cue-only songs open the page instead; explain why.
  if (prefs.singMode && !entryHasSheet(entryId)) {
    snackbar.show('No sheet music available.', { tone: 'info' })
  }
  try {
    sessionStorage.setItem('singtags.library.scrollY', String(window.scrollY))
  } catch {
    /* ignore */
  }
}

function badgeFor(entryId: string): { sheet: boolean; tracks: number; empty: boolean } {
  const assets = library.assetsFor(entryId)
  return {
    sheet: assets.some((a) => a.role === 'sheet' || a.role === 'alternateSheet'),
    tracks: assets.filter((a) => a.role === 'track').length,
    empty: assets.length === 0,
  }
}

/** Browse-style lyrics cue for list rows (trimmed, ellipsized). */
function lyricsHintSnippet(raw: string | undefined | null, max = 90): string {
  const t = (raw ?? '').trim().replace(/\s+/g, ' ')
  if (!t) return ''
  return t.length > max ? `${t.slice(0, Math.max(1, max - 1))}…` : t
}


const libraryTab = computed<'songs' | 'playlists'>(() =>
  route.query.tab === 'playlists' ? 'playlists' : 'songs',
)

function setLibraryTab(tab: 'songs' | 'playlists'): void {
  void router.replace({
    path: '/library',
    query: {
      ...route.query,
      ...(tab === 'playlists' ? { tab: 'playlists' } : { tab: undefined }),
    },
  })
}

const newPlaylistName = ref('')

async function createPlaylist(): Promise<void> {
  const name = newPlaylistName.value.trim() || 'Set List'
  const pl = await playlists.createPlaylist(name)
  newPlaylistName.value = ''
  await router.push({ path: `/library/playlists/${pl.id}`, query: { edit: '1' } })
}

async function addSelectionToPlaylist(): Promise<void> {
  if (!selectedIds.value.size) return
  const name = prompt('New set list name', 'Concert set')
  if (name == null) return
  const pl = await playlists.createPlaylist(name.trim() || 'Concert set')
  await playlists.addEntries(pl.id, [...selectedIds.value])
  clearSelection()
  await router.push(`/library/playlists/${pl.id}`)
}

async function onCreateEmptySong(): Promise<void> {
  importModalOpen.value = false
  if (importBusy.value) return
  importBusy.value = true
  try {
    const entry = await library.createEmptyEntry({
      groupId: library.activeGroupId ?? undefined,
    })
    await navigateToLocalEntry(router, entry.id, { edit: true })
  } catch (e) {
    snackbar.show(e instanceof Error ? e.message : 'Could not create empty song.', {
      tone: 'error',
    })
  } finally {
    importBusy.value = false
  }
}

function openImportModal(): void {
  // Keep legacy file inputs mounted for tests / fallback.
  void separateInput.value
  void combineInput.value

  moreMenuOpen.value = false
  importModalOpen.value = true
}

async function onImportPick(payload: {
  mode: 'combined' | 'separate'
  files: File[]
}): Promise<void> {
  importModalOpen.value = false
  if (!payload.files.length) return
  warnIfLargeFiles(payload.files)
  if (payload.mode === 'combined') {
    combineFiles.value = payload.files
    return
  }
  // separate
  if (importBusy.value) return
  importBusy.value = true
  try {
    const created = await library.importFilesSeparate(payload.files, {
      groupId: library.activeGroupId ?? undefined,
    })
    if (!created.length) return
    const ids = created.map((e) => e.id)
    await navigateToLocalEntry(router, ids[0]!, { edit: true, importQueue: ids })
  } catch (e) {
    snackbar.show(e instanceof Error ? e.message : 'Could not import files.', { tone: 'error' })
  } finally {
    importBusy.value = false
  }
}


async function onSeparateSelected(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const files = input.files ? [...input.files] : []
  input.value = ''
  if (!files.length || importBusy.value) return
  warnIfLargeFiles(files)
  importBusy.value = true
  try {
    const created = await library.importFilesSeparate(files, {
      groupId: library.activeGroupId ?? undefined,
    })
    if (!created.length) return
    const ids = created.map((e) => e.id)
    await navigateToLocalEntry(router, ids[0]!, { edit: true, importQueue: ids })
  } catch (e) {
    snackbar.show(e instanceof Error ? e.message : 'Could not import files.', { tone: 'error' })
  } finally {
    importBusy.value = false
  }
}

function onCombineSelected(event: Event): void {
  const input = event.target as HTMLInputElement
  const files = input.files ? [...input.files] : []
  input.value = ''
  if (!files.length) return
  warnIfLargeFiles(files)
  combineFiles.value = files
}

async function onCombineConfirm(payload: {
  files: File[]
  roles: LocalAssetRole[]
  labels: string[]
  partIds?: Array<string | null>
  title: string
}): Promise<void> {
  if (importBusy.value) return
  importBusy.value = true
  try {
    const entry = await library.importFilesCombined(payload.files, {
      groupId: library.activeGroupId ?? undefined,
      title: payload.title,
      roles: payload.roles,
      labels: payload.labels,
      partIds: payload.partIds,
    })
    combineFiles.value = []
    await navigateToLocalEntry(router, entry.id, { edit: true })
  } catch (e) {
    snackbar.show(e instanceof Error ? e.message : 'Could not import song.', { tone: 'error' })
  } finally {
    importBusy.value = false
  }
}

function toggleSelect(id: string): void {
  const next = new Set(selectedIds.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  selectedIds.value = next
  if (next.size) selectMode.value = true
  else selectMode.value = false
}

function clearSelection(): void {
  selectedIds.value = new Set()
  selectMode.value = false
}

function clearLongPressTimer(): void {
  if (longPressTimer != null) {
    clearTimeout(longPressTimer)
    longPressTimer = null
  }
  longPressId = null
}

function onRowPointerDown(e: PointerEvent, id: string): void {
  if (!isNarrow.value || showRowSelect.value) return
  if (e.button !== 0) return
  const t = e.target as HTMLElement | null
  if (t?.closest('.sel-btn, .drag-handle')) return
  clearLongPressTimer()
  longPressX = e.clientX
  longPressY = e.clientY
  longPressId = id
  longPressTimer = setTimeout(() => {
    longPressTimer = null
    const entryId = longPressId
    longPressId = null
    if (entryId == null) return
    selectMode.value = true
    if (!selectedIds.value.has(entryId)) toggleSelect(entryId)
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

function selectGroup(id: string | null): void {
  library.activeGroupId = id
}

function transferEntries(ids: string[]): void {
  if (!prefs.opticalTransferEnabled || !ids.length) return
  if (ids.length === 1) {
    transferEntryId.value = ids[0]!
    return
  }
  pendingMultiTransferIds.value = ids
}

function confirmMultiTransfer(): void {
  const ids = pendingMultiTransferIds.value
  pendingMultiTransferIds.value = null
  if (!ids?.length) return
  const picks: Record<string, string[]> = {}
  let total = 0
  for (const id of ids) {
    const assets = defaultOpticalTransferAssets(library.assetsFor(id))
    picks[id] = assets.map((a) => a.id)
    total += assets.reduce((s, a) => s + a.byteLength, 0)
  }
  const sizeWarn = formatLocalSizeWarn(total)
  if (sizeWarn) snackbar.show(sizeWarn, { tone: 'info', ms: 5000 })
  clearSelection()
  navigateToOpticalTransfer(router, {
    localDocIds: ids,
    localAssetIdsByEntry: picks,
    openNow: true,
  })
}

function onListTransferConfirm(assetIds: string[]): void {
  const id = transferEntryId.value
  if (!id) return
  transferEntryId.value = null
  const assets = library.assetsFor(id).filter((a) => assetIds.includes(a.id))
  const total = assets.reduce((s, a) => s + a.byteLength, 0)
  const sizeWarn = formatLocalSizeWarn(Math.max(total, ...assets.map((a) => a.byteLength)))
  if (sizeWarn) snackbar.show(sizeWarn, { tone: 'info', ms: 5000 })
  clearSelection()
  navigateToOpticalTransfer(router, {
    localDocIds: [id],
    localAssetIdsByEntry: { [id]: assetIds },
    openNow: true,
  })
}

function warnIfLargeFiles(files: File[]): void {
  const biggest = files.reduce((m, f) => Math.max(m, f.size), 0)
  const total = files.reduce((s, f) => s + f.size, 0)
  const msg = formatLocalSizeWarn(Math.max(biggest, total >= LOCAL_ENTRY_WARN_BYTES ? total : 0))
  if (msg) snackbar.show(msg, { tone: 'info', ms: 5000 })
}

async function onCreateGroup(): Promise<void> {
  if (groupBusy.value) return
  groupBusy.value = true
  try {
    const g = await library.createGroup(groupName.value)
    groupName.value = ''
    if (g) {
      library.activeGroupId = g.id
      snackbar.show(`Created group “${g.name}”`, { tone: 'ok', ms: 2500 })
    }
  } catch (e) {
    snackbar.show(e instanceof Error ? e.message : 'Could not create group.', { tone: 'error' })
  } finally {
    groupBusy.value = false
  }
}

async function confirmBulkDelete(): Promise<void> {
  pendingBulkDelete.value = false
  const ids = [...selectedIds.value]
  if (!ids.length) return
  for (const id of ids) await library.removeEntry(id)
  clearSelection()
  snackbar.show(`Removed ${ids.length} song${ids.length === 1 ? '' : 's'}`, { tone: 'ok', ms: 2500 })
}

async function confirmDeleteGroup(): Promise<void> {
  const id = pendingDeleteGroupId.value
  pendingDeleteGroupId.value = null
  if (!id) return
  await library.removeGroup(id)
  snackbar.show('Group deleted', { tone: 'ok', ms: 2500 })
}

function deleteSelected(): void {
  if (!selectedIds.value.size) return
  pendingBulkDelete.value = true
}

async function removeSelectedFromActiveGroup(): Promise<void> {
  const gid = library.activeGroupId
  if (!gid) return
  const ids = [...selectedIds.value]
  if (!ids.length) return
  await library.removeEntriesFromGroup(gid, ids)
  clearSelection()
  const name = library.groups.find((g) => g.id === gid)?.name ?? 'group'
  snackbar.show(`Removed from “${name}”`, { tone: 'ok', ms: 2500 })
}

function onAddedToGroup(_groupId: string, groupNameDone: string): void {
  clearSelection()
  snackbar.show(`Added to “${groupNameDone}”`, { tone: 'ok', ms: 2500 })
}

function openMergeStaging(): void {
  const ids = [...selectedIds.value]
  if (ids.length < 2) return
  mergeEntryIds.value = ids
}

const mergeStagingEntries = computed(() => {
  const ids = mergeEntryIds.value
  if (!ids?.length) return []
  return ids
    .map((id) => {
      const entry = library.entries.find((e) => e.id === id)
      if (!entry) return null
      return { entry, assets: library.assetsFor(id) }
    })
    .filter((x): x is NonNullable<typeof x> => !!x)
})

async function onMergeConfirm(payload: {
  targetId: string
  sourceIds: string[]
  assets: Array<{ id: string; role: LocalAssetRole; label: string }>
  title: string
  appendNotes: boolean
}): Promise<void> {
  mergeBusy.value = true
  try {
    const entry = await library.mergeEntries(payload.targetId, payload.sourceIds, {
      assets: payload.assets,
      title: payload.title,
      appendNotes: payload.appendNotes,
    })
    mergeEntryIds.value = null
    clearSelection()
    snackbar.show(`Merged into “${entry.title}”`, { tone: 'ok', ms: 2500 })
    await navigateToLocalEntry(router, entry.id, { edit: true })
  } catch (e) {
    snackbar.show(e instanceof Error ? e.message : 'Could not merge songs.', { tone: 'error' })
  } finally {
    mergeBusy.value = false
  }
}

function startRenameGroup(id: string): void {
  const g = library.groups.find((x) => x.id === id)
  if (!g) return
  renameGroupId.value = id
  renameGroupName.value = g.name
}

async function confirmRenameGroup(): Promise<void> {
  const id = renameGroupId.value
  if (!id || groupBusy.value) return
  groupBusy.value = true
  try {
    const g = await library.renameGroup(id, renameGroupName.value)
    renameGroupId.value = null
    if (g) snackbar.show(`Renamed to “${g.name}”`, { tone: 'ok', ms: 2500 })
  } catch (e) {
    snackbar.show(e instanceof Error ? e.message : 'Could not rename group.', { tone: 'error' })
  } finally {
    groupBusy.value = false
  }
}

function groupsForEntry(entryId: string) {
  const entry = library.entries.find((e) => e.id === entryId)
  if (!entry?.groupIds.length) return []
  return library.groups.filter((g) => entry.groupIds.includes(g.id))
}
</script>

<template>
  <section
    class="library"
    :class="{ 'has-selection': selectedIds.size > 0 }"
    aria-label="Local Library"
  >
    <input
      ref="separateInput"
      class="visually-hidden"
      type="file"
      :accept="acceptAttr"
      multiple
      @change="onSeparateSelected"
    />
    <input
      ref="combineInput"
      class="visually-hidden"
      type="file"
      :accept="acceptAttr"
      multiple
      @change="onCombineSelected"
    />
    <input
      ref="restoreInput"
      class="visually-hidden"
      type="file"
      accept=".zip,application/zip"
      aria-label="Restore Local Library backup"
      @change="onRestoreSelected"
    />

    <div class="actions">
      <button
        type="button"
        class="btn btn-primary"
        :disabled="importBusy || backupBusy"
        @click="openImportModal"
      >
        Add Song
      </button>
      <button type="button" class="btn" @click="manageGroupsOpen = true">Manage groups</button>
      <div ref="moreMenuRef" class="more-menu-wrap">
        <button
          type="button"
          class="btn more-menu-btn"
          :aria-expanded="moreMenuOpen"
          aria-haspopup="menu"
          aria-label="More library actions"
          @click="moreMenuOpen = !moreMenuOpen"
        >
          <span class="more-menu-icon" aria-hidden="true">⋮</span>
        </button>
        <div v-if="moreMenuOpen" class="more-menu" role="menu">
          <RouterLink
            v-if="prefs.opticalTransferEnabled"
            class="more-menu-item"
            role="menuitem"
            to="/tx"
            @click="moreMenuOpen = false"
          >
            Optical transfer
          </RouterLink>
          <button
            type="button"
            class="more-menu-item"
            role="menuitem"
            @click="openImportModal"
          >
            Add Song
          </button>
          <button
            type="button"
            class="more-menu-item"
            role="menuitem"
            :disabled="backupBusy"
            @click="onBackupExport"
          >
            Backup library…
          </button>
          <button
            type="button"
            class="more-menu-item"
            role="menuitem"
            :disabled="backupBusy"
            @click="openRestorePicker"
          >
            Restore backup…
          </button>
        </div>
      </div>
    </div>

    <p v-if="backupMessage" class="backup-status" role="status">{{ backupMessage }}</p>
    <p v-if="libraryBytes != null || deviceStorage" class="storage-meter" aria-live="polite">
      <template v-if="libraryBytes != null">
        Local Library ≈ {{ formatBytes(libraryBytes) }}
      </template>
      <template v-if="libraryBytes != null && deviceStorage"> · </template>
      <template v-if="deviceStorage">
        Device {{ formatBytes(deviceStorage.usage) }} / {{ formatBytes(deviceStorage.quota) }}
      </template>
    </p>


    <div class="library-tabs" role="tablist" aria-label="Library sections">
      <button
        type="button"
        role="tab"
        class="tab"
        :class="{ on: libraryTab === 'songs' }"
        :aria-selected="libraryTab === 'songs'"
        @click="setLibraryTab('songs')"
      >
        Songs
      </button>
      <button
        type="button"
        role="tab"
        class="tab"
        :class="{ on: libraryTab === 'playlists' }"
        :aria-selected="libraryTab === 'playlists'"
        @click="setLibraryTab('playlists')"
      >
        Set Lists
      </button>
    </div>

    <div v-show="libraryTab === 'songs'" class="search-toolbar">
      <div class="searchrow">
        <div class="search-field">
          <input
            v-model="searchQuery"
            type="search"
            enterkeyhint="search"
            autocomplete="off"
            autocorrect="off"
            spellcheck="false"
            placeholder="Search titles, arrangers, notes, lyrics…"
            aria-label="Search local library"
          />
          <div class="search-infield">
            <button
              v-if="searchQuery"
              type="button"
              class="icon-btn clear-infield"
              aria-label="Clear search"
              title="Clear search"
              @click="searchQuery = ''"
            >
              ✕
            </button>
          </div>
        </div>
        <button
          type="button"
          class="options-btn"
          :aria-expanded="searchOptionsOpen"
          aria-controls="library-options"
          :title="searchOptionsOpen ? 'Hide search options' : 'Show search options'"
          @click="searchOptionsOpen = !searchOptionsOpen"
        >
          ⋮
        </button>
      </div>
      <div v-if="searchOptionsOpen" id="library-options" class="search-options">
        <p class="opt-hint tip">
          Searches title, arranger, notes, and lyric hints. Tip: multiple words (AND),
          <code>-word</code> to exclude, or
          <code>title:</code> / <code>arranger:</code> / <code>notes:</code> /
          <code>lyrics:</code> / <code>key:</code>.
        </p>
      </div>
    </div>

    <p v-if="library.error" class="err" role="alert">{{ library.error }}</p>

    <div v-show="libraryTab === 'songs'" class="collection-bar" role="toolbar" aria-label="Groups">
      <button
        type="button"
        class="chip"
        :class="{ on: !library.activeGroupId }"
        :aria-pressed="!library.activeGroupId"
        @click="selectGroup(null)"
      >
        All
        <span class="chip-n">{{ library.entries.length }}</span>
      </button>
      <div class="collection-strip" :class="{ paged: showGroupPager }">
        <button
          v-if="showGroupPager"
          type="button"
          class="collection-strip-nav"
          :disabled="groupPage <= 0"
          aria-label="Previous groups"
          @click="groupPage -= 1"
        >
          <span aria-hidden="true">‹</span>
        </button>
        <div ref="groupStripHost" class="collection-strip-body">
          <div ref="groupMeasureEl" class="collection-measure" aria-hidden="true">
            <span v-for="g in groupChips" :key="g.id" class="chip">
              {{ g.name }}
              <span class="chip-n">{{ groupCounts[g.id] ?? 0 }}</span>
            </span>
          </div>
          <div class="collection-page" aria-label="Group page">
            <button
              v-for="g in pagedGroupChips"
              :key="g.id"
              type="button"
              class="chip"
              :class="{ on: library.activeGroupId === g.id }"
              :aria-pressed="library.activeGroupId === g.id"
              @click="selectGroup(g.id)"
            >
              {{ g.name }}
              <span class="chip-n">{{ groupCounts[g.id] ?? 0 }}</span>
            </button>
          </div>
        </div>
        <button
          v-if="showGroupPager"
          type="button"
          class="collection-strip-nav"
          :disabled="groupPage >= groupPageCount - 1"
          aria-label="Next groups"
          @click="groupPage += 1"
        >
          <span aria-hidden="true">›</span>
        </button>
      </div>
    </div>

    <div
      v-if="library.loaded && library.entries.length"
      v-show="libraryTab === 'songs'" class="results-meta"
      aria-live="polite"
    >
      <div class="text-muted count">{{ resultsCountLabel }}</div>
    </div>

    <template v-if="libraryTab === 'songs'">
    <p v-if="!library.loaded" class="text-muted" role="status">Loading library…</p>
    <EmptyState
      v-else-if="!library.entries.length"
      title="No songs yet"
      message="Add a PDF, sheet image, or audio track — or create an empty song for pitch and lyric cues only."
    >
      <button type="button" class="btn btn-primary" @click="openImportModal">Add Song</button>
    </EmptyState>
    <EmptyState
      v-else-if="!orderedEntries.length && searchQuery.trim()"
      title="No matching songs"
      message="Try a different search, or clear the query."
    />
    <EmptyState
      v-else-if="!orderedEntries.length && activeGroup"
      title="Nothing in this group"
      message="Select songs with the checkboxes, then use Add to group — or import while this group is selected."
    />
    <ol
      v-else-if="orderedEntries.length"
      class="list"
      :class="listDraggingClass"
      aria-label="Local songs"
    >
      <li
        v-for="(entry, i) in orderedEntries"
        :key="entry.id"
        class="library-row"
        :data-index="i"
        :class="{
          'show-select': showRowSelect,
          'no-nav': dragActive,
          ...rowDragClass(entry.id, i),
        }"
        @pointerenter="onDragEnter($event, i)"
        @pointerdown="onRowPointerDown($event, entry.id)"
        @pointermove="onRowPointerMove"
        @pointerup="onRowPointerEnd"
        @pointercancel="onRowPointerEnd"
        @click.capture="onRowClickCapture"
      >
        <button
          v-if="canReorder"
          type="button"
          class="drag-handle"
          :aria-label="`Drag ${entry.title} to reorder`"
          aria-roledescription="sortable"
          @pointerdown="onHandlePointerDown($event, entry.id, i)"
        >
          ⠿
        </button>
        <button
          v-if="showRowSelect"
          type="button"
          class="sel-btn"
          :class="{ on: selectedIds.has(entry.id) }"
          :aria-pressed="selectedIds.has(entry.id)"
          :aria-label="`Select ${entry.title}`"
          @click.stop="toggleSelect(entry.id)"
        >
          {{ selectedIds.has(entry.id) ? '✓' : '' }}
        </button>
        <div class="row-main">
          <RouterLink
            class="row-link"
            :to="localEntryLocation(entry.id)"
            @click="onOpenEntry(entry.id, $event)"
          >
            <span class="row-title">{{ entry.title }}</span>
            <span class="row-meta">
              <span v-if="entry.key" title="Key">{{ entry.key }}</span>
              <span v-if="entry.arranger" :title="`Arranger: ${entry.arranger}`">{{
                entry.arranger
              }}</span>
              <span v-if="badgeFor(entry.id).sheet" class="badge" title="Has sheet music">Sheet</span>
              <span
                v-if="badgeFor(entry.id).tracks"
                class="badge"
                :title="`${badgeFor(entry.id).tracks} learning track${badgeFor(entry.id).tracks === 1 ? '' : 's'}`"
              >
                {{ badgeFor(entry.id).tracks }} track{{
                  badgeFor(entry.id).tracks === 1 ? '' : 's'
                }}
              </span>
              <span
                v-if="badgeFor(entry.id).empty"
                class="badge"
                title="No sheet or audio — pitch and lyric cues only"
              >Cue</span>
            </span>
            <span
              v-if="lyricsHintSnippet(entry.lyricsHint)"
              class="row-lyrics"
              title="Lyrics hint"
            >{{ lyricsHintSnippet(entry.lyricsHint) }}</span>
          </RouterLink>
          <div
            v-if="groupsForEntry(entry.id).length"
            class="row-cols"
            role="group"
            :aria-label="`Groups for ${entry.title}`"
          >
            <button
              v-for="g in groupsForEntry(entry.id)"
              :key="g.id"
              type="button"
              class="col-chip"
              :class="{ on: library.activeGroupId === g.id }"
              :aria-pressed="library.activeGroupId === g.id"
              @click.stop="selectGroup(library.activeGroupId === g.id ? null : g.id)"
            >
              {{ g.name }}
            </button>
          </div>
        </div>
      </li>
    </ol>
    </template>

    <Teleport to="body">
      <div
        v-if="selectedIds.size > 0 && libraryTab === 'songs'"
        class="selection-bar"
        role="toolbar"
        aria-label="Local Library selection"
      >
        <span class="sel-count">{{ selectedIds.size }} selected</span>
        <button type="button" class="btn" @click="groupPickerOpen = true">
          <span class="label-long">Add to group</span>
          <span class="label-short">Group</span>
        </button>
        <button type="button" class="btn" @click="addSelectionToPlaylist">
          <span class="label-long">Add to set list</span>
          <span class="label-short">Set List</span>
        </button>
        <button
          v-if="selectedIds.size >= 2"
          type="button"
          class="btn"
          @click="openMergeStaging"
        >
          Merge
        </button>
        <button
          v-if="prefs.opticalTransferEnabled"
          type="button"
          class="btn"
          @click="transferEntries([...selectedIds])"
        >
          <span class="label-long">Optical transfer</span>
          <span class="label-short">Transfer</span>
        </button>
        <button
          v-if="library.activeGroupId"
          type="button"
          class="btn"
          @click="removeSelectedFromActiveGroup"
        >
          <span class="label-long">Remove from group</span>
          <span class="label-short">Ungroup</span>
        </button>
        <button
          type="button"
          class="btn btn-remove-icon"
          aria-label="Delete selected"
          title="Delete selected"
          @click="deleteSelected"
        >
          ×
        </button>
        <button type="button" class="btn btn-ghost" @click="clearSelection">Clear</button>
      </div>
    </Teleport>

    <LocalGroupPickerSheet
      :open="groupPickerOpen"
      :entry-ids="[...selectedIds]"
      title="Add to group"
      @close="groupPickerOpen = false"
      @done="onAddedToGroup"
    />

    <FilterSheet :open="manageGroupsOpen" title="Manage groups" @close="manageGroupsOpen = false">
      <div class="manage-groups">
        <form class="group-create" @submit.prevent="onCreateGroup">
          <label class="visually-hidden" for="local-group-name">New group name</label>
          <input
            id="local-group-name"
            v-model="groupName"
            class="group-input"
            type="text"
            maxlength="80"
            placeholder="New group name"
            autocomplete="off"
          />
          <button type="submit" class="btn btn-primary" :disabled="groupBusy || !groupName.trim()">
            Add
          </button>
        </form>
        <ul v-if="library.groups.length" class="group-manage-list">
          <li v-for="g in library.groups" :key="g.id" class="group-manage-row">
            <span class="group-manage-name">
              {{ g.name }}
              <span class="text-muted">({{ groupCounts[g.id] ?? 0 }})</span>
            </span>
            <div class="group-manage-actions">
              <button
                type="button"
                class="btn btn-ghost group-rename-btn"
                :aria-label="`Rename group ${g.name}`"
                @click="startRenameGroup(g.id)"
              >
                Rename
              </button>
              <button
                type="button"
                class="row-remove"
                :aria-label="`Delete group ${g.name}`"
                @click="pendingDeleteGroupId = g.id"
              >
                ×
              </button>
            </div>
          </li>
        </ul>
        <p v-else class="text-muted">No groups yet.</p>
      </div>
    </FilterSheet>

    <FilterSheet
      :open="!!renameGroupId"
      title="Rename group"
      @close="renameGroupId = null"
    >
      <form class="group-create" @submit.prevent="confirmRenameGroup">
        <label class="visually-hidden" for="local-group-rename">Group name</label>
        <input
          id="local-group-rename"
          v-model="renameGroupName"
          class="group-input"
          type="text"
          maxlength="80"
          autocomplete="off"
        />
        <button
          type="submit"
          class="btn btn-primary"
          :disabled="groupBusy || !renameGroupName.trim()"
        >
          Save
        </button>
      </form>
    </FilterSheet>


    <div v-show="libraryTab === 'playlists'" class="playlists-panel">
      <form class="new-playlist" @submit.prevent="createPlaylist">
        <input
          v-model="newPlaylistName"
          type="text"
          maxlength="80"
          placeholder="New set list…"
          aria-label="New set list name"
        />
        <button type="submit" class="btn btn-primary">Create</button>
      </form>
      <EmptyState
        v-if="playlists.loaded && !playlists.sorted.length"
        title="No set lists yet"
        message="Create a concert set list, then add songs from the Songs tab."
      />
      <ul v-else class="playlist-list" aria-label="Set lists">
        <li v-for="pl in playlists.sorted" :key="pl.id">
          <RouterLink class="playlist-link" :to="`/library/playlists/${pl.id}`">
            <span class="playlist-title">{{ pl.name }}</span>
            <span class="playlist-meta"
              >{{ pl.items.length }} song{{ pl.items.length === 1 ? '' : 's'
              }}<template v-if="pl.sungItemIds?.length">
                · {{ pl.sungItemIds.length }} sung</template
              ></span
            >
          </RouterLink>
        </li>
      </ul>
    </div>

    <LocalImportModal
      :open="importModalOpen"
      :optical-enabled="prefs.opticalTransferEnabled"
      @close="importModalOpen = false"
      @pick="onImportPick"
      @empty="onCreateEmptySong"
    />

    <LocalLibraryCombineStaging
      v-if="combineFiles.length"
      :files="combineFiles"
      :busy="importBusy"
      heading="Review import"
      @confirm="onCombineConfirm"
      @cancel="combineFiles = []"
    />

    <LocalLibraryMergeStaging
      v-if="mergeStagingEntries.length >= 2"
      :entries="mergeStagingEntries"
      :busy="mergeBusy"
      @confirm="onMergeConfirm"
      @cancel="mergeEntryIds = null"
    />

    <LocalEntryTransferSheet
      :open="!!transferEntry"
      :title="transferEntry?.title ?? ''"
      :assets="transferAssets"
      @close="transferEntryId = null"
      @confirm="onListTransferConfirm"
    />
    <ConfirmDialog
      :open="pendingBulkDelete"
      title="Delete from Local Library?"
      :message="pendingBulkDeleteTitle"
      confirm-label="Delete"
      @close="pendingBulkDelete = false"
      @confirm="confirmBulkDelete"
    />
    <ConfirmDialog
      :open="!!pendingDeleteGroupId"
      title="Delete group?"
      :message="pendingDeleteGroupTitle"
      confirm-label="Delete"
      @close="pendingDeleteGroupId = null"
      @confirm="confirmDeleteGroup"
    />
    <ConfirmDialog
      :open="!!pendingMultiTransferIds?.length"
      title="Transfer selected songs?"
      :message="
        pendingMultiTransferIds
          ? `${pendingMultiTransferIds.length} songs will send the primary sheet only (no audio tracks). Continue?`
          : ''
      "
      confirm-label="Transfer"
      :danger="false"
      @close="pendingMultiTransferIds = null"
      @confirm="confirmMultiTransfer"
    />
  </section>
</template>

<style scoped>
.library.has-selection {
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
  text-decoration: none;
  cursor: pointer;
}
.more-menu-item:hover {
  background: color-mix(in srgb, var(--accent) 10%, var(--surface));
  color: var(--accent-hover);
}
.collection-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  gap: 0.45rem;
  margin-bottom: 0.35rem;
}
.collection-strip {
  flex: 1 1 12rem;
  min-width: 0;
  display: grid;
  grid-template-columns: 1fr;
  align-items: start;
  gap: 0.35rem;
}
.collection-strip.paged {
  grid-template-columns: auto 1fr auto;
}
.collection-strip-body {
  position: relative;
  min-width: 0;
}
.collection-measure {
  position: absolute;
  visibility: hidden;
  pointer-events: none;
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  top: 0;
  left: 0;
}
.collection-page {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}
.collection-strip-nav {
  min-width: 40px;
  min-height: 40px;
  border-radius: 10px;
  border: 1px solid var(--border);
  background: var(--surface);
  font: inherit;
  font-size: 1.25rem;
  line-height: 1;
  cursor: pointer;
}
.collection-strip-nav:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.chip {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  min-height: 36px;
  padding: 0.3rem 0.7rem;
  border-radius: 999px;
  border: 1px solid var(--border);
  background: var(--surface);
  font: inherit;
  font-size: 0.88rem;
  font-weight: 600;
  cursor: pointer;
}
.chip.on {
  border-color: color-mix(in srgb, var(--accent) 45%, var(--border));
  background: color-mix(in srgb, var(--accent) 12%, var(--surface));
  color: var(--accent);
}
.chip-n {
  font-variant-numeric: tabular-nums;
  font-size: 0.8rem;
  color: var(--muted);
  font-weight: 700;
}
.chip.on .chip-n {
  color: inherit;
  opacity: 0.85;
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
.list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: grid;
  gap: 0.5rem;
}
.library-row {
  position: relative;
  display: grid;
  grid-template-columns: 1fr auto;
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
.library-row.show-select {
  grid-template-columns: auto 1fr auto;
}
.library-row.show-select:has(.drag-handle) {
  grid-template-columns: auto auto 1fr auto;
}
.library-row:has(.drag-handle):not(.show-select) {
  grid-template-columns: auto 1fr auto;
}
.library-row.no-nav .row-link {
  pointer-events: none;
}
.library-row.dragging {
  z-index: 3;
  opacity: 1;
  transform: scale(1.02) translateY(-2px);
  border-color: var(--accent);
  background: color-mix(in srgb, var(--accent) 10%, var(--surface));
  box-shadow: 0 10px 28px color-mix(in srgb, var(--text) 18%, transparent);
}
.library-row.dragging .drag-handle {
  color: var(--accent);
  cursor: grabbing;
}
.library-row.drop-before::before,
.library-row.drop-after::after {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  height: 3px;
  border-radius: 999px;
  background: var(--accent);
  pointer-events: none;
  z-index: 4;
}
.library-row.drop-before::before {
  top: -0.28rem;
}
.library-row.drop-after::after {
  bottom: -0.28rem;
}
.list-dragging {
  user-select: none;
  cursor: grabbing;
}
.list-dragging .library-row:not(.dragging) {
  opacity: 0.55;
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
.search-toolbar {
  display: grid;
  gap: 0.4rem;
  margin-bottom: 0.75rem;
  padding: 0.15rem 0 0;
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
  padding: 0.75rem 2.75rem 0.75rem 0.95rem;
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
.search-infield {
  position: absolute;
  right: 0.35rem;
  top: 50%;
  transform: translateY(-50%);
  display: flex;
  align-items: center;
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
  font-size: 0.85rem;
  font-weight: 700;
  line-height: 1;
  cursor: pointer;
}
.icon-btn:hover {
  background: color-mix(in srgb, var(--border) 45%, transparent);
  color: var(--text);
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
.row-main {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
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
.row-title {
  font-weight: 650;
  overflow-wrap: anywhere;
}
.row-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0.65rem;
  font-size: 0.92rem;
  color: var(--muted);
}
.row-meta .badge {
  color: var(--accent);
  font-size: 0.8rem;
  font-weight: 600;
}
.row-lyrics {
  color: var(--muted);
  font-size: 0.88rem;
  font-style: italic;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 100%;
}
.row-remove {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 44px;
  min-height: 44px;
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
.row-cols {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
  padding: 0 0.35rem 0.45rem;
}
.col-chip {
  display: inline-flex;
  align-items: center;
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
}
.col-chip.on {
  border-color: var(--accent);
  background: color-mix(in srgb, var(--accent) 22%, var(--surface));
}
.err {
  margin: 0 0 0.75rem;
  color: var(--danger);
}
.text-muted {
  color: var(--muted);
}
.manage-groups {
  display: grid;
  gap: 1rem;
  padding: 0.25rem 0 0.5rem;
}
.group-create {
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem;
}
.group-input {
  flex: 1 1 10rem;
  min-width: 0;
  padding: 0.55rem 0.65rem;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface);
  color: var(--text);
  font: inherit;
  font-size: 16px;
}
.group-manage-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0.25rem;
}
.group-manage-row {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  border-bottom: 1px solid var(--border);
}
.group-manage-name {
  flex: 1;
  min-width: 0;
  font-weight: 600;
}
.group-manage-actions {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  flex-shrink: 0;
}
.group-rename-btn {
  min-height: 36px;
  padding: 0.25rem 0.55rem;
  font-size: 0.85rem;
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
.btn {
  min-height: 44px;
  padding: 0.45rem 0.85rem;
  border-radius: 10px;
  border: 1px solid var(--border);
  background: var(--surface);
  font: inherit;
  font-weight: 650;
  text-decoration: none;
  color: inherit;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.btn-primary {
  background: var(--accent);
  border-color: var(--accent);
  color: #fff;
}

.options-btn {
  min-width: var(--touch, 44px);
  min-height: var(--touch, 44px);
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--surface);
  color: var(--muted);
  font-size: 1.1rem;
  cursor: pointer;
}
.search-options {
  display: grid;
  gap: 0.45rem;
  padding: 0.55rem 0.65rem;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: color-mix(in srgb, var(--bg) 55%, var(--surface));
}
.opt-hint {
  display: block;
  font-size: 0.78rem;
  font-weight: 500;
  color: var(--muted);
}
.opt-hint.tip {
  margin: 0;
}
.opt-hint code {
  font-size: 0.75rem;
}
.row-badges {
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem;
  margin-top: 0.25rem;
}
.badge {
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  padding: 0.12rem 0.4rem;
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--accent) 35%, var(--border));
  color: var(--accent);
  background: color-mix(in srgb, var(--accent) 8%, var(--surface));
}

.library-tabs {
  display: flex;
  gap: 0.35rem;
  padding: 0 0.15rem;
}
.library-tabs .tab {
  flex: 1;
  min-height: 40px;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: var(--surface);
  color: var(--muted);
  font: inherit;
  font-weight: 650;
  cursor: pointer;
}
.library-tabs .tab.on {
  color: var(--accent);
  border-color: color-mix(in srgb, var(--accent) 45%, var(--border));
  background: color-mix(in srgb, var(--accent) 10%, var(--surface));
}
.playlists-panel {
  display: grid;
  gap: 0.75rem;
  padding: 0.25rem 0 1rem;
}
.new-playlist {
  display: flex;
  gap: 0.45rem;
}
.new-playlist input {
  flex: 1;
  min-height: var(--touch, 44px);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 0.35rem 0.55rem;
  font: inherit;
  background: var(--surface);
  color: var(--text);
}
.playlist-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0.45rem;
}
.playlist-link {
  display: grid;
  gap: 0.15rem;
  padding: 0.75rem 0.85rem;
  border: 1px solid var(--border);
  border-radius: var(--radius, 10px);
  background: var(--surface);
  color: inherit;
  text-decoration: none;
  min-height: 56px;
  align-content: center;
}
.playlist-link:hover {
  background: color-mix(in srgb, var(--accent) 6%, var(--surface));
  color: var(--accent-hover, var(--accent));
}
.playlist-title {
  font-weight: 700;
}
.playlist-meta {
  font-size: 0.8rem;
  color: var(--muted);
}

.backup-status {
  margin: 0.35rem 0 0;
  font-size: 0.85rem;
  color: var(--muted);
}
.storage-meter {
  margin: 0.25rem 0 0.5rem;
  font-size: 0.8rem;
  color: var(--muted);
}
</style>

<style>
/* Match TagSelectionBar chrome (teleported). */
.selection-bar {
  container-type: inline-size;
  container-name: selection-bar;
  position: fixed;
  left: 0;
  right: 0;
  z-index: 25;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.35rem;
  padding: 0.55rem 0.6rem;
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
  font-size: 0.88rem;
}
.selection-bar .btn {
  flex: 0 1 auto;
  min-width: 0;
  min-height: 44px;
  font-size: 0.88rem;
  padding: 0.45rem 0.55rem;
  border-radius: 10px;
  border: 1px solid var(--border);
  background: var(--surface);
  font: inherit;
  font-weight: 650;
  cursor: pointer;
}
.selection-bar .label-short {
  display: none;
}
.selection-bar .label-long {
  display: inline;
}
.selection-bar .btn-ghost {
  background: transparent;
  border: none;
}
.selection-bar .btn-remove-icon {
  min-width: 44px;
  min-height: 44px;
  padding: 0;
  font-size: 1.5rem;
  line-height: 1;
  font-weight: 400;
  color: var(--muted);
}
.selection-bar .btn-remove-icon:hover {
  color: var(--danger);
}
@container selection-bar (max-width: 34rem) {
  .selection-bar .label-long {
    display: none;
  }
  .selection-bar .label-short {
    display: inline;
  }
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
