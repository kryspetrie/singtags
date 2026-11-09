/** Pack download queue, pause, and clear actions. */

import { lazyFn, type StoreDeps } from './deps'

import { audioPack, sheetsPack, type PackKind } from '../../offline/libraryPack'

import { DownloadQueue } from '../../offline/downloadQueue'

import {
  adaptivePackConcurrency,
  packDownloadInflight,
  refreshPackDownloadInflightCap,
} from '../../offline/downloadConcurrency'

import {
  clearPackProgress,
  getPackProgress,
  putPackProgress,
  type PackProgressRecord,
} from '../../offline/packProgressDb'

import {
  formatBytes,
  getStorageEstimate,
  requestPersistentStorage,
} from '../../offline/storageEstimate'

import { filterAudioManifest, flattenFilteredAudioManifest } from '../../lib/offlineManifest'

import { packStartIndex } from '../../lib/packSync'

import { isPublishedTierPath } from '../../lib/audioTiers'

import {
  DEVICE_AUDIO_STORAGE_QUALITY,
  storageSizeFactor,
  HOSTED_AUDIO_MIME,
  usesOpusStorage,
} from '../../types/audio'

import { type StartPackOptions, flattenManifest } from './manifestSnapshot'

export function createPackDownloadActions(deps: StoreDeps) {

  const audioCachedBytes = deps.audioCachedBytes
  const audioCachedCount = deps.audioCachedCount
  const audioManifest = deps.audioManifest
  const audioProgress = deps.audioProgress
  const audioStatus = deps.audioStatus
  const error = deps.error
  const loadManifests = lazyFn(() => deps.loadManifests)
  const offlineMode = deps.offlineMode
  const packSyncBusy = deps.packSyncBusy
  const packSyncDismissKey = lazyFn(() => deps.packSyncDismissKey)
  const persistCursorState = deps.persistCursorState
  const refreshCacheReady = lazyFn(() => deps.refreshCacheReady)
  const refreshEstimate = lazyFn(() => deps.refreshEstimate)
  const refreshPackSyncPrompt = lazyFn(() => deps.refreshPackSyncPrompt)
  const sheetsCachedBytes = deps.sheetsCachedBytes
  const sheetsCachedCount = deps.sheetsCachedCount
  const sheetsManifest = deps.sheetsManifest
  const sheetsProgress = deps.sheetsProgress
  const sheetsStatus = deps.sheetsStatus
  const showPackSyncPrompt = deps.showPackSyncPrompt
  const showSheetsPrompt = deps.showSheetsPrompt
  const slots = deps.slots
  const writeDismissedPackSyncKey = lazyFn(() => deps.writeDismissedPackSyncKey)

  /** Best-effort: leave mid-download as paused if the tab is killed/backgrounded. */
  let unloadGuardInstalled = false

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
    // Mark this device as wanting a local song cache for this pack (not synced via app-state).
    // When signed in, prefer Drive objects first, then fill gaps from SingTags/S3 below.
    try {
      const auth = await import('../../lib/google/googleAuth')
      const cache = await import('../../lib/google/driveCacheSync')
      auth.restoreGoogleConnection()
      if (kind === 'sheets') cache.setDriveSheetsCacheEnabled(true)
      else cache.setDriveAudioCacheEnabled(true)
      if (auth.isDriveSyncEnabled() && auth.googleAuthState.connected && !offlineMode.offline) {
        await cache.ensureDriveCacheSync({ allowTokenPrompt: false })
      }
    } catch {
      /* Drive optional — continue with SingTags download */
    }
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
              const { encodeBytesForStorage } = await import('../../offline/compactAudio')
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

    if (kind === 'sheets') slots.sheetsQueue = queue
    else slots.audioQueue = queue

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
    if (finalStatus === 'done') {
      void import('../../lib/google/driveCacheSync')
        .then(({ scheduleDriveCachePush }) => scheduleDriveCachePush())
        .catch(() => undefined)
    }
  }

  /** Pause an in-flight pack download queue. */
  function pausePack(kind: PackKind): void {
    if (kind === 'sheets') slots.sheetsQueue?.pause()
    else slots.audioQueue?.pause()
  }
  function installPackUnloadGuard(): void {
    if (unloadGuardInstalled || typeof window === 'undefined') return
    unloadGuardInstalled = true
    window.addEventListener('pagehide', () => {
      pausePack('sheets')
      pausePack('audio')
    })
  }

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
      slots.sheetsQueue?.pause()
      slots.sheetsQueue = null
      await sheetsPack.clear()
      await clearPackProgress('sheets')
      sheetsStatus.value = 'idle'
      sheetsProgress.value = null
      sheetsCachedCount.value = 0
      sheetsCachedBytes.value = 0
    } else {
      slots.audioQueue?.pause()
      slots.audioQueue = null
      await audioPack.clear()
      await clearPackProgress('audio')
      audioStatus.value = 'idle'
      audioProgress.value = null
      audioCachedCount.value = 0
      audioCachedBytes.value = 0
    }
    // Opt this device out of auto song-cache for this pack (Drive hydrate / push stays off).
    try {
      const cache = await import('../../lib/google/driveCacheSync')
      if (kind === 'sheets') cache.setDriveSheetsCacheEnabled(false)
      else cache.setDriveAudioCacheEnabled(false)
    } catch {
      /* ignore */
    }
    await refreshEstimate()
    await refreshCacheReady().catch(() => undefined)
  }

  const actions = {
    persistProgress,
    schedulePersistCursor,
    startPack,
    pausePack,
    installPackUnloadGuard,
    dismissPackSyncPrompt,
    syncMissingPacks,
    clearPack,
  }
  Object.assign(deps, actions)

  function bindWatches(): void {}

  return { actions, bindWatches }

}
