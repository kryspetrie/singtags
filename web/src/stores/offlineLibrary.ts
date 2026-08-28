import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { indexesUrl, mediaUrl } from '../lib/mediaUrl'
import { audioPack, sheetsPack, type PackKind } from '../offline/libraryPack'
import {
  DownloadQueue,
  type DownloadItem,
  type DownloadProgress,
  type DownloadStatus,
} from '../offline/downloadQueue'
import {
  clearPackProgress,
  getPackProgress,
  putPackProgress,
  type PackProgressRecord,
} from '../offline/packProgressDb'
import {
  formatBytes,
  getStorageEstimate,
  isLikelyMeteredConnection,
  requestPersistentStorage,
  type StorageEstimateInfo,
} from '../offline/storageEstimate'
import {
  clearAllOfflineData as clearAllOfflineDataImpl,
  exportOfflineCacheZip,
  importOfflineCacheZip,
  type CacheProgress,
  CATALOG_CACHED_KEY,
} from '../offline/cacheManage'
import type { OfflineManifest, OfflineManifestEntry } from '../offline/manifestTypes'
import {
  filterAudioManifest,
  flattenFilteredAudioManifest,
  flattenManifestEntries,
} from '../lib/offlineManifest'
import {
  expectedAudioFileCount,
  expectedSheetsFileCount,
  packMissingFileCount,
  packStartIndex,
  packSyncAvailable,
} from '../lib/packSync'
import { OFFLINE_LOFI_AUDIO_BALLPARK_LABEL } from '../lib/offlineAudioBallpark'
import { fetchGzipJson, parseGzipJsonBuffer } from '../lib/gunzipJson'
import { matchOfflineCache } from '../lib/manualOfflineFetch'
import { loadPersistentSnapshot, savePersistentSnapshot } from '../lib/persistentSnapshot'
import type { LibraryAudioPartsMode } from '../lib/audioParts'
import { encodeBytesForStorage } from '../offline/compactAudio'
import { isPublishedTierPath } from '../lib/audioTiers'
import { storageSizeFactor, HOSTED_AUDIO_MIME, usesOpusStorage } from '../types/audio'
import { usePreferencesStore } from './preferences'
import { useOfflineModeStore } from './offlineMode'

export type { OfflineManifest, OfflineManifestEntry }

export type OfflineReadyState =
  | 'online'
  | 'offline-ready'
  | 'offline-limited'
  | 'downloading'
  | 'unknown'

export type StartPackOptions = {
  /** Override library parts filter for audio downloads (welcome uses `all`). */
  partsMode?: LibraryAudioPartsMode
}

const SHEETS_MANIFEST_SNAPSHOT_KEY = 'singtags.offlineSheetsManifest.v1'
const AUDIO_MANIFEST_SNAPSHOT_KEY = 'singtags.offlineAudioManifest.v1'

function saveManifestSnapshot(key: string, manifest: OfflineManifest): void {
  savePersistentSnapshot(key, manifest)
}

function isOfflineManifest(data: unknown): data is OfflineManifest {
  return (
    typeof data === 'object' &&
    data != null &&
    Array.isArray((data as OfflineManifest).entries)
  )
}

function loadManifestSnapshot(key: string): OfflineManifest | null {
  return loadPersistentSnapshot(key, isOfflineManifest)
}

async function loadOfflineManifest(
  fileName: string,
  snapshotKey: string,
): Promise<OfflineManifest | null> {
  const url = indexesUrl(fileName)
  try {
    const data = await fetchGzipJson<OfflineManifest>(url)
    saveManifestSnapshot(snapshotKey, data)
    return data
  } catch {
    try {
      const cached = await matchOfflineCache(url)
      if (cached) {
        const data = await parseGzipJsonBuffer<OfflineManifest>(await cached.arrayBuffer())
        saveManifestSnapshot(snapshotKey, data)
        return data
      }
    } catch {
      /* ignore */
    }
    return loadManifestSnapshot(snapshotKey)
  }
}

function flattenManifest(manifest: OfflineManifest): DownloadItem[] {
  return flattenManifestEntries(manifest)
}

