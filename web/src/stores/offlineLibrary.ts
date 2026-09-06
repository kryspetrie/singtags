/**
 * Offline library packs: sheet and learning-track bulk downloads, storage estimates,
 * cache import/export, and sync prompts when remote manifests grow.
 *
 * Uses IndexedDB pack stores, pack progress DB, persistent manifest snapshots,
 * and localStorage for catalog-cached timestamp and dismissed sync keys.
 */
import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { indexesUrl, mediaUrl } from '../lib/mediaUrl'
import { usePreferencesStore } from './preferences'
import { audioPack, sheetsPack, type PackKind } from '../offline/libraryPack'
import {
  DownloadQueue,
  type DownloadItem,
  type DownloadProgress,
  type DownloadStatus,
} from '../offline/downloadQueue'
import {
  adaptivePackConcurrency,
  packDownloadInflight,
  refreshPackDownloadInflightCap,
} from '../offline/downloadConcurrency'
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
  cullUpgradeCaches as cullUpgradeCachesImpl,
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
  normalizePackStatus,
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
import {
  DEVICE_AUDIO_STORAGE_QUALITY,
  storageSizeFactor,
  HOSTED_AUDIO_MIME,
  usesOpusStorage,
} from '../types/audio'
import { useOfflineModeStore } from './offlineMode'
import { loadOfflineReadinessIndex } from '../lib/offlineReadiness'

export type { OfflineManifest, OfflineManifestEntry }

/** High-level offline readiness for status UI and gating. */
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

/** Persist manifest JSON to durable snapshot storage (survives refresh). */
function saveManifestSnapshot(key: string, manifest: OfflineManifest): void {
  savePersistentSnapshot(key, manifest)
}

/** Type guard for offline manifest snapshot JSON. */
function isOfflineManifest(data: unknown): data is OfflineManifest {
  return (
    typeof data === 'object' &&
    data != null &&
    Array.isArray((data as OfflineManifest).entries)
  )
}

/** Load manifest from persistent snapshot when network/cache miss. */
function loadManifestSnapshot(key: string): OfflineManifest | null {
  return loadPersistentSnapshot(key, isOfflineManifest)
}

/**
 * Fetch gzip manifest from indexes URL, with offline cache and snapshot fallback.
 * Side effects: network or cache read; saves snapshot on success.
 */
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

/** Flatten manifest entries into download queue items (sheets pack). */
function flattenManifest(manifest: OfflineManifest): DownloadItem[] {
  return flattenManifestEntries(manifest)
}

