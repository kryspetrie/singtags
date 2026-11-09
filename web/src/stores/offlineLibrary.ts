/**
 * Offline library packs: sheet and learning-track bulk downloads, storage estimates,
 * cache import/export, and sync prompts when remote manifests grow.
 *
 * Uses IndexedDB pack stores, pack progress DB, persistent manifest snapshots,
 * and localStorage for catalog-cached timestamp and dismissed sync keys.
 */
import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { mediaUrl } from '../lib/mediaUrl'
import { usePreferencesStore } from './preferences'
import { audioPack, sheetsPack, type PackKind } from '../offline/libraryPack'
import {
  DownloadQueue,
  type DownloadProgress,
  type DownloadStatus,
} from '../offline/downloadQueue'
import { clearPackProgress, getPackProgress } from '../offline/packProgressDb'
import {
  formatBytes,
  getStorageEstimate,
  isLikelyMeteredConnection,
  requestPersistentStorage,
  type StorageEstimateInfo,
} from '../offline/storageEstimate'
import type { OfflineManifest } from '../offline/manifestTypes'
import {
  expectedAudioFileCount,
  expectedSheetsFileCount,
  normalizePackStatus,
  packMissingFileCount,
  packSyncAvailable,
} from '../lib/packSync'
import { OFFLINE_LOFI_AUDIO_BALLPARK_LABEL } from '../lib/offlineAudioBallpark'
import { useOfflineModeStore } from './offlineMode'
import { loadOfflineReadinessIndex } from '../adapters/catalog/offlineReadinessIndex'
import {
  AUDIO_MANIFEST_SNAPSHOT_KEY,
  CATALOG_CACHED_KEY,
  type CacheProgress,
  type OfflineReadyState,
  SHEETS_MANIFEST_SNAPSHOT_KEY,
  loadManifestSnapshot,
  loadOfflineManifest,
} from './offlineLibrary/manifestSnapshot'
import { type StoreDeps } from './offlineLibrary/deps'
import { createPackDownloadActions } from './offlineLibrary/packDownload'

export type {
  OfflineManifest,
  OfflineManifestEntry,
  OfflineReadyState,
  StartPackOptions,
} from './offlineLibrary/manifestSnapshot'
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

  /** Avoid writing IndexedDB on every tiny file — throttle cursor saves. */
  const persistCursorState: Record<PackKind, { lastAt: number; lastCursor: number; timer: ReturnType<typeof setTimeout> | null }> = {
    sheets: { lastAt: 0, lastCursor: 0, timer: null },
    audio: { lastAt: 0, lastCursor: 0, timer: null },
  }
  const slots = {
    sheetsQueue: null as (DownloadQueue | null),
    audioQueue: null as (DownloadQueue | null),
  }
  const deps: StoreDeps = {
    offlineMode,
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
    persistCursorState,
    slots,
    refreshEstimate,
    refreshCacheReady,
    packSyncDismissKey,
    readDismissedPackSyncKey,
    writeDismissedPackSyncKey,
    refreshPackSyncPrompt,
    hydratePackStatusesFromProgress,
    loadManifests,
    ensureOfflineContentFormatOrReset,
    markCatalogCached,
    restoreCatalogCached,
    hydrateManifestSnapshots,
    clearAllOfflineData,
    cullUpgradeCaches,
    exportOfflineCache,
    importOfflineCache,
    dismissSheetsPrompt,
    ensureSheetsForTag,
    ensurePersistentStorage,
    clearError,
  }
  const packDownloadActions = createPackDownloadActions(deps)
  packDownloadActions.bindWatches()
  const {
    persistProgress,
    startPack,
    pausePack,
    installPackUnloadGuard,
    dismissPackSyncPrompt,
    syncMissingPacks,
    clearPack,
  } = {
    ...packDownloadActions.actions,
  }

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
      await ensureOfflineContentFormatOrReset()
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
   * When SingTags *media*-format stamps change, clear only those local packs and
   * delete matching Drive objects (other pack’s Drive media is kept).
   */
  async function ensureOfflineContentFormatOrReset(): Promise<void> {
    const {
      currentOfflineContentFormat,
      packsNeedingFormatReset,
      readOfflineContentFormatStamp,
      writeOfflineContentFormatStamp,
    } = await import('../lib/offlineContentFormat')
    const current = currentOfflineContentFormat()
    const stored = readOfflineContentFormatStamp()
    const need = packsNeedingFormatReset(stored, current)
    if (!need.sheets && !need.audio) {
      if (!stored) writeOfflineContentFormatStamp(current)
      return
    }
    slots.sheetsQueue?.pause()
    slots.audioQueue?.pause()
    if (need.sheets) {
      await sheetsPack.clear()
      sheetsStatus.value = 'idle'
      sheetsProgress.value = null
      await clearPackProgress('sheets').catch(() => undefined)
    }
    if (need.audio) {
      await audioPack.clear()
      audioStatus.value = 'idle'
      audioProgress.value = null
      await clearPackProgress('audio').catch(() => undefined)
    }
    writeOfflineContentFormatStamp(current)
    const which =
      need.sheets && need.audio ? 'sheets and tracks' : need.sheets ? 'sheets' : 'tracks'
    cacheMessage.value = `Song ${which} format updated — cleared locally. Other Drive media kept.`
    // Purge only the incompatible pack’s Drive objects; keep the rest.
    void import('../lib/google/driveCacheSync')
      .then(async (m) => {
        if (!m.isDriveCacheSyncEnabled()) return
        await m.purgeIncompatibleDriveMedia({
          sheets: need.sheets,
          audio: need.audio,
          reason: 'media-format-mismatch',
        })
        m.scheduleDriveCachePush()
      })
      .catch(() => undefined)
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
      slots.sheetsQueue?.pause()
      slots.audioQueue?.pause()
      const { clearAllOfflineData } = await import('../offline/cacheManage')
      await clearAllOfflineData()
      sheetsStatus.value = 'idle'
      audioStatus.value = 'idle'
      sheetsProgress.value = null
      audioProgress.value = null
      sheetsCachedCount.value = 0
      audioCachedCount.value = 0
      sheetsCachedBytes.value = 0
      audioCachedBytes.value = 0
      catalogCachedAt.value = null
      showSheetsPrompt.value = false
      cacheMessage.value = 'Offline cache cleared.'
      await refreshEstimate()
      await refreshCacheReady().catch(() => undefined)
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
      const { cullUpgradeCaches: cullUpgradeCachesImpl } = await import('../offline/cacheManage')
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
      const { exportOfflineCacheZip } = await import('../offline/cacheManage')
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
      const { importOfflineCacheZip } = await import('../offline/cacheManage')
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
  installPackUnloadGuard()

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
   * Request persistent storage so the browser is less likely to evict offline packs.
   * Refreshes the storage estimate. The Settings screen shows the result next to the button.
   */
  async function ensurePersistentStorage(): Promise<boolean> {
    const ok = await requestPersistentStorage()
    await refreshEstimate()
    return ok || !!estimate.value?.persisted
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