export const useOfflineLibraryStore = defineStore('offlineLibrary', () => {
  const offlineMode = useOfflineModeStore()
  const sheetsManifest = ref<OfflineManifest | null>(null)
  const audioManifest = ref<OfflineManifest | null>(null)
  const sheetsStatus = ref<DownloadStatus>('idle')
  const audioStatus = ref<DownloadStatus>('idle')
  const sheetsProgress = ref<DownloadProgress | null>(null)
  const audioProgress = ref<DownloadProgress | null>(null)
  const sheetsCachedCount = ref(0)
  const audioCachedCount = ref(0)
  const sheetsCachedBytes = ref(0)
  const audioCachedBytes = ref(0)
  const estimate = ref<StorageEstimateInfo | null>(null)
  const error = ref<string | null>(null)
  const showSheetsPrompt = ref(false)
  /** Remote library grew vs local pack — toast offers sync (skip-existing). */
  const showPackSyncPrompt = ref(false)
  const catalogCachedAt = ref<string | null>(null)
  const loaded = ref(false)
  const cacheBusy = ref(false)
  const cacheProgress = ref<CacheProgress | null>(null)
  const cacheMessage = ref<string | null>(null)

  let sheetsQueue: DownloadQueue | null = null
  let audioQueue: DownloadQueue | null = null

  const sheetsTotalBytes = computed(() => sheetsManifest.value?.totalBytes ?? 0)
  const audioTotalBytes = computed(() => audioManifest.value?.totalBytes ?? 0)
  const audioBallparkLabel = computed(() => OFFLINE_LOFI_AUDIO_BALLPARK_LABEL)

  const sheetsExpectedCount = computed(() => expectedSheetsFileCount(sheetsManifest.value))
  const audioExpectedCount = computed(() => expectedAudioFileCount(audioManifest.value))
  const sheetsSyncAvailable = computed(() =>
    packSyncAvailable(sheetsCachedCount.value, sheetsExpectedCount.value, sheetsStatus.value),
  )
  const audioSyncAvailable = computed(() =>
    packSyncAvailable(audioCachedCount.value, audioExpectedCount.value, audioStatus.value),
  )
  const sheetsMissingCount = computed(() =>
    packMissingFileCount(sheetsCachedCount.value, sheetsExpectedCount.value, sheetsStatus.value),
  )
  const audioMissingCount = computed(() =>
    packMissingFileCount(audioCachedCount.value, audioExpectedCount.value, audioStatus.value),
  )

  const readyState = computed<OfflineReadyState>(() => {
    if (sheetsStatus.value === 'running' || audioStatus.value === 'running') {
      return 'downloading'
    }
    if (typeof navigator !== 'undefined' && !offlineMode.offline) return 'online'
    const sheetsOk =
      sheetsStatus.value === 'done' ||
      (sheetsManifest.value != null &&
        sheetsCachedCount.value > 0 &&
        sheetsCachedCount.value >= Math.floor((sheetsManifest.value.entries.length || 1) * 0.9))
    if (sheetsOk && catalogCachedAt.value) return 'offline-ready'
    if (catalogCachedAt.value) return 'offline-limited'
    return 'unknown'
  })

  const statusLabel = computed(() => {
    switch (readyState.value) {
      case 'online':
        return sheetsStatus.value === 'done' || sheetsCachedCount.value > 0
          ? `Online · sheets cached · ${formatBytes(estimate.value?.usage ?? 0)} used`
          : 'Online'
      case 'offline-ready':
        return 'Offline — songbook sheets ready'
      case 'offline-limited':
        return 'Offline — catalog only (download sheets in Settings)'
      case 'downloading': {
        const sheetsRun = sheetsStatus.value === 'running'
        const audioRun = audioStatus.value === 'running'
        if (sheetsRun && audioRun) return 'Downloading sheets and learning tracks…'
        if (sheetsRun) return 'Downloading sheets…'
        if (audioRun) return 'Downloading learning tracks…'
        return 'Downloading…'
      }
      default:
        return 'Offline status unknown'
    }
  })

  async function refreshEstimate(): Promise<void> {
    estimate.value = await getStorageEstimate()
    try {
      const [sheetsCount, audioCount, sheetsBytes, audioBytes] = await Promise.all([
        sheetsPack.count(),
        audioPack.count(),
        sheetsPack.totalBytes(),
        audioPack.totalBytes(),
      ])
      sheetsCachedCount.value = sheetsCount
      audioCachedCount.value = audioCount
      sheetsCachedBytes.value = sheetsBytes
      audioCachedBytes.value = audioBytes
    } catch {
      sheetsCachedCount.value = 0
      audioCachedCount.value = 0
      sheetsCachedBytes.value = 0
      audioCachedBytes.value = 0
    }
  }

  function packSyncDismissKey(sheets: OfflineManifest | null, audio: OfflineManifest | null): string {
    return `${sheets?.builtAt ?? ''}|${audio?.builtAt ?? ''}|${expectedSheetsFileCount(sheets)}|${expectedAudioFileCount(audio)}`
  }

  function readDismissedPackSyncKey(): string | null {
    try {
      return localStorage.getItem('singtags.dismissedPackSync.v1')
    } catch {
      return null
    }
  }

  function writeDismissedPackSyncKey(key: string): void {
    try {
      localStorage.setItem('singtags.dismissedPackSync.v1', key)
    } catch {
      /* ignore */
    }
  }

  function refreshPackSyncPrompt(): void {
    const needs =
      packSyncAvailable(sheetsCachedCount.value, sheetsExpectedCount.value, sheetsStatus.value) ||
      packSyncAvailable(audioCachedCount.value, audioExpectedCount.value, audioStatus.value)
    if (!needs) {
      showPackSyncPrompt.value = false
      return
    }
    const key = packSyncDismissKey(sheetsManifest.value, audioManifest.value)
    showPackSyncPrompt.value = readDismissedPackSyncKey() !== key
  }

  async function loadManifests(): Promise<void> {
    error.value = null
    try {
      const [sheets, audio] = await Promise.all([
        loadOfflineManifest('offline-sheets.json.gz', SHEETS_MANIFEST_SNAPSHOT_KEY),
        loadOfflineManifest('offline-audio.json.gz', AUDIO_MANIFEST_SNAPSHOT_KEY),
      ])
      sheetsManifest.value = sheets
      audioManifest.value = audio

      const sp = await getPackProgress('sheets')
      const ap = await getPackProgress('audio')
      if (sp?.status === 'done') sheetsStatus.value = 'done'
      else if (sp?.status === 'paused' || sp?.status === 'quota') sheetsStatus.value = sp.status
      if (ap?.status === 'done') audioStatus.value = 'done'
      else if (ap?.status === 'paused' || ap?.status === 'quota') audioStatus.value = ap.status

      if (!sp?.dismissedPrompt && sheets && sheetsStatus.value !== 'done') {
        // Show prompt after catalog is known — App decides when to display
        showSheetsPrompt.value = true
      }
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
    } finally {
      loaded.value = true
      await refreshEstimate()
      refreshPackSyncPrompt()
    }
  }

  function markCatalogCached(): void {
    catalogCachedAt.value = new Date().toISOString()
    try {
      localStorage.setItem(CATALOG_CACHED_KEY, catalogCachedAt.value)
    } catch {
      /* ignore */
    }
  }

  function restoreCatalogCached(): void {
    try {
      catalogCachedAt.value = localStorage.getItem(CATALOG_CACHED_KEY)
    } catch {
      catalogCachedAt.value = null
    }
  }

  /** Restore download manifests from persistent snapshot (offline refresh). */
  function hydrateManifestSnapshots(): boolean {
    const sheets = loadManifestSnapshot(SHEETS_MANIFEST_SNAPSHOT_KEY)
    const audio = loadManifestSnapshot(AUDIO_MANIFEST_SNAPSHOT_KEY)
    if (sheets) sheetsManifest.value = sheets
    if (audio) audioManifest.value = audio
    if (sheets || audio) {
      loaded.value = true
      return true
    }
    return false
  }

  async function clearAllOfflineData(): Promise<void> {
    cacheBusy.value = true
    cacheMessage.value = null
    error.value = null
    try {
      sheetsQueue?.pause()
      audioQueue?.pause()
      await clearAllOfflineDataImpl()
      sheetsStatus.value = 'idle'
      audioStatus.value = 'idle'
      sheetsProgress.value = null
      audioProgress.value = null
      sheetsCachedCount.value = 0
      audioCachedCount.value = 0
      catalogCachedAt.value = null
      showSheetsPrompt.value = false
      cacheMessage.value = 'Offline cache cleared.'
      await refreshEstimate()
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
    } finally {
      cacheBusy.value = false
      cacheProgress.value = null
    }
  }

  async function exportOfflineCache(): Promise<void> {
    cacheBusy.value = true
    cacheMessage.value = null
    error.value = null
    cacheProgress.value = null
    try {
      const { fileCount, bytes } = await exportOfflineCacheZip((p) => {
        cacheProgress.value = p
      })
      cacheMessage.value = `Exported ${fileCount} file(s) (${formatBytes(bytes)} zip).`
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
    } finally {
      cacheBusy.value = false
      cacheProgress.value = null
    }
  }

  async function importOfflineCache(file: File): Promise<void> {
    cacheBusy.value = true
    cacheMessage.value = null
    error.value = null
    cacheProgress.value = null
    try {
      const result = await importOfflineCacheZip(file, (p) => {
        cacheProgress.value = p
      })
      await refreshEstimate()
      if (result.sheetsFiles > 0 && sheetsStatus.value === 'idle') sheetsStatus.value = 'done'
      if (result.audioFiles > 0 && audioStatus.value === 'idle') audioStatus.value = 'done'
      cacheMessage.value = `Restored ${result.sheetsFiles} sheet file(s), ${result.audioFiles} audio file(s), ${result.starredTags} starred tag(s)${result.pitchPipePrefs ? ', pitch pipe settings' : ''}.`
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
    } finally {
      cacheBusy.value = false
      cacheProgress.value = null
    }
  }

  async function persistProgress(
    kind: PackKind,
    patch: Partial<PackProgressRecord>,
  ): Promise<void> {
    const prev = (await getPackProgress(kind)) || {
      kind,
      manifestVersion: kind === 'sheets' ? sheetsManifest.value?.version ?? 1 : audioManifest.value?.version ?? 1,
      cursor: 0,
      donePaths: [],
      updatedAt: new Date().toISOString(),
      status: 'idle' as const,
    }
    await putPackProgress({
      ...prev,
      ...patch,
      kind,
      updatedAt: new Date().toISOString(),
    })
  }

  async function startPack(kind: PackKind, _opts?: StartPackOptions): Promise<void> {
    error.value = null
    await requestPersistentStorage()
    // Refresh remote manifests so newly published tags are included.
    if (!offlineMode.offline) {
      await loadManifests()
    } else if (!(kind === 'sheets' ? sheetsManifest.value : audioManifest.value)) {
      await loadManifests()
    }
    const manifest = kind === 'sheets' ? sheetsManifest.value : audioManifest.value
    if (!manifest) {
      if (offlineMode.manualOffline) {
        error.value =
          'Offline mode is on — go online once so SingTags can load download lists, then try again.'
      } else {
        error.value = `Missing offline ${kind} manifest — rebuild indexes.`
      }
      return
    }

    const prefs = usePreferencesStore()

    if (kind === 'audio') {
      const est = await getStorageEstimate()
      const { totalBytes, entries } = filterAudioManifest(manifest, 'all', [])
      const paths = entries.flatMap((e) => e.paths)
      const publishedOnly = paths.length > 0 && paths.every(isPublishedTierPath)
      const sizeFactor = publishedOnly ? 1 : storageSizeFactor(prefs.audioEncodeQuality)
      const need = totalBytes * sizeFactor
      if (est && est.quota > 0 && est.quota - est.usage < need) {
        error.value = `Not enough storage for the learning library (~${formatBytes(need)} estimated). Free space and try again.`
        return
      }
    }

    const items =
      kind === 'audio'
        ? flattenFilteredAudioManifest(manifest, 'all', [])
        : flattenManifest(manifest)
    const prev = await getPackProgress(kind)
    // Mid-download resume only; otherwise rescan from 0 and skip files already on device.
    const startIndex = packStartIndex({
      status: prev?.status,
      progressVersion: prev?.manifestVersion,
      manifestVersion: manifest.version,
      cursor: prev?.cursor,
      itemCount: items.length,
    })

    const store = kind === 'sheets' ? sheetsPack : audioPack
    const packReencodes =
      kind === 'audio' &&
      usesOpusStorage(prefs.audioEncodeQuality) &&
      items.some((i) => !isPublishedTierPath(i.path))
    const queue = new DownloadQueue(store, {
      concurrency: packReencodes ? 2 : 4,
      onProgress: (p) => {
        if (kind === 'sheets') sheetsProgress.value = p
        else audioProgress.value = p
      },
      onStatus: (s, err) => {
        if (kind === 'sheets') sheetsStatus.value = s
        else audioStatus.value = s
        if (err) error.value = err
        void persistProgress(kind, { status: s, cursor: queue.getCursor() })
        void refreshEstimate().then(() => refreshPackSyncPrompt())
      },
      onItemDone: (_path, index) => {
        void persistProgress(kind, {
          status: 'running',
          cursor: index + 1,
          manifestVersion: manifest.version,
        })
      },
      transformResponse:
        kind === 'audio' && usesOpusStorage(prefs.audioEncodeQuality)
          ? async (item, response) => {
              if (isPublishedTierPath(item.path)) return response
              const buf = new Uint8Array(await response.arrayBuffer())
              const hostedMime = response.headers.get('content-type') || HOSTED_AUDIO_MIME
              const { bytes, mime } = await encodeBytesForStorage(
                buf,
                prefs.audioEncodeQuality,
                hostedMime,
                item.path,
              )
              const copy = new Uint8Array(bytes.byteLength)
              copy.set(bytes)
              return new Response(copy.buffer, {
                status: 200,
                headers: { 'Content-Type': mime },
              })
            }
          : undefined,
    })

    if (kind === 'sheets') sheetsQueue = queue
    else audioQueue = queue

    queue.setItems(items, startIndex)
    if (kind === 'sheets') sheetsStatus.value = 'running'
    else audioStatus.value = 'running'
    await persistProgress(kind, {
      status: 'running',
      cursor: startIndex,
      manifestVersion: manifest.version,
      dismissedPrompt: true,
    })
    showSheetsPrompt.value = false
    showPackSyncPrompt.value = false
    await queue.start()
    const finalStatus = queue.getStatus()
    await persistProgress(kind, {
      status: finalStatus === 'running' ? 'paused' : finalStatus,
      cursor: queue.getCursor(),
      manifestVersion: manifest.version,
      dismissedPrompt: true,
    })
    await refreshEstimate()
    refreshPackSyncPrompt()
  }

  function pausePack(kind: PackKind): void {
    if (kind === 'sheets') sheetsQueue?.pause()
    else audioQueue?.pause()
  }

  async function dismissPackSyncPrompt(): Promise<void> {
    writeDismissedPackSyncKey(packSyncDismissKey(sheetsManifest.value, audioManifest.value))
    showPackSyncPrompt.value = false
  }

  /** Download only missing pack files (keeps existing cache). */
  async function syncMissingPacks(): Promise<void> {
    await dismissPackSyncPrompt()
    const doSheets =
      sheetsSyncAvailable.value ||
      sheetsStatus.value === 'paused' ||
      sheetsStatus.value === 'quota'
    const doAudio =
      audioSyncAvailable.value ||
      audioStatus.value === 'paused' ||
      audioStatus.value === 'quota'
    if (doSheets) await startPack('sheets')
    if (doAudio) await startPack('audio')
    if (!doSheets && !doAudio) {
      if (sheetsCachedCount.value > 0) await startPack('sheets')
      else if (audioCachedCount.value > 0) await startPack('audio')
    }
  }

  async function clearPack(kind: PackKind): Promise<void> {
    if (kind === 'sheets') {
      sheetsQueue?.pause()
      await sheetsPack.clear()
      await clearPackProgress('sheets')
      sheetsStatus.value = 'idle'
      sheetsProgress.value = null
      sheetsCachedCount.value = 0
    } else {
      audioQueue?.pause()
      await audioPack.clear()
      await clearPackProgress('audio')
      audioStatus.value = 'idle'
      audioProgress.value = null
      audioCachedCount.value = 0
    }
    await refreshEstimate()
  }

  async function dismissSheetsPrompt(): Promise<void> {
    showSheetsPrompt.value = false
    await persistProgress('sheets', { dismissedPrompt: true })
  }

  async function ensureSheetsForTag(tagId: number): Promise<boolean> {
    const m = sheetsManifest.value
    if (!m) return false
    const entry = m.entries.find((e) => e.tagId === tagId)
    if (!entry) return false
    for (const p of entry.paths) {
      if (!(await sheetsPack.has(mediaUrl(p)))) return false
    }
    return entry.paths.length > 0
  }

  async function ensurePersistentStorage(): Promise<boolean> {
    const ok = await requestPersistentStorage()
    await refreshEstimate()
    cacheMessage.value = ok
      ? 'Persistent storage granted — the browser is less likely to clear this site’s offline cache under storage pressure.'
      : 'Persistent storage was not granted. Cached data may still be cleared if the device is low on space.'
    return ok
  }

  return {
    sheetsManifest,
    audioManifest,
    sheetsStatus,
    audioStatus,
    sheetsProgress,
    audioProgress,
    sheetsCachedCount,
    audioCachedCount,
    sheetsCachedBytes,
    audioCachedBytes,
    estimate,
    error,
    showSheetsPrompt,
    showPackSyncPrompt,
    catalogCachedAt,
    loaded,
    cacheBusy,
    cacheProgress,
    cacheMessage,
    sheetsTotalBytes,
    audioTotalBytes,
    audioBallparkLabel,
    sheetsExpectedCount,
    audioExpectedCount,
    sheetsSyncAvailable,
    audioSyncAvailable,
    sheetsMissingCount,
    audioMissingCount,
    readyState,
    statusLabel,
    isLikelyMeteredConnection,
    formatBytes,
    loadManifests,
    markCatalogCached,
    restoreCatalogCached,
    hydrateManifestSnapshots,
    refreshEstimate,
    startPack,
    pausePack,
    clearPack,
    dismissSheetsPrompt,
    dismissPackSyncPrompt,
    syncMissingPacks,
    ensureSheetsForTag,
    requestPersistentStorage: ensurePersistentStorage,
    clearAllOfflineData,
    exportOfflineCache,
    importOfflineCache,
  }
})
