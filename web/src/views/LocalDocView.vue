<script setup lang="ts">
/**
 * Local Library entry: Tag-like view (default) + Edit mode (?edit=1).
 */
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import EmptyState from '../components/EmptyState.vue'
import SheetViewer from '../components/SheetViewer.vue'
import PitchControls from '../components/PitchControls.vue'
import TagPlayer from '../components/TagPlayer.vue'
import LocalEntryTransferSheet from '../components/LocalEntryTransferSheet.vue'
import LocalAssetPreview from '../components/LocalAssetPreview.vue'
import { navigateToOpticalTransfer } from '../lib/decimen/opticalTransferNav'
import {
  isLocalEntryEditQuery,
  isLocalEntryFullscreenQuery,
  navigateToLocalEntry,
  parseImportQueue,
  patchLocalEntryQuery,
} from '../lib/localDocOpen'
import {
  PitchPlayer,
  formatKeyShiftLabel,
  keyToTonicNote,
  clampPitchSemitones,
} from '../audio/pitchPlayer'
import {
  getActivePitchPipeVoice,
  PITCH_PIPE_VOICE_CHANGE_EVENT,
} from '../audio/pitchPipeVoice'
import { uniqueTrackPartKey } from '../lib/localAssetHeuristics'
import { PRIMARY_PARTS, partLabel } from '../lib/parts'
import { useLocalLibraryStore } from '../stores/localLibrary'
import { useLocalPlaylistsStore } from '../stores/localPlaylists'
import { usePreferencesStore } from '../stores/preferences'
import { useSnackbarStore } from '../stores/snackbar'
import type { LocalAsset, LocalEntry } from '../types/localLibrary'
import {
  LOCAL_ASSET_ROLES,
  LOCAL_LIBRARY_KEY_OPTIONS,
  groupLocalAssetsByRole,
  isLocalAudioMime,
  isLocalImageMime,
  isLocalPdfMime,
  localAssetRoleLabel,
  localLibraryKeyLabel,
} from '../types/localLibrary'
import type { SheetImageSet, SheetPdfFile } from '../lib/sheetAssets'
import { formatBytes } from '../offline/storageEstimate'
import { formatLocalSizeWarn } from '../lib/localDocReceive'
import { buildZip, downloadBlob } from '../download/zip'

const props = defineProps<{ id: string }>()

const library = useLocalLibraryStore()
const playlists = useLocalPlaylistsStore()

const PART_CHOICES: { value: string; label: string }[] = [
  { value: '', label: 'Auto / custom' },
  ...PRIMARY_PARTS.map((p) => ({ value: p, label: partLabel(p) })),
]
const prefs = usePreferencesStore()
const snackbar = useSnackbarStore()
const router = useRouter()
const route = useRoute()

const entry = ref<LocalEntry | null>(null)
const loadError = ref<string | null>(null)
const ownedUrls = ref<string[]>([])
const sheetViewerRef = ref<InstanceType<typeof SheetViewer> | null>(null)
const sheetFullscreenActive = ref(false)
const tracksFullscreenActive = ref(false)

const draftTitle = ref('')
const draftArranger = ref('')
const draftNotes = ref('')
const draftLyricsHint = ref('')
const draftKey = ref('')
const draftDetune = ref(0)
const saveBusy = ref(false)
const filesEditing = ref(false)

const keyShift = ref(0)
const pitch = new PitchPlayer(getActivePitchPipeVoice())

const imageSets = ref<SheetImageSet[]>([])
const pdfs = ref<SheetPdfFile[]>([])
const trackParts = ref<Record<string, string>>({})
const trackPartIds = ref<string[]>([])
/** assetId → TagPlayer part key (for Files → player). */
const trackPartByAssetId = ref<Record<string, string>>({})
const tagPlayerRef = ref<{
  togglePlay: () => Promise<void>
  stopPlayback: () => Promise<void>
  seek: (t: number) => void
  selectPart: (p: string) => void
  isPaused: () => boolean
  getCurrentTime: () => number
  getDuration: () => number
  isPlayReady: () => boolean
  isBaking: () => boolean
} | null>(null)
const playerTick = ref(0)
let playerTickTimer: ReturnType<typeof setInterval> | null = null
function startPlayerTick(): void {
  if (playerTickTimer) return
  playerTickTimer = setInterval(() => {
    playerTick.value++
  }, 250)
}
function stopPlayerTick(): void {
  if (!playerTickTimer) return
  clearInterval(playerTickTimer)
  playerTickTimer = null
}
/** Force-open Tracks when playing a file from the Files list. */
const tracksOpen = ref(true)

const editing = computed(() => isLocalEntryEditQuery(route.query))

watch(editing, (on) => {
  if (!on) filesEditing.value = false
})
const openSheetFullscreen = computed(
  () => isLocalEntryFullscreenQuery(route.query) && hasSheet.value,
)
const importQueue = computed(() => parseImportQueue(route.query))

/**
 * Whether this entry was opened already intending fullscreen (deep link / open-immediately).
 * Do not flip this when the user later toggles fullscreen from the song page — that would
 * incorrectly show “Song Page” even though ✕ already returns here.
 */
const arrivedViaFullscreenLink = ref(isLocalEntryFullscreenQuery(route.query))
watch(
  () => [props.id, route.query.playlist, route.query.pitem] as const,
  () => {
    arrivedViaFullscreenLink.value = isLocalEntryFullscreenQuery(route.query)
  },
)

