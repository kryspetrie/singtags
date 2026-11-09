/**
 * Manifest snapshot loading and offline-library types.
 * No Pinia. The store imports these and re-exports the public types.
 */
import { indexesUrl } from '../../lib/mediaUrl'
import { type DownloadItem } from '../../offline/downloadQueue'
import type { OfflineManifest, OfflineManifestEntry } from '../../offline/manifestTypes'
import { flattenManifestEntries } from '../../lib/offlineManifest'
import { fetchGzipJson, parseGzipJsonBuffer } from '../../lib/gunzipJson'
import { matchOfflineCache } from '../../lib/manualOfflineFetch'
import { loadPersistentSnapshot, savePersistentSnapshot } from '../../lib/persistentSnapshot'
import type { LibraryAudioPartsMode } from '../../lib/audioParts'
/** localStorage key for last successful catalog fetch (also cleared by cacheManage wipe). */
export const CATALOG_CACHED_KEY = 'singtags.catalogCachedAt'

export type CacheProgress = {
  label: string
  done: number
  total: number
  ratio: number
}

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

export const SHEETS_MANIFEST_SNAPSHOT_KEY = 'singtags.offlineSheetsManifest.v1'
export const AUDIO_MANIFEST_SNAPSHOT_KEY = 'singtags.offlineAudioManifest.v1'

/** Persist manifest JSON to durable snapshot storage (survives refresh). */
export function saveManifestSnapshot(key: string, manifest: OfflineManifest): void {
  savePersistentSnapshot(key, manifest)
}

/** Type guard for offline manifest snapshot JSON. */
export function isOfflineManifest(data: unknown): data is OfflineManifest {
  return (
    typeof data === 'object' &&
    data != null &&
    Array.isArray((data as OfflineManifest).entries)
  )
}

/** Load manifest from persistent snapshot when network/cache miss. */
export function loadManifestSnapshot(key: string): OfflineManifest | null {
  return loadPersistentSnapshot(key, isOfflineManifest)
}

/**
 * Fetch gzip manifest from indexes URL, with offline cache and snapshot fallback.
 * Side effects: network or cache read; saves snapshot on success.
 */
export async function loadOfflineManifest(
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
export function flattenManifest(manifest: OfflineManifest): DownloadItem[] {
  return flattenManifestEntries(manifest)
}