/** Pinia store for offline sheet/audio library packs and cache management. */
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
  /** True while Sync missing is running both packs (click guard + UI busy state). */
  const packSyncBusy = ref(false)
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

  /** Combined offline readiness from pack status, catalog cache, and connectivity. */
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

  /** Human-readable status line derived from `readyState` and download progress. */
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

  /**
   * Refresh storage quota estimate and cached file counts/bytes in both packs.
   * Side effects: IndexedDB reads via pack APIs.
   */
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

  /** Rebuild the catalog's per-tag cached-media index with bulk storage reads. */
  async function refreshCacheReady(): Promise<void> {
    const index = await loadOfflineReadinessIndex()
    const { useCatalogStore } = await import('./catalog')
    useCatalogStore().setCacheReadyIndex(index)
  }

  /** Key for dismissing “library grew” sync toast until manifests change again. */
  function packSyncDismissKey(sheets: OfflineManifest | null, audio: OfflineManifest | null): string {
    return `${sheets?.builtAt ?? ''}|${audio?.builtAt ?? ''}|${expectedSheetsFileCount(sheets)}|${expectedAudioFileCount(audio)}`
  }

  /** Read dismissed pack-sync key from localStorage. */
  function readDismissedPackSyncKey(): string | null {
    try {
      return localStorage.getItem('singtags.dismissedPackSync.v1')
    } catch {
      return null
    }
  }

  /** Persist dismissed pack-sync key. Side effect: localStorage. */
  function writeDismissedPackSyncKey(key: string): void {
    try {
      localStorage.setItem('singtags.dismissedPackSync.v1', key)
    } catch {
      /* ignore */
    }
  }

  /** Show or hide pack sync prompt based on missing files and dismiss key. */
  function refreshPackSyncPrompt(): void {
    if (packSyncBusy.value) {
      showPackSyncPrompt.value = false
      return
    }
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

  /**
   * Restore pack UI status from IDB + cached counts. Orphaned mid-download
   * (`running` / `error` / false `done`) becomes `paused` so Resume works after reload.
   * Does not clobber an in-flight queue (`running` in memory).
   */
  async function hydratePackStatusesFromProgress(): Promise<void> {
    const [sp, ap] = await Promise.all([getPackProgress('sheets'), getPackProgress('audio')])

    if (sheetsStatus.value !== 'running') {
      const next = normalizePackStatus(
        sp?.status,
        sheetsCachedCount.value,
        expectedSheetsFileCount(sheetsManifest.value),
      )
      sheetsStatus.value = next
      if (sp && next !== sp.status && (sp.status === 'running' || sp.status === 'error' || sp.status === 'done')) {
        await persistProgress('sheets', { status: next })
      }
    }

    if (audioStatus.value !== 'running') {
      const next = normalizePackStatus(
        ap?.status,
        audioCachedCount.value,
        expectedAudioFileCount(audioManifest.value),
      )
      audioStatus.value = next
      if (ap && next !== ap.status && (ap.status === 'running' || ap.status === 'error' || ap.status === 'done')) {
        await persistProgress('audio', { status: next })
      }
    }

    if (!sp?.dismissedPrompt && sheetsManifest.value && sheetsStatus.value !== 'done') {
      // First-run download UX is BrowseWelcomeDialog — don't also arm the sheets toast.
      if (usePreferencesStore().browseWelcomeDismissed) {
        showSheetsPrompt.value = true
      }
    }
  }

  /**
   * Load sheet and audio offline manifests and restore pack progress from IDB.
   * Side effects: network/cache, IndexedDB progress read, updates `showSheetsPrompt`.
   */
  async function loadManifests(): Promise<void> {
    error.value = null
    try {
      const [sheets, audio] = await Promise.all([
        loadOfflineManifest('offline-sheets.json.gz', SHEETS_MANIFEST_SNAPSHOT_KEY),
        loadOfflineManifest('offline-audio.json.gz', AUDIO_MANIFEST_SNAPSHOT_KEY),
      ])
      sheetsManifest.value = sheets
      audioManifest.value = audio
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
    } finally {
      loaded.value = true
      await refreshEstimate()
      await hydratePackStatusesFromProgress()
      refreshPackSyncPrompt()
    }
  }

  /**
   * Record that the catalog index is cached for offline browse.
   * Side effect: localStorage `CATALOG_CACHED_KEY`.
   */
  function markCatalogCached(): void {
    catalogCachedAt.value = new Date().toISOString()
    try {
      localStorage.setItem(CATALOG_CACHED_KEY, catalogCachedAt.value)
    } catch {
      /* ignore */
    }
  }

  /** Restore catalog-cached timestamp from localStorage on startup. */
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

  /**
   * Wipe all offline data (packs, favorites IDB, snapshots, etc.).
   * Side effects: IndexedDB clears, pauses active queues.
   */
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

  /**
   * Remove browse-time quality upgrades (HQ PDF rasters, warmed playback/original
   * audio, favorited HQ blobs) while keeping WebP sheets + ultra audio pack.
   */
  async function cullUpgradeCaches(): Promise<void> {
    cacheBusy.value = true
    cacheMessage.value = null
    error.value = null
    try {
      const result = await cullUpgradeCachesImpl({
        audioManifest: audioManifest.value,
        onProgress: (p) => {
          cacheProgress.value = p
        },
      })
      const freed = result.pdfRasterBytesRemoved + result.audioPackBytesRemoved
      const parts = [
        result.pdfRastersCleared ? 'high-res sheet rasters' : null,
        result.audioPackFilesRemoved
          ? `${result.audioPackFilesRemoved} upgraded track file${result.audioPackFilesRemoved === 1 ? '' : 's'}`
          : null,
        result.starredPartsRemoved
          ? `${result.starredPartsRemoved} favorited HQ part${result.starredPartsRemoved === 1 ? '' : 's'}`
          : null,
      ].filter(Boolean)
      const detail = parts.length ? parts.join(', ') : 'nothing extra found'
      cacheMessage.value =
        freed > 0
          ? `Quality upgrades cleared (~${formatBytes(freed)}): ${detail}.`
          : `Quality upgrades cleared (${detail}). Ultra pack and WebP sheets kept.`
      await refreshEstimate()
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
    } finally {
      cacheBusy.value = false
      cacheProgress.value = null
    }
  }

  /**
   * Export full offline cache as a zip download.
   * Side effects: reads IndexedDB/cache; triggers browser download.
   */
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

  /**
   * Import offline cache zip (sheets, audio, favorites, pitch pipe prefs, etc.).
   * Side effects: IndexedDB writes, storage refresh; may mark packs done.
   */
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
      cacheMessage.value = `Restored ${result.sheetsFiles} sheet file(s), ${result.audioFiles} audio file(s), ${result.starredTags} favorited tag(s)${result.pitchPipePrefs ? ', pitch pipe settings' : ''}.`
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
    } finally {
      cacheBusy.value = false
      cacheProgress.value = null
    }
  }

  /** Merge pack download progress into IndexedDB (`putPackProgress`). */
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


  /** Avoid writing IndexedDB on every tiny file — throttle cursor saves. */
  const persistCursorState: Record<PackKind, { lastAt: number; lastCursor: number; timer: ReturnType<typeof setTimeout> | null }> = {
    sheets: { lastAt: 0, lastCursor: 0, timer: null },
    audio: { lastAt: 0, lastCursor: 0, timer: null },
  }

  /**
   * Throttled cursor persistence during pack download (avoid IDB write per file).
   * Side effect: deferred `persistProgress` to IndexedDB.
   */
  function schedulePersistCursor(
    kind: PackKind,
    cursor: number,
    manifestVersion: number,
    opts?: { force?: boolean },
  ): void {
    const st = persistCursorState[kind]
    st.lastCursor = cursor
    const force = opts?.force === true
    const now = Date.now()
    const flush = () => {
      st.timer = null
      st.lastAt = Date.now()
      void persistProgress(kind, {
        status: 'running',
        cursor: st.lastCursor,
        manifestVersion,
      })
    }
    if (force || now - st.lastAt >= 750 || cursor % 50 === 0) {
      if (st.timer) {
        clearTimeout(st.timer)
        st.timer = null
      }
      flush()
      return
    }
    if (!st.timer) st.timer = setTimeout(flush, 750)
  }

  /**
   * Start or resume downloading one pack (`sheets` or `audio`).
   * Side effects: network, IndexedDB pack store, progress IDB, optional Opus re-encode.
   *
   * @param kind - Which offline pack to download.
   * @param _opts - Reserved; `partsMode` override for audio filtering.
   */
  async function startPack(kind: PackKind, _opts?: StartPackOptions): Promise<void> {
    if (kind === 'sheets' && sheetsStatus.value === 'running') return
    if (kind === 'audio' && audioStatus.value === 'running') return
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


    if (kind === 'audio') {
      const est = await getStorageEstimate()
      const { totalBytes, entries } = filterAudioManifest(manifest, 'all', [])
      const paths = entries.flatMap((e) => e.paths)
      const publishedOnly = paths.length > 0 && paths.every(isPublishedTierPath)
      const sizeFactor = publishedOnly ? 1 : storageSizeFactor(DEVICE_AUDIO_STORAGE_QUALITY)
      // Remaining bytes only — a partial download must not require free space for the whole pack.
      const need = Math.max(0, totalBytes * sizeFactor - audioCachedBytes.value)
      if (need > 0 && est && est.quota > 0 && est.quota - est.usage < need) {
        error.value = `Not enough storage for the remaining learning tracks (~${formatBytes(need)} estimated). Free space and try again.`
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
      usesOpusStorage(DEVICE_AUDIO_STORAGE_QUALITY) &&
      items.some((i) => !isPublishedTierPath(i.path))
    refreshPackDownloadInflightCap()
    const concurrencyKind =
      kind === 'sheets' ? 'sheets' : packReencodes ? 'audio-reencode' : 'audio-fetch'
    const { fetch: fetchConcurrency, transform: transformConcurrency } =
      adaptivePackConcurrency(concurrencyKind)
    const queue = new DownloadQueue(store, {
      // Adaptive workers + shared inflight gate; re-encode pipelines behind a transform cap.
      continueOnError: kind === 'audio',
      onItemError: (p, err) => {
        console.warn('[offline audio]', p, err)
      },
      concurrency: fetchConcurrency,
      transformConcurrency: transformConcurrency > 0 ? transformConcurrency : undefined,
      needsTransform:
        kind === 'audio' && usesOpusStorage(DEVICE_AUDIO_STORAGE_QUALITY)
          ? (item) => !isPublishedTierPath(item.path)
          : undefined,
      inflight: packDownloadInflight,
      onProgress: (p) => {
        if (kind === 'sheets') sheetsProgress.value = p
        else audioProgress.value = p
      },
      onStatus: (s, err) => {
        if (kind === 'sheets') sheetsStatus.value = s
        else audioStatus.value = s
        if (err) error.value = err
        void persistProgress(kind, { status: s, cursor: queue.getCursor() })
        void refreshEstimate().then(() => {
          void refreshCacheReady().catch(() => undefined)
          refreshPackSyncPrompt()
        })
      },
      onItemDone: (_path, index) => {
        schedulePersistCursor(kind, index + 1, manifest.version)
      },
      transformResponse:
        kind === 'audio' && usesOpusStorage(DEVICE_AUDIO_STORAGE_QUALITY)
          ? async (item, response) => {
              if (isPublishedTierPath(item.path)) return response
              const buf = new Uint8Array(await response.arrayBuffer())
              const hostedMime = response.headers.get('content-type') || HOSTED_AUDIO_MIME
              const { bytes, mime } = await encodeBytesForStorage(
                buf,
                DEVICE_AUDIO_STORAGE_QUALITY,
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
    await refreshCacheReady().catch(() => undefined)
    refreshPackSyncPrompt()
  }

  /** Pause an in-flight pack download queue. */
  function pausePack(kind: PackKind): void {
    if (kind === 'sheets') sheetsQueue?.pause()
    else audioQueue?.pause()
  }

  /** Best-effort: leave mid-download as paused if the tab is killed/backgrounded. */
  let unloadGuardInstalled = false
  function installPackUnloadGuard(): void {
    if (unloadGuardInstalled || typeof window === 'undefined') return
    unloadGuardInstalled = true
    window.addEventListener('pagehide', () => {
      pausePack('sheets')
      pausePack('audio')
    })
  }
  installPackUnloadGuard()

  /** Dismiss sync prompt and remember manifest versions. Side effect: localStorage. */
  async function dismissPackSyncPrompt(): Promise<void> {
    writeDismissedPackSyncKey(packSyncDismissKey(sheetsManifest.value, audioManifest.value))
    showPackSyncPrompt.value = false
  }

  /**
   * Download missing sheet + audio pack files (keeps existing cache).
   * Always kicks off both packs so Settings stays consistent with the banner CTA.
   */
  async function syncMissingPacks(): Promise<void> {
    if (packSyncBusy.value) return
    if (sheetsStatus.value === 'running' || audioStatus.value === 'running') return
    packSyncBusy.value = true
    showPackSyncPrompt.value = false
    error.value = null
    try {
      // Dismiss toast persistence after we've taken the action (not before busy UI).
      writeDismissedPackSyncKey(packSyncDismissKey(sheetsManifest.value, audioManifest.value))
      // Parallel: separate queues; each skips files already on device.
      await Promise.all([startPack('sheets'), startPack('audio')])
    } finally {
      packSyncBusy.value = false
      refreshPackSyncPrompt()
    }
  }

  /**
   * Clear one pack’s cached files and progress (sheets or audio).
   * Side effects: IndexedDB pack clear, progress record delete.
   */
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

  /** Dismiss first-run sheets download prompt. Side effect: pack progress IDB. */
  async function dismissSheetsPrompt(): Promise<void> {
    showSheetsPrompt.value = false
    await persistProgress('sheets', { dismissedPrompt: true })
  }

  /**
   * Check whether all sheet paths for a tag exist in the sheets pack.
   *
   * @returns false when manifest missing, tag not listed, or any path absent.
   */
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

  /**
   * Request persistent storage quota (reduces eviction under pressure).
   * Side effects: browser permission API, refreshes estimate, sets `cacheMessage`.
   */
  async function ensurePersistentStorage(): Promise<boolean> {
    const ok = await requestPersistentStorage()
    await refreshEstimate()
    cacheMessage.value = ok
      ? 'Offline data protected — the browser is less likely to clear SingTags’ cache when storage is low.'
      : 'Could not protect offline data. Cached sheets and tracks may still be cleared if the device is low on space.'
    return ok
  }

  /** Clear store error message. */
  function clearError(): void {
    error.value = null
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
    packSyncBusy,
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
    refreshCacheReady,
    startPack,
    pausePack,
    clearPack,
    dismissSheetsPrompt,
    dismissPackSyncPrompt,
    syncMissingPacks,
    ensureSheetsForTag,
    requestPersistentStorage: ensurePersistentStorage,
    clearAllOfflineData,
    cullUpgradeCaches,
    exportOfflineCache,
    importOfflineCache,
    clearError,
  }
})