/**
 * ✕ destination while sheet is fullscreen.
 * Immediate / set-list fullscreen → back to Library or the set list (offer Song Page in ⋮).
 * Opened from the entry page itself → stay here (`lib page`; no Song Page menu item).
 */
const sheetExitOriginLabel = computed(() => {
  if (inPlaylistContext.value) return activePlaylist.value?.name || 'Set List'
  if (arrivedViaFullscreenLink.value) return 'Library'
  return 'lib page'
})

const assets = computed(() => library.assetsFor(props.id))

/** Files list: grouped by role, A→Z within each group. */
const assetGroups = computed(() => groupLocalAssetsByRole(assets.value))

const keyOptions = computed(() => {
  const current = draftKey.value.trim()
  if (current && !(LOCAL_LIBRARY_KEY_OPTIONS as readonly string[]).includes(current)) {
    return [current, ...LOCAL_LIBRARY_KEY_OPTIONS]
  }
  return [...LOCAL_LIBRARY_KEY_OPTIONS]
})

const pitchLabel = computed(() => {
  const key = draftKey.value.trim() || entry.value?.key || null
  return formatKeyShiftLabel(key, keyShift.value)
})

const canPayKey = computed(() => {
  const key = draftKey.value.trim() || entry.value?.key || null
  return !!keyToTonicNote(key)
})

const hasSheet = computed(() => imageSets.value.length > 0 || pdfs.value.length > 0)

const hasAudio = computed(() => trackPartIds.value.length > 0)

const hasMixTrack = computed(() => trackPartIds.value.includes('mix'))
const mixPlaying = computed(() => {
  void playerTick.value
  const p = tagPlayerRef.value
  return p && typeof p.isPaused === 'function' ? !p.isPaused() : false
})
const mixCurrentTime = computed(() => {
  void playerTick.value
  const p = tagPlayerRef.value
  return p && typeof p.getCurrentTime === 'function' ? p.getCurrentTime() : 0
})
const mixDuration = computed(() => {
  void playerTick.value
  const p = tagPlayerRef.value
  return p && typeof p.getDuration === 'function' ? p.getDuration() : 0
})
const mixPlayReady = computed(() => {
  void playerTick.value
  if (!hasMixTrack.value) return false
  const p = tagPlayerRef.value
  return p && typeof p.isPlayReady === 'function' ? p.isPlayReady() : false
})
const mixBaking = computed(() => {
  void playerTick.value
  const p = tagPlayerRef.value
  return p && typeof p.isBaking === 'function' ? p.isBaking() : false
})

async function onSheetPlayToggle(): Promise<void> {
  const p = tagPlayerRef.value
  if (!p || !hasMixTrack.value) return
  try {
    p.selectPart('mix')
  } catch {
    /* ignore */
  }
  await p.togglePlay()
  playerTick.value++
  startPlayerTick()
}

function onSheetSeek(t: number): void {
  tagPlayerRef.value?.seek(t)
  playerTick.value++
}

async function onSheetPlayStop(): Promise<void> {
  const p = tagPlayerRef.value
  if (!p) return
  await p.stopPlayback()
  playerTick.value++
}



const playlistId = computed(() =>
  typeof route.query.playlist === 'string' && route.query.playlist.trim()
    ? route.query.playlist.trim()
    : null,
)
const playlistItemId = computed(() =>
  typeof route.query.pitem === 'string' && route.query.pitem.trim()
    ? route.query.pitem.trim()
    : null,
)
const activePlaylist = computed(() =>
  playlistId.value ? playlists.byId(playlistId.value) : undefined,
)
const playlistItems = computed(() => activePlaylist.value?.items ?? [])
const playlistIndex = computed(() => {
  if (!playlistItemId.value) return -1
  return playlistItems.value.findIndex((i) => i.id === playlistItemId.value)
})
const playlistPositionLabel = computed(() => {
  if (!activePlaylist.value || playlistIndex.value < 0) return null
  return `${playlistIndex.value + 1} / ${playlistItems.value.length}`
})
const inPlaylistContext = computed(() => !!activePlaylist.value && playlistIndex.value >= 0)

const neighborIds = computed(() => library.filteredEntries.map((e) => e.id))
const neighborIndex = computed(() => neighborIds.value.indexOf(props.id))
const prevNeighbor = computed(() => {
  if (inPlaylistContext.value) {
    const idx = playlistIndex.value
    if (idx <= 0) return null
    const item = playlistItems.value[idx - 1]
    return item ? { entryId: item.entryId, itemId: item.id } : null
  }
  if (neighborIndex.value > 0) {
    const entryId = neighborIds.value[neighborIndex.value - 1]
    return entryId ? { entryId, itemId: null as string | null } : null
  }
  return null
})
const nextNeighbor = computed(() => {
  if (inPlaylistContext.value) {
    const idx = playlistIndex.value
    if (idx < 0 || idx >= playlistItems.value.length - 1) return null
    const item = playlistItems.value[idx + 1]
    return item ? { entryId: item.entryId, itemId: item.id } : null
  }
  if (neighborIndex.value >= 0 && neighborIndex.value < neighborIds.value.length - 1) {
    const entryId = neighborIds.value[neighborIndex.value + 1]
    return entryId ? { entryId, itemId: null as string | null } : null
  }
  return null
})

