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
import { encodeDecodedBytes } from '../download/encode'
import { usePreferencesStore } from './preferences'

export interface OfflineManifestEntry {
  tagId: number
  paths: string[]
  bytes: number
  /** Present for sheets pack — relative path to metadata.json */
  detailPath?: string
}

export interface OfflineManifest {
  version: number
  kind: 'sheets' | 'audio'
  builtAt: string
  totalBytes: number
  entries: OfflineManifestEntry[]
}

export type OfflineReadyState =
  | 'online'
  | 'offline-ready'
  | 'offline-limited'
  | 'downloading'
  | 'unknown'

async function gunzipJson<T>(url: string): Promise<T> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Failed to load ${url} (${res.status})`)
  const buf = await res.arrayBuffer()
  const bytes = new Uint8Array(buf)
  const isGzip = bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b
  let text: string
  if (isGzip) {
    const ds = new DecompressionStream('gzip')
    const stream = new Response(buf).body!.pipeThrough(ds)
    text = await new Response(stream).text()
  } else {
    text = new TextDecoder().decode(bytes)
  }
  return JSON.parse(text) as T
}

function flattenManifest(manifest: OfflineManifest): DownloadItem[] {
  const items: DownloadItem[] = []
  for (const e of manifest.entries) {
    const per = e.paths.length ? Math.round(e.bytes / e.paths.length) : 0
    for (const path of e.paths) {
      items.push({ path, url: mediaUrl(path), bytes: per })
    }
    if (e.detailPath) {
      items.push({
        path: e.detailPath,
        url: mediaUrl(e.detailPath),
        bytes: 800,
      })
    }
  }
  return items
}

export const useOfflineLibraryStore = defineStore('offlineLibrary', () => {
  const sheetsManifest = ref<OfflineManifest | null>(null)
  const audioManifest = ref<OfflineManifest | null>(null)
  const sheetsStatus = ref<DownloadStatus>('idle')
  const audioStatus = ref<DownloadStatus>('idle')
  const sheetsProgress = ref<DownloadProgress | null>(null)
  const audioProgress = ref<DownloadProgress | null>(null)
  const sheetsCachedCount = ref(0)
  const audioCachedCount = ref(0)
  const estimate = ref<StorageEstimateInfo | null>(null)
  const error = ref<string | null>(null)
  const showSheetsPrompt = ref(false)
  const catalogCachedAt = ref<string | null>(null)
  const loaded = ref(false)

  let sheetsQueue: DownloadQueue | null = null
  let audioQueue: DownloadQueue | null = null

  const sheetsTotalBytes = computed(() => sheetsManifest.value?.totalBytes ?? 0)
  const audioTotalBytes = computed(() => audioManifest.value?.totalBytes ?? 0)

  const readyState = computed<OfflineReadyState>(() => {
    if (sheetsStatus.value === 'running' || audioStatus.value === 'running') {
      return 'downloading'
    }
    if (typeof navigator !== 'undefined' && navigator.onLine) return 'online'
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
      case 'downloading':
        return sheetsProgress.value?.label || audioProgress.value?.label || 'Downloading…'
      default:
        return 'Offline status unknown'
    }
  })

  async function refreshEstimate(): Promise<void> {
    estimate.value = await getStorageEstimate()
    try {
      sheetsCachedCount.value = await sheetsPack.count()
      audioCachedCount.value = await audioPack.count()
    } catch {
      sheetsCachedCount.value = 0
      audioCachedCount.value = 0
    }
  }

  async function loadManifests(): Promise<void> {
    error.value = null
    try {
      const [sheets, audio] = await Promise.all([
        gunzipJson<OfflineManifest>(indexesUrl('offline-sheets.json.gz')).catch(() => null),
        gunzipJson<OfflineManifest>(indexesUrl('offline-audio.json.gz')).catch(() => null),
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
    }
  }

  function markCatalogCached(): void {
    catalogCachedAt.value = new Date().toISOString()
    try {
      localStorage.setItem('singtags.catalogCachedAt', catalogCachedAt.value)
    } catch {
      /* ignore */
    }
  }

  function restoreCatalogCached(): void {
    try {
      catalogCachedAt.value = localStorage.getItem('singtags.catalogCachedAt')
    } catch {
      catalogCachedAt.value = null
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

  async function startPack(kind: PackKind): Promise<void> {
    error.value = null
    await requestPersistentStorage()
    const manifest = kind === 'sheets' ? sheetsManifest.value : audioManifest.value
    if (!manifest) {
      error.value = `Missing offline ${kind} manifest — rebuild indexes.`
      return
    }

    if (kind === 'audio') {
      const prefs = usePreferencesStore()
      const est = await getStorageEstimate()
      const sizeFactor =
        prefs.audioEncodeQuality === 'original'
          ? 1.1
          : prefs.audioEncodeQuality === 'standard'
            ? 0.8
            : prefs.audioEncodeQuality === 'compact'
              ? 0.55
              : 0.3
      const need = manifest.totalBytes * sizeFactor
      if (est && est.quota > 0 && est.quota - est.usage < need) {
        error.value = `Not enough storage for full audio (~${formatBytes(need)} estimated at current quality). Free space or use Starred audio instead.`
        return
      }
    }

    const items = flattenManifest(manifest)
    const prev = await getPackProgress(kind)
    const startIndex =
      prev?.manifestVersion === manifest.version ? prev.cursor : 0

    const prefs = usePreferencesStore()
    const store = kind === 'sheets' ? sheetsPack : audioPack
    const queue = new DownloadQueue(store, {
      concurrency: kind === 'audio' && prefs.audioEncodeQuality !== 'original' ? 2 : 4,
      onProgress: (p) => {
        if (kind === 'sheets') sheetsProgress.value = p
        else audioProgress.value = p
      },
      onStatus: (s, err) => {
        if (kind === 'sheets') sheetsStatus.value = s
        else audioStatus.value = s
        if (err) error.value = err
        void persistProgress(kind, { status: s, cursor: queue.getCursor() })
        void refreshEstimate()
      },
      onItemDone: (_path, index) => {
        void persistProgress(kind, {
          status: 'running',
          cursor: index + 1,
          manifestVersion: manifest.version,
        })
      },
      transformResponse:
        kind === 'audio' && prefs.audioEncodeQuality !== 'original'
          ? async (_item, response) => {
              const buf = new Uint8Array(await response.arrayBuffer())
              const quality = prefs.audioEncodeQuality
              if (quality === 'original') return response
              const encoded = await encodeDecodedBytes(buf, 'mp4', { quality })
              const copy = new Uint8Array(encoded.byteLength)
              copy.set(encoded)
              return new Response(copy.buffer, {
                status: 200,
                headers: { 'Content-Type': 'audio/mp4' },
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
    await queue.start()
    const finalStatus = queue.getStatus()
    await persistProgress(kind, {
      status: finalStatus === 'running' ? 'paused' : finalStatus,
      cursor: queue.getCursor(),
      manifestVersion: manifest.version,
      dismissedPrompt: true,
    })
    await refreshEstimate()
  }

  function pausePack(kind: PackKind): void {
    if (kind === 'sheets') sheetsQueue?.pause()
    else audioQueue?.pause()
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

  return {
    sheetsManifest,
    audioManifest,
    sheetsStatus,
    audioStatus,
    sheetsProgress,
    audioProgress,
    sheetsCachedCount,
    audioCachedCount,
    estimate,
    error,
    showSheetsPrompt,
    catalogCachedAt,
    loaded,
    sheetsTotalBytes,
    audioTotalBytes,
    readyState,
    statusLabel,
    isLikelyMeteredConnection,
    formatBytes,
    loadManifests,
    markCatalogCached,
    restoreCatalogCached,
    refreshEstimate,
    startPack,
    pausePack,
    clearPack,
    dismissSheetsPrompt,
    ensureSheetsForTag,
    requestPersistentStorage,
  }
})
