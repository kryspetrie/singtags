import { unzipSync } from 'fflate'
import { buildZip, downloadBlob } from '../download/zip'
import {
  buildOfflineCacheZip,
  importOfflineCacheZip,
  type CacheProgress,
} from '../offline/cacheManage'
import type { StarredTagRecord } from '../offline/starredDb'
import {
  buildFavoritesBackup,
  parseFavoritesBackup,
  type FavoritesBackupFile,
} from './favoritesBackup'
import type { UserCollection } from '../stores/userCollections'

/** localStorage keys included in app-state backups. */
export const APP_STATE_LOCAL_KEYS = [
  'singtags.userCollections.v1',
  'singtags.practiceOrder.v1',
  'singtags.practiceAuto.v1',
  'singtags.recent.v2',
  'singtags.zipQueue.v2',
  'singtags.zipLayout.v2',
  'singtags.manualOffline',
  'singtags.simulatedOffline',
  'singtags.partSoloInFile.v1',
  'singtags.partMixPan.v1',
  'singtags.browseWelcomeDismissed.v1',
  'singtags.libraryAudioPartsMode.v1',
  'singtags.libraryAudioParts.v1',
  'singtags.pitchPipe.v1',
  'singtags.pitchPipeRange.v1',
  'singtags.pitchPipeLayout.v1',
  'singtags.audioEncodeQuality.v1',
] as const

export type AppStateBackupFile = {
  version: 1
  kind: 'singtags.app-state'
  exportedAt: string
  includeCache: boolean
  favorites: FavoritesBackupFile
  /** Raw localStorage values for known SingTags keys. */
  localStorage: Record<string, string>
}

export type AppStateSnapshotInput = {
  records: StarredTagRecord[]
  collections: UserCollection[]
  practice: { order: number[]; autoAdvance: boolean }
}

function readLocalStorageSnapshot(): Record<string, string> {
  const out: Record<string, string> = {}
  for (const key of APP_STATE_LOCAL_KEYS) {
    try {
      const v = localStorage.getItem(key)
      if (v != null) out[key] = v
    } catch {
      /* ignore */
    }
  }
  return out
}

/** Write known keys from a backup; unknown keys are ignored. */
export function applyLocalStorageSnapshot(snapshot: Record<string, string>): void {
  const allowed = new Set<string>(APP_STATE_LOCAL_KEYS)
  for (const [key, value] of Object.entries(snapshot)) {
    if (!allowed.has(key) || typeof value !== 'string') continue
    try {
      localStorage.setItem(key, value)
    } catch {
      /* ignore quota */
    }
  }
}

export function buildAppStateBackup(
  input: AppStateSnapshotInput,
  includeCache: boolean,
): AppStateBackupFile {
  return {
    version: 1,
    kind: 'singtags.app-state',
    exportedAt: new Date().toISOString(),
    includeCache,
    favorites: buildFavoritesBackup({
      records: input.records,
      collections: input.collections,
      practice: input.practice,
    }),
    localStorage: readLocalStorageSnapshot(),
  }
}

export function parseAppStateBackup(raw: unknown): AppStateBackupFile {
  if (!raw || typeof raw !== 'object') throw new Error('Invalid app-state backup')
  const obj = raw as Record<string, unknown>
  if (obj.kind !== 'singtags.app-state' || obj.version !== 1) {
    throw new Error('Not a SingTags app-state v1 backup')
  }
  const favorites = parseFavoritesBackup(obj.favorites)
  const local: Record<string, string> = {}
  if (obj.localStorage && typeof obj.localStorage === 'object') {
    for (const [k, v] of Object.entries(obj.localStorage as Record<string, unknown>)) {
      if (typeof v === 'string') local[k] = v
    }
  }
  return {
    version: 1,
    kind: 'singtags.app-state',
    exportedAt: typeof obj.exportedAt === 'string' ? obj.exportedAt : new Date().toISOString(),
    includeCache: obj.includeCache === true,
    favorites,
    localStorage: local,
  }
}

export async function downloadAppStateBackup(
  input: AppStateSnapshotInput,
  opts: { includeCache: boolean; onProgress?: (p: CacheProgress) => void },
): Promise<{ bytes: number; includeCache: boolean }> {
  const state = buildAppStateBackup(input, opts.includeCache)
  const stamp = state.exportedAt.slice(0, 10)
  const stateBytes = new TextEncoder().encode(JSON.stringify(state, null, 2))

  if (!opts.includeCache) {
    downloadBlob(stateBytes, `singtags-app-state-${stamp}.json`, 'application/json')
    return { bytes: stateBytes.byteLength, includeCache: false }
  }

  opts.onProgress?.({ label: 'Building offline cache…', done: 0, total: 1, ratio: 0 })
  const cache = await buildOfflineCacheZip(opts.onProgress)
  const zipped = buildZip([
    { name: 'app-state.json', data: stateBytes },
    { name: 'offline-cache.zip', data: cache.bytes },
  ])
  downloadBlob(zipped, `singtags-app-backup-${stamp}.zip`, 'application/zip')
  return { bytes: zipped.byteLength, includeCache: true }
}

/** Parse a .json app-state file or a .zip that contains app-state.json (+ optional cache). */
export async function loadAppStateBackupFile(
  file: File,
  onProgress?: (p: CacheProgress) => void,
): Promise<{ state: AppStateBackupFile; cacheBytes: Uint8Array | null }> {
  const name = file.name.toLowerCase()
  if (name.endsWith('.zip') || file.type === 'application/zip') {
    onProgress?.({ label: 'Reading backup zip…', done: 0, total: 1, ratio: 0 })
    const buf = new Uint8Array(await file.arrayBuffer())
    let tree: Record<string, Uint8Array>
    try {
      tree = unzipSync(buf) as Record<string, Uint8Array>
    } catch {
      throw new Error('Could not read zip — is this a SingTags app backup?')
    }
    const stateFile = tree['app-state.json']
    if (!stateFile) throw new Error('Backup zip is missing app-state.json')
    const state = parseAppStateBackup(JSON.parse(new TextDecoder().decode(stateFile)))
    const cacheBytes = tree['offline-cache.zip'] ?? null
    return { state, cacheBytes }
  }

  const text = await file.text()
  const state = parseAppStateBackup(JSON.parse(text))
  return { state, cacheBytes: null }
}

export async function restoreOfflineCacheBytes(
  cacheBytes: Uint8Array,
  onProgress?: (p: CacheProgress) => void,
): Promise<void> {
  await importOfflineCacheZip(cacheBytes, onProgress)
}