function setListBackTarget(focusItemId?: string | null): string {
  if (!playlistId.value) return '/library'
  const focus = focusItemId?.trim()
  if (focus) return `/library/playlists/${playlistId.value}?focus=${encodeURIComponent(focus)}`
  return `/library/playlists/${playlistId.value}`
}

async function markCurrentSetItemSung(): Promise<void> {
  if (!playlistId.value || !playlistItemId.value) return
  await playlists.markItemSung(playlistId.value, playlistItemId.value)
}

function entryHasSheet(entryId: string): boolean {
  return library.assetsFor(entryId).some(
    (a) => a.role === 'sheet' || a.role === 'alternateSheet' || a.role === 'image',
  )
}

async function goNeighbor(target: { entryId: string; itemId: string | null } | null): Promise<void> {
  if (!target) return
  if (inPlaylistContext.value) await markCurrentSetItemSung()
  const wantFs =
    openSheetFullscreen.value ||
    (inPlaylistContext.value && (activePlaylist.value?.openFullscreen || prefs.singMode))
  const keepFs = wantFs && entryHasSheet(target.entryId)
  if (wantFs && !keepFs) {
    snackbar.show('No sheet music available.', { tone: 'info' })
  }
  const itemShift = target.itemId
    ? clampPitchSemitones(
        activePlaylist.value?.items.find((i) => i.id === target.itemId)?.keyShift ?? 0,
      )
    : 0
  void router.push({
    path: `/library/${target.entryId}`,
    query: {
      ...(keepFs ? { fullscreen: '1' } : {}),
      ...(playlistId.value && target.itemId
        ? { playlist: playlistId.value, pitem: target.itemId }
        : {}),
      ...(itemShift ? { shift: String(itemShift) } : {}),
    },
  })
}

async function exitToLibraryOrigin(): Promise<void> {
  const focusId = playlistItemId.value
  if (inPlaylistContext.value) await markCurrentSetItemSung()
  void router.push(setListBackTarget(focusId))
}

const queuePosition = computed(() => {
  const q = importQueue.value
  if (!q.length) return null
  const i = q.indexOf(props.id)
  if (i < 0) return null
  return { index: i, total: q.length }
})

function revokeOwned(): void {
  for (const u of ownedUrls.value) URL.revokeObjectURL(u)
  ownedUrls.value = []
  imageSets.value = []
  pdfs.value = []
  trackParts.value = {}
  trackPartIds.value = []
  trackPartByAssetId.value = {}
}

async function buildMedia(list: LocalAsset[]): Promise<void> {
  revokeOwned()
  const imgs: SheetImageSet[] = []
  const pdfList: SheetPdfFile[] = []
  const tracks: Record<string, string> = {}
  const trackIds: string[] = []
  const partByAsset: Record<string, string> = {}
  const usedPartKeys = new Set<string>()
  const urls: string[] = []

  for (const asset of list) {
    const blobRec = await library.getLocalAssetBlob(asset.id)
    if (!blobRec) continue
    const blob = new Blob([blobRec.data], { type: blobRec.mime || asset.mime })
    const url = URL.createObjectURL(blob)
    urls.push(url)

    if (asset.role === 'track' || isLocalAudioMime(asset.mime, asset.filename)) {
      const partId = uniqueTrackPartKey(
        asset.partId,
        asset.label || asset.filename,
        usedPartKeys,
      )
      tracks[partId] = url
      trackIds.push(partId)
      partByAsset[asset.id] = partId
      continue
    }
    if (
      asset.role === 'sheet' ||
      asset.role === 'alternateSheet' ||
      isLocalPdfMime(asset.mime) ||
      asset.filename.toLowerCase().endsWith('.pdf')
    ) {
      if (isLocalPdfMime(asset.mime) || asset.filename.toLowerCase().endsWith('.pdf')) {
        pdfList.push({
          id: asset.id,
          label: asset.label || asset.filename,
          path: url,
          cacheKey: `local-asset:${asset.id}`,
        })
      } else if (isLocalImageMime(asset.mime, asset.filename)) {
        imgs.push({ id: asset.id, label: asset.label || asset.filename, paths: [url] })
      }
      continue
    }
    if (asset.role === 'image' || isLocalImageMime(asset.mime, asset.filename)) {
      imgs.push({ id: asset.id, label: asset.label || asset.filename, paths: [url] })
    }
  }

  ownedUrls.value = urls
  imageSets.value = imgs
  pdfs.value = pdfList
  trackParts.value = tracks
  trackPartIds.value = trackIds
  trackPartByAssetId.value = partByAsset
}

async function loadEntry(): Promise<void> {
  loadError.value = null
  await Promise.all([library.ensureLoaded(), playlists.ensureLoaded()])
  const meta =
    library.entries.find((e) => e.id === props.id) ?? (await library.getLocalEntry(props.id))
  if (!meta) {
    entry.value = null
    revokeOwned()
    // PWA has no reliable Back — send missing/stale song URLs to Browse.
    await router.replace({ name: 'home' })
    return
  }
  entry.value = meta
  draftTitle.value = meta.title
  draftArranger.value = meta.arranger
  draftNotes.value = meta.notes
  draftLyricsHint.value = meta.lyricsHint ?? ''
  draftKey.value = meta.key ?? ''
  draftDetune.value = meta.detuneCents ?? 0
  keyShift.value = readShiftFromQuery()
  const list = await library.reloadAssets(meta.id)
  await buildMedia(list)
  // Cue-only / no sheet: drop a fullscreen deep-link and explain (Sing mode / set list / shared URL).
  if (isLocalEntryFullscreenQuery(route.query) && !(imageSets.value.length || pdfs.value.length)) {
    await patchLocalEntryQuery(router, { fullscreen: null })
    snackbar.show('No sheet music available.', { tone: 'info' })
  }
}

onMounted(() => {
  void loadEntry()
})

watch(
  () => route.query.shift,
  () => {
    keyShift.value = readShiftFromQuery()
  },
)

watch(
  () => props.id,
  () => {
    void loadEntry()
  },
)

onUnmounted(() => {
  stopPlayerTick()
  window.removeEventListener(PITCH_PIPE_VOICE_CHANGE_EVENT, syncPitchVoice)
  revokeOwned()
  pitch.stop()
  pitch.dispose()
})

function syncPitchVoice(): void {
  pitch.setVoice(getActivePitchPipeVoice())
}

if (typeof window !== 'undefined') {
  window.addEventListener(PITCH_PIPE_VOICE_CHANGE_EVENT, syncPitchVoice)
}

async function saveMeta(): Promise<boolean> {
  if (!entry.value || saveBusy.value) return false
  saveBusy.value = true
  try {
    const next = await library.updateMeta(entry.value.id, {
      title: draftTitle.value,
      arranger: draftArranger.value,
      notes: draftNotes.value,
      lyricsHint: draftLyricsHint.value,
      key: draftKey.value || null,
      detuneCents: draftDetune.value,
    })
    if (next) {
      entry.value = next
      snackbar.show('Saved', { tone: 'ok', ms: 2000 })
      return true
    }
    return false
  } catch (e) {
    snackbar.show(e instanceof Error ? e.message : 'Could not save.', { tone: 'error' })
    return false
  } finally {
    saveBusy.value = false
  }
}

async function enterEdit(): Promise<void> {
  await patchLocalEntryQuery(router, { edit: '1' })
}

async function exitEdit(): Promise<void> {
  await patchLocalEntryQuery(router, { edit: null, importQueue: null })
}

async function doneEdit(): Promise<void> {
  await saveMeta()
  await exitEdit()
}

async function saveAndNext(): Promise<void> {
  if (!(await saveMeta())) return
  const q = importQueue.value
  const i = q.indexOf(props.id)
  const next = i >= 0 ? q[i + 1] : null
  if (next) {
    await navigateToLocalEntry(router, next, { edit: true, importQueue: q })
    return
  }
  await exitEdit()
}

async function skipImport(): Promise<void> {
  const q = importQueue.value
  const i = q.indexOf(props.id)
  const next = i >= 0 ? q[i + 1] : null
  if (next) {
    await navigateToLocalEntry(router, next, { edit: true, importQueue: q })
    return
  }
  await exitEdit()
}

const transferSheetOpen = ref(false)

function transferOptically(): void {
  if (!entry.value || !prefs.opticalTransferEnabled) return
  transferSheetOpen.value = true
}

function onTransferConfirm(assetIds: string[]): void {
  if (!entry.value) return
  transferSheetOpen.value = false
  const assets = library.assetsFor(entry.value.id).filter((a) => assetIds.includes(a.id))
  const total = assets.reduce((s, a) => s + a.byteLength, 0)
  const sizeWarn = formatLocalSizeWarn(Math.max(total, ...assets.map((a) => a.byteLength), 0))
  if (sizeWarn) snackbar.show(sizeWarn, { tone: 'info', ms: 5000 })
  navigateToOpticalTransfer(router, {
    localDocIds: [entry.value.id],
    localAssetIdsByEntry: { [entry.value.id]: assetIds },
    openNow: true,
  })
}

function tonicNote() {
  const key = draftKey.value.trim() || entry.value?.key || null
  return keyToTonicNote(key)
}

const mixDetuneCents = computed(
  () => prefs.globalPitchDetuneCents() + (entry.value?.detuneCents ?? 0),
)


function readShiftFromQuery(): number {
  const raw = route.query.shift
  if (typeof raw !== 'string' || raw === '') return 0
  const n = Number(raw)
  return Number.isFinite(n) ? clampPitchSemitones(n) : 0
}

async function payKeyDown(): Promise<void> {
  const note = tonicNote()
  if (!note) return
  const shiftCents = keyShift.value * 100
  await pitch.start(note, shiftCents + mixDetuneCents.value)
}

function payKeyUp(): void {
  pitch.stop()
}

function enterSheetFullscreen(): void {
  sheetViewerRef.value?.enterFullscreen?.()
}

async function onSheetFullscreenChange(active: boolean): Promise<void> {
  sheetFullscreenActive.value = active
  if (active) tracksFullscreenActive.value = false
  await patchLocalEntryQuery(router, { fullscreen: active ? '1' : null })
}

function onTracksFullscreenChange(active: boolean): void {
  tracksFullscreenActive.value = active
  if (active) sheetFullscreenActive.value = false
}

async function onAssetRoleChange(asset: LocalAsset, role: string): Promise<void> {
  await library.updateAssetMeta(asset.id, { role: role as LocalAsset['role'] })
  await buildMedia(library.assetsFor(props.id))
}

async function onAssetPartChange(asset: LocalAsset, partId: string): Promise<void> {
  const next = partId.trim() || null
  await library.updateAssetMeta(asset.id, { partId: next })
  await buildMedia(library.assetsFor(props.id))
}

async function onRemoveAsset(assetId: string): Promise<void> {
  await library.removeAsset(assetId)
  await buildMedia(library.assetsFor(props.id))
}

async function onAddFiles(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const files = input.files ? [...input.files] : []
  input.value = ''
  if (!files.length || !entry.value) return
  try {
    await library.addFilesToEntry(entry.value.id, files)
    await buildMedia(library.assetsFor(props.id))
    snackbar.show('Files added', { tone: 'ok', ms: 2000 })
  } catch (e) {
    snackbar.show(e instanceof Error ? e.message : 'Could not add files.', { tone: 'error' })
  }
}


function blobForAsset(asset: LocalAsset): () => Promise<Blob | null> {
  return async () => {
    const rec = await library.getLocalAssetBlob(asset.id)
    if (!rec) return null
    return new Blob([rec.data], { type: rec.mime || asset.mime })
  }
}

/** Non-primary voice parts play in TagPlayer instead of a local HTMLAudioElement. */
function usesExternalAudioPlayer(asset: LocalAsset): boolean {
  const partKey = trackPartByAssetId.value[asset.id]
  if (!partKey) return false
  return !(PRIMARY_PARTS as readonly string[]).includes(partKey)
}

async function playAssetInTagPlayer(asset: LocalAsset): Promise<void> {
  const partKey = trackPartByAssetId.value[asset.id]
  const player = tagPlayerRef.value
  if (!partKey || !player) return
  tracksOpen.value = true
  player.selectPart(partKey)
  await nextTick()
  await player.play()
  document.getElementById('local-tracks')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
}

const exportBusy = ref<string | null>(null)

async function exportAsset(asset: LocalAsset): Promise<void> {
  if (exportBusy.value) return
  exportBusy.value = asset.id
  try {
    const rec = await library.getLocalAssetBlob(asset.id)
    if (!rec) {
      snackbar.show('File not found in library storage.', { tone: 'error' })
      return
    }
    const name = asset.filename || asset.label || 'file'
    downloadBlob(new Uint8Array(rec.data), name, rec.mime || asset.mime || 'application/octet-stream')
  } catch (e) {
    snackbar.show(e instanceof Error ? e.message : 'Export failed.', { tone: 'error' })
  } finally {
    exportBusy.value = null
  }
}

async function exportAllAsZip(): Promise<void> {
  if (!entry.value || !assets.value.length || exportBusy.value) return
  exportBusy.value = 'all'
  try {
    const files: Array<{ name: string; data: Uint8Array }> = []
    const used = new Set<string>()
    for (const asset of assets.value) {
      const rec = await library.getLocalAssetBlob(asset.id)
      if (!rec) continue
      let name = asset.filename || asset.label || asset.id
      if (used.has(name)) {
        const dot = name.lastIndexOf('.')
        const stem = dot > 0 ? name.slice(0, dot) : name
        const ext = dot > 0 ? name.slice(dot) : ''
        name = `${stem}-${asset.id.slice(0, 6)}${ext}`
      }
      used.add(name)
      files.push({ name, data: new Uint8Array(rec.data) })
    }
    if (!files.length) {
      snackbar.show('No files to export.', { tone: 'error' })
      return
    }
    const base = (entry.value.title || 'song').replace(/[^\w.\-]+/g, '_').slice(0, 40) || 'song'
    downloadBlob(buildZip(files), `${base}.zip`, 'application/zip')
  } catch (e) {
    snackbar.show(e instanceof Error ? e.message : 'Export failed.', { tone: 'error' })
  } finally {
    exportBusy.value = null
  }
}

</script>

<template>
  <EmptyState v-if="loadError" title="Local Library" :message="loadError" tone="danger">
    <RouterLink class="btn" to="/library">Back to Local Library</RouterLink>
  </EmptyState>

  <section v-else-if="entry" class="tag" aria-label="Local song">
    <div class="top-row">
      <button type="button" class="btn btn-ghost" @click="exitToLibraryOrigin">
        ← {{ inPlaylistContext ? (activePlaylist?.name || 'Set List') : 'Library' }}
      </button>
      <div v-if="playlistPositionLabel" class="playlist-pos" aria-live="polite">
        {{ playlistPositionLabel }}
      </div>
      <div v-if="prevNeighbor || nextNeighbor" class="pager" :class="{ concert: inPlaylistContext }">
        <button
          type="button"
          class="btn btn-ghost"
          :disabled="!prevNeighbor"
          aria-label="Previous song"
          @click="goNeighbor(prevNeighbor)"
        >
          ←
        </button>
        <button
          type="button"
          class="btn btn-ghost"
          :disabled="!nextNeighbor"
          aria-label="Next song"
          @click="goNeighbor(nextNeighbor)"
        >
          →
        </button>
      </div>
    </div>

    <header class="title-row">
      <div class="title-block">
        <div class="title-head">
          <h1>{{ entry.title }}</h1>
          <div class="title-actions">
            <button
              v-if="!editing"
              type="button"
              class="title-copy"
              @click="enterEdit"
            >
              Edit
            </button>
            <button
              v-if="prefs.opticalTransferEnabled"
              type="button"
              class="title-copy"
              @click="transferOptically"
            >
              Transfer
            </button>
          </div>
        </div>
      </div>
      <p class="id-line">
        <span v-if="entry.arranger" class="arranger">{{ entry.arranger }}</span>
        <span v-if="entry.key" class="arranger">{{ entry.key }}</span>
      </p>
    </header>

    <p v-if="queuePosition" class="import-banner" role="status">
      Import {{ queuePosition.index + 1 }} of {{ queuePosition.total }} — set details, then continue.
    </p>

    <section class="section pitch-section" aria-labelledby="pitch-heading">
      <h2 id="pitch-heading" class="section-heading">Pitch</h2>
      <div class="section-body">
        <PitchControls
          v-model="keyShift"
          :pitch-label="pitchLabel"
          :pay-key-enabled="canPayKey"
          @pay-down="payKeyDown"
          @pay-up="payKeyUp"
        />
        <p v-if="!canPayKey" class="tip">Set a key in Edit to enable pay-the-key.</p>
      </div>
    </section>

    <details class="section" open>
      <summary class="section-summary sheet-section-head">
        <span class="sheet-section-title">Sheet music</span>
        <button
          v-if="hasSheet && !sheetFullscreenActive && !tracksFullscreenActive"
          type="button"
          class="sheet-section-fs"
          aria-label="Fullscreen sheet"
          title="Fullscreen"
          @click.prevent.stop="enterSheetFullscreen"
        >
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false">
            <path
              fill="currentColor"
              d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"
            />
          </svg>
        </button>
      </summary>
      <div class="section-body sheet-slot">
        <SheetViewer
          v-if="hasSheet"
          ref="sheetViewerRef"
          :image-sets="imageSets"
          :pdfs="pdfs"
          :offline="true"
          :can-choose-format="imageSets.length > 0 && pdfs.length > 0"
          :crop-to-content="true"
          :pay-key-enabled="canPayKey"
          :key-label="pitchLabel"
          :shift="keyShift"
          :sing-controls="hasAudio"
          :auto-enter-fullscreen="openSheetFullscreen"
          :playing="mixPlaying"
          :play-ready="mixPlayReady"
          :current-time="mixCurrentTime"
          :duration="mixDuration"
          :baking="mixBaking"
          :exit-origin-label="sheetExitOriginLabel"
          details-page-label="Song Page"
          @pay-down="payKeyDown"
          @pay-up="payKeyUp"
          @shift-delta="keyShift = clampPitchSemitones(keyShift + $event)"
          @shift-reset="keyShift = 0"
          @fullscreen-change="onSheetFullscreenChange"
          @play-toggle="onSheetPlayToggle"
          @play-stop="onSheetPlayStop"
          @seek="onSheetSeek"
          @exit-origin="exitToLibraryOrigin"
        />
        <div v-else class="cue-only" role="status">
          <p class="tip">
            Cue-only song — no sheet on this device. Use key and lyric hint below for set lists.
            Add files anytime in Edit.
          </p>
        </div>
      </div>
    </details>

    <details id="local-tracks" class="section" :open="tracksOpen && hasAudio">
      <summary class="section-summary sheet-section-head">
        <span class="sheet-section-title">Tracks</span>
      </summary>
      <div class="section-body">
        <TagPlayer
          v-if="hasAudio"
          ref="tagPlayerRef"
          :parts="trackParts"
          :available-parts="trackPartIds"
          :pitch-semitones="keyShift"
          :detune-cents="mixDetuneCents"
          :song-key="entry.key || undefined"
          :pay-key-enabled="canPayKey"
          :exit-origin-label="inPlaylistContext ? (activePlaylist?.name || 'Set List') : 'Library'"
          @update:pitch-semitones="keyShift = $event"
          @pay-down="payKeyDown"
          @pay-up="payKeyUp"
          @fullscreen-change="onTracksFullscreenChange"
          @exit-origin="exitToLibraryOrigin"
        />
        <p v-else class="tip">No learning tracks yet — add audio in Edit.</p>
      </div>
    </details>

    <details class="section">
      <summary class="section-summary">Details</summary>
      <div v-if="!editing" class="section-body">
        <dl class="meta-dl">
          <div><dt>Title</dt><dd>{{ entry.title }}</dd></div>
          <div v-if="entry.arranger"><dt>Arranger</dt><dd>{{ entry.arranger }}</dd></div>
          <div v-if="entry.key"><dt>Key</dt><dd>{{ entry.key }}</dd></div>
          <div v-if="entry.lyricsHint"><dt>Lyrics hint</dt><dd>{{ entry.lyricsHint }}</dd></div>
          <div v-if="entry.notes"><dt>Notes</dt><dd>{{ entry.notes }}</dd></div>
          <div>
            <dt>Files</dt>
            <dd>{{ library.summaryFor(entry.id) }}</dd>
          </div>
        </dl>
      </div>
      <div v-else class="section-body edit-body">
        <div class="meta-grid">
          <label>
            Title
            <input v-model="draftTitle" type="text" maxlength="200" />
          </label>
          <label>
            Arranger
            <input v-model="draftArranger" type="text" maxlength="120" />
          </label>
          <label>
            Key
            <select v-model="draftKey">
              <option v-for="opt in keyOptions" :key="opt || 'none'" :value="opt">
                {{ localLibraryKeyLabel(opt) }}
              </option>
            </select>
          </label>
          <label>
            Lyrics hint
            <input
              v-model="draftLyricsHint"
              type="text"
              maxlength="120"
              placeholder="Short cue for set list cards"
            />
          </label>
          <label class="notes">
            Notes
            <textarea v-model="draftNotes" rows="3" maxlength="2000" />
          </label>
        </div>

        <div class="edit-actions">
          <template v-if="queuePosition">
            <button type="button" class="btn" :disabled="saveBusy" @click="skipImport">Skip</button>
            <button type="button" class="btn btn-primary" :disabled="saveBusy" @click="saveAndNext">
              {{ queuePosition.index + 1 >= queuePosition.total ? 'Save' : 'Save & next' }}
            </button>
          </template>
          <template v-else>
            <button type="button" class="btn" :disabled="saveBusy" @click="saveMeta">
              {{ saveBusy ? 'Saving…' : 'Save' }}
            </button>
            <button type="button" class="btn btn-primary" :disabled="saveBusy" @click="doneEdit">
              Done
            </button>
          </template>
        </div>
      </div>
    </details>

    <details class="section">
      <summary class="section-summary">
        <span>Files</span>
        <span class="section-meta">{{ library.summaryFor(entry.id) }}</span>
      </summary>
      <div class="section-body files-body">
        <div class="files-toolbar">
          <button
            v-if="assets.length > 1"
            type="button"
            class="btn btn-ghost"
            :disabled="!!exportBusy"
            @click="exportAllAsZip"
          >
            {{ exportBusy === 'all' ? 'Exporting…' : 'Export as zip' }}
          </button>
          <button
            v-if="!filesEditing"
            type="button"
            class="btn btn-ghost"
            @click="filesEditing = true"
          >
            Edit
          </button>
          <button
            v-else
            type="button"
            class="btn btn-ghost"
            @click="filesEditing = false"
          >
            Done editing
          </button>
        </div>

        <template v-if="assetGroups.length">
          <div v-for="group in assetGroups" :key="group.role" class="asset-group">
            <h3 class="asset-group-title">{{ group.label }}</h3>
            <ul class="asset-list">
              <li v-for="asset in group.assets" :key="asset.id" class="asset-row">
                <div class="asset-main">
                  <span class="asset-name">{{ asset.label || asset.filename }}</span>
                  <span class="asset-meta">{{ formatBytes(asset.byteLength) }}</span>
                  <LocalAssetPreview
                    :mime="asset.mime"
                    :filename="asset.filename"
                    :get-blob="blobForAsset(asset)"
                    :external-audio="usesExternalAudioPlayer(asset)"
                    @play-external="playAssetInTagPlayer(asset)"
                  />
                  <button
                    type="button"
                    class="btn btn-ghost"
                    :disabled="!!exportBusy"
                    :aria-label="`Export ${asset.filename || asset.label}`"
                    @click="exportAsset(asset)"
                  >
                    {{ exportBusy === asset.id ? '…' : 'Export' }}
                  </button>
                </div>
                <template v-if="filesEditing">
                  <select
                    :value="asset.role"
                    aria-label="Role"
                    @change="onAssetRoleChange(asset, ($event.target as HTMLSelectElement).value)"
                  >
                    <option v-for="r in LOCAL_ASSET_ROLES" :key="r" :value="r">
                      {{ localAssetRoleLabel(r) }}
                    </option>
                  </select>
                  <select
                    v-if="asset.role === 'track'"
                    :value="asset.partId ?? ''"
                    aria-label="Part"
                    @change="onAssetPartChange(asset, ($event.target as HTMLSelectElement).value)"
                  >
                    <option v-for="p in PART_CHOICES" :key="p.value || 'auto'" :value="p.value">
                      {{ p.label }}
                    </option>
                  </select>
                  <button type="button" class="btn btn-ghost danger" @click="onRemoveAsset(asset.id)">
                    Remove
                  </button>
                </template>
              </li>
            </ul>
          </div>
        </template>
        <p v-else class="tip">No files yet.</p>

        <label v-if="filesEditing" class="add-files btn">
          Add files
          <input class="visually-hidden" type="file" multiple @change="onAddFiles" />
        </label>
      </div>
    </details>
  </section>

  <p v-else class="loading" role="status">Loading…</p>

  <LocalEntryTransferSheet
    :open="transferSheetOpen"
    :title="entry?.title ?? ''"
    :assets="assets"
    @close="transferSheetOpen = false"
    @confirm="onTransferConfirm"
  />
</template>

<style scoped>
.tag {
  min-width: 0;
  max-width: 100%;
}
.top-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  margin-bottom: 0.35rem;
  min-width: 0;
}
.pager {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  flex-wrap: nowrap;
  min-width: 0;
}
.pager.concert .btn {
  min-width: 3.25rem;
  min-height: 3rem;
  font-size: 1.35rem;
}
.playlist-pos {
  flex: 1;
  text-align: center;
  font-size: 0.85rem;
  font-weight: 650;
  color: var(--muted);
}
.pager .btn {
  min-height: 44px;
  min-width: 44px;
  padding: 0.4rem 0.65rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.title-row {
  display: grid;
  gap: 0.35rem;
  margin: 0.25rem 0 0.75rem;
  min-width: 0;
  max-width: 100%;
}
.title-block {
  min-width: 0;
}
.title-head {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem 0.75rem;
  flex-wrap: wrap;
  min-width: 0;
}
.title-head h1 {
  flex: 1 1 12rem;
  min-width: 0;
  margin: 0;
  font-family: var(--font-display);
  font-size: clamp(1.35rem, 6vw, 2rem);
  font-weight: 700;
  line-height: 1.2;
  max-width: 100%;
  overflow-wrap: anywhere;
}
.title-actions {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  flex-shrink: 0;
}
.title-copy {
  min-height: 36px;
  padding: 0.35rem 0.65rem;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: var(--surface);
  font: inherit;
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--muted);
  white-space: nowrap;
  cursor: pointer;
}
.id-line {
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem;
  align-items: center;
  margin: 0;
  min-width: 0;
}
.arranger {
  color: var(--muted);
  font-size: 0.95rem;
  min-width: 0;
  overflow-wrap: anywhere;
}
.arranger + .arranger::before {
  content: '·';
  margin-right: 0.45rem;
  color: var(--border);
}
.import-banner {
  margin: 0.35rem 0 0.75rem;
  padding: 0.55rem 0.75rem;
  border-radius: 10px;
  border: 1px solid color-mix(in srgb, var(--accent) 35%, var(--border));
  background: color-mix(in srgb, var(--accent) 10%, var(--surface));
  font-size: 0.9rem;
}
.section {
  margin: 1rem 0;
  padding: 0.75rem 0.85rem 0.95rem;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  min-width: 0;
  max-width: 100%;
}
.section-heading,
.section-summary {
  font-family: var(--font-display);
  font-size: 1.1rem;
  font-weight: 600;
  margin: 0;
}
.section-heading {
  margin-bottom: 0.35rem;
}
.section-summary {
  list-style: none;
  cursor: pointer;
  user-select: none;
  padding: 0.25rem 0 0.35rem;
}
.section-summary::-webkit-details-marker {
  display: none;
}
.section-summary::before {
  content: '▸';
  display: inline-block;
  margin-right: 0.45rem;
  transition: transform 0.15s ease;
  color: var(--muted);
  font-size: 0.85em;
}
.section[open] > .section-summary::before {
  transform: rotate(90deg);
}
.section-summary.sheet-section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.65rem;
}
.sheet-section-title {
  flex: 1;
  min-width: 0;
}
.sheet-section-fs {
  box-sizing: border-box;
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  margin: -0.15rem 0;
  padding: 0;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--bg);
  color: var(--text);
  cursor: pointer;
}
.section-body {
  margin-top: 0.75rem;
  display: grid;
  gap: 0.75rem;
  min-width: 0;
}
.pitch-section .section-body {
  margin-top: 0.65rem;
}
.tip {
  margin: 0.5rem 0 0;
  color: var(--muted);
  font-size: 0.85rem;
  line-height: 1.4;
}
@media (min-width: 640px) {
  .section {
    margin: 1.25rem 0;
    padding: 0.95rem 1.15rem 1.15rem;
  }
  .section-heading,
  .section-summary {
    font-size: 1.15rem;
  }
  .title-head h1 {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    overflow-wrap: normal;
  }
}
.meta-dl {
  margin: 0;
  display: grid;
  gap: 0.55rem;
}
.meta-dl > div {
  display: grid;
  gap: 0.15rem;
}
.meta-dl dt {
  font-size: 0.8rem;
  font-weight: 650;
  color: var(--muted);
}
.meta-dl dd {
  margin: 0;
  overflow-wrap: anywhere;
}
.meta-grid {
  display: grid;
  gap: 0.55rem;
}
.meta-grid label {
  display: grid;
  gap: 0.25rem;
  font-size: 0.85rem;
  font-weight: 600;
}
.meta-grid input,
.meta-grid textarea,
.meta-grid select,
.asset-row select {
  padding: 0.55rem 0.65rem;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface);
  color: var(--text);
  font: inherit;
  font-size: 16px;
  font-weight: 400;
}
.assets-h {
  margin: 1rem 0 0.4rem;
  font-size: 0.95rem;
}
.asset-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0.45rem;
}
.asset-group {
  display: grid;
  gap: 0.35rem;
}
.asset-group + .asset-group {
  margin-top: 0.85rem;
}
.asset-group-title {
  margin: 0;
  font-size: 0.8rem;
  font-weight: 600;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  color: var(--muted);
}
.asset-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.4rem;
  padding: 0.45rem 0;
  border-bottom: 1px solid var(--border);
}
.asset-name {
  flex: 1 1 8rem;
  font-weight: 600;
  overflow-wrap: anywhere;
}
.asset-meta {
  font-size: 0.8rem;
  color: var(--muted);
}
.edit-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem;
  margin-top: 0.85rem;
}
.loading {
  text-align: center;
  color: var(--muted);
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
.btn-ghost {
  background: transparent;
}
.danger {
  color: var(--danger);
}
.add-files {
  margin-top: 0.55rem;
  cursor: pointer;
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

.section-summary {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.section-meta {
  margin-left: auto;
  font-size: 0.8rem;
  font-weight: 500;
  color: var(--muted);
}
.files-toolbar {
  display: flex;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 0.35rem;
  margin-bottom: 0.35rem;
}
.asset-main {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.4rem;
  flex: 1 1 12rem;
  min-width: 0;
}
.files-body .tip {
  margin: 0.25rem 0;
  color: var(--muted);
  font-size: 0.9rem;
}
</style>
