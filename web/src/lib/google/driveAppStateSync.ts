/**
 * Drive app-state backup / hydrate (Phase 2).
 *
 * Stores under appDataFolder/singtags/state/:
 *   app-state.json + app-state.meta.json
 */

import {
  applyLocalStorageSnapshot,
  buildAppStateBackup,
  parseAppStateBackup,
  type AppStateBackupFile,
  type AppStateSnapshotInput,
} from '../appStateBackup'
import type { FavoritesBackupFile } from '../favoritesBackup'
import {
  downloadJsonFile,
  ensureAppDataPath,
  findChildByName,
  sha256Hex,
  upsertTextFile,
} from './driveAppData'
import { reactive } from 'vue'
import {
  googleAuthState,
  isDriveSyncEnabled,
  readConnection,
  restoreGoogleConnection,
} from './googleAuth'

export const DRIVE_STATE_SEGMENTS = ['singtags', 'state'] as const
export const DRIVE_APP_STATE_FILE = 'app-state.json'
export const DRIVE_APP_STATE_META_FILE = 'app-state.meta.json'

export const DRIVE_DEVICE_ID_KEY = 'singtags.deviceId.v1'
export const DRIVE_LAST_SYNC_KEY = 'singtags.drive.appState.lastSync.v1'
export const DRIVE_DIRTY_KEY = 'singtags.drive.appState.dirty.v1'

export type DriveAppStateMeta = {
  schemaVersion: 1
  exportedAt: string
  deviceId: string
  contentHash: string
}

export type DriveSyncDecision =
  | { action: 'noop'; reason: string }
  | { action: 'upload'; reason: string }
  | { action: 'download'; reason: string }
  | { action: 'conflict'; reason: string }

export type DriveConflictChoice = 'keep-local' | 'keep-cloud' | 'merge'

export const driveSyncState = reactive({
  status: 'idle' as 'idle' | 'hydrating' | 'pushing' | 'error',
  message: '' as string,
  lastSyncedAt: '' as string,
})

type SnapshotProvider = () => Promise<AppStateSnapshotInput> | AppStateSnapshotInput
type ApplyFavorites = (favorites: FavoritesBackupFile, mode: 'replace' | 'merge') => Promise<void>

let snapshotProvider: SnapshotProvider | null = null
let applyFavorites: ApplyFavorites | null = null
let conflictChooser: (() => Promise<DriveConflictChoice>) | null = null
let pushTimer: ReturnType<typeof setTimeout> | null = null
let hydrateInFlight: Promise<void> | null = null

const PUSH_DEBOUNCE_MS = 8_000

function readFlag(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function writeFlag(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
  } catch {
    /* private mode */
  }
}

export function getOrCreateDeviceId(): string {
  const existing = readFlag(DRIVE_DEVICE_ID_KEY)
  if (existing) return existing
  const id =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `dev_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
  writeFlag(DRIVE_DEVICE_ID_KEY, id)
  return id
}

export function markDriveAppStateDirty(): void {
  writeFlag(DRIVE_DIRTY_KEY, new Date().toISOString())
}

export function clearDriveAppStateDirty(): void {
  writeFlag(DRIVE_DIRTY_KEY, null)
}

export function isDriveAppStateDirty(): boolean {
  return !!readFlag(DRIVE_DIRTY_KEY)
}

export function readLastSyncMeta(): DriveAppStateMeta | null {
  const raw = readFlag(DRIVE_LAST_SYNC_KEY)
  if (!raw) return null
  try {
    const v = JSON.parse(raw) as Partial<DriveAppStateMeta>
    if (
      v.schemaVersion !== 1 ||
      typeof v.exportedAt !== 'string' ||
      typeof v.contentHash !== 'string' ||
      typeof v.deviceId !== 'string'
    ) {
      return null
    }
    return {
      schemaVersion: 1,
      exportedAt: v.exportedAt,
      contentHash: v.contentHash,
      deviceId: v.deviceId,
    }
  } catch {
    return null
  }
}

function writeLastSyncMeta(meta: DriveAppStateMeta): void {
  writeFlag(DRIVE_LAST_SYNC_KEY, JSON.stringify(meta))
  driveSyncState.lastSyncedAt = meta.exportedAt
}

/** Wire Pinia-backed snapshot / apply once after app bootstrap. */
export function configureDriveAppStateSync(opts: {
  getSnapshot: SnapshotProvider
  applyFavorites: ApplyFavorites
  chooseConflict?: () => Promise<DriveConflictChoice>
}): void {
  snapshotProvider = opts.getSnapshot
  applyFavorites = opts.applyFavorites
  if (opts.chooseConflict) conflictChooser = opts.chooseConflict
}

export function setDriveConflictChooser(
  choose: (() => Promise<DriveConflictChoice>) | null,
): void {
  conflictChooser = choose
}

async function defaultConflictChooser(): Promise<DriveConflictChoice> {
  if (conflictChooser) return conflictChooser()
  const useCloud = window.confirm(
    'Google Drive has newer SingTags data, and this device also has unsynced changes.\n\nOK = use Drive (overwrite this device)\nCancel = keep this device (upload local)',
  )
  return useCloud ? 'keep-cloud' : 'keep-local'
}

export async function hashAppState(state: AppStateBackupFile): Promise<string> {
  // Stable-ish: stringify without pretty-print; includeCache is always false for Drive.
  return sha256Hex(JSON.stringify({ ...state, includeCache: false }))
}

export function decideDriveAppStateSync(opts: {
  cloud: DriveAppStateMeta | null
  localHash: string
  localExportedAt: string
  dirty: boolean
  lastSync: DriveAppStateMeta | null
}): DriveSyncDecision {
  const { cloud, localHash, localExportedAt, dirty, lastSync } = opts
  if (!cloud) {
    return { action: 'upload', reason: 'no-cloud-copy' }
  }
  if (cloud.contentHash === localHash) {
    return { action: 'noop', reason: 'same-hash' }
  }
  if (lastSync && cloud.contentHash === lastSync.contentHash && !dirty) {
    return { action: 'upload', reason: 'local-changed-since-last-sync' }
  }
  const cloudNewer = cloud.exportedAt > localExportedAt
  const localNewer = localExportedAt > cloud.exportedAt
  if (cloudNewer && dirty) {
    return { action: 'conflict', reason: 'cloud-newer-local-dirty' }
  }
  if (cloudNewer) {
    return { action: 'download', reason: 'cloud-newer' }
  }
  if (localNewer || dirty) {
    return { action: 'upload', reason: 'local-newer-or-dirty' }
  }
  // Same exportedAt but different hash — prefer upload to publish local.
  return { action: 'upload', reason: 'hash-mismatch' }
}

/** Favorites merge: union of tag ids; last-write-wins per tag by starredAt. */
export function mergeFavoritesByUnion(
  local: FavoritesBackupFile,
  cloud: FavoritesBackupFile,
): FavoritesBackupFile {
  const byId = new Map<number, FavoritesBackupFile['starred']['tags'][number]>()
  for (const t of cloud.starred.tags) {
    const id = t.summary?.id
    if (typeof id === 'number') byId.set(id, t)
  }
  for (const t of local.starred.tags) {
    const id = t.summary?.id
    if (typeof id !== 'number') continue
    const prev = byId.get(id)
    if (!prev || (t.starredAt || '') >= (prev.starredAt || '')) byId.set(id, t)
  }

  const collectionsById = new Map<string, FavoritesBackupFile['collections'][number]>()
  for (const c of [...cloud.collections, ...local.collections]) {
    const prev = collectionsById.get(c.id)
    if (!prev || (c.updatedAt || '') >= (prev.updatedAt || '')) {
      const tagIds = [...new Set([...(prev?.tagIds ?? []), ...c.tagIds])]
      collectionsById.set(c.id, { ...c, tagIds })
    } else {
      const tagIds = [...new Set([...prev.tagIds, ...c.tagIds])]
      collectionsById.set(c.id, { ...prev, tagIds })
    }
  }

  const order = [...new Set([...cloud.practice.order, ...local.practice.order])]
  const exportedAt =
    local.exportedAt >= cloud.exportedAt ? local.exportedAt : cloud.exportedAt

  return {
    version: 1,
    kind: 'singtags.favorites-backup',
    exportedAt,
    starred: {
      version: 1,
      kind: 'singtags.starred',
      exportedAt,
      tags: [...byId.values()],
    },
    collections: [...collectionsById.values()],
    practice: {
      order,
      autoAdvance: local.practice.autoAdvance,
    },
  }
}

async function ensureStateFolderId(): Promise<string> {
  return ensureAppDataPath(DRIVE_STATE_SEGMENTS)
}

export async function readCloudAppStateMeta(): Promise<DriveAppStateMeta | null> {
  const folderId = await ensureStateFolderId()
  const metaFile = await findChildByName(DRIVE_APP_STATE_META_FILE, folderId)
  if (!metaFile) return null
  const raw = await downloadJsonFile<Partial<DriveAppStateMeta>>(metaFile.id)
  if (
    raw.schemaVersion !== 1 ||
    typeof raw.exportedAt !== 'string' ||
    typeof raw.contentHash !== 'string' ||
    typeof raw.deviceId !== 'string'
  ) {
    return null
  }
  return {
    schemaVersion: 1,
    exportedAt: raw.exportedAt,
    contentHash: raw.contentHash,
    deviceId: raw.deviceId,
  }
}

export async function readCloudAppState(): Promise<AppStateBackupFile | null> {
  const folderId = await ensureStateFolderId()
  const file = await findChildByName(DRIVE_APP_STATE_FILE, folderId)
  if (!file) return null
  return parseAppStateBackup(await downloadJsonFile(file.id))
}

export async function writeCloudAppState(state: AppStateBackupFile): Promise<DriveAppStateMeta> {
  const folderId = await ensureStateFolderId()
  const normalized: AppStateBackupFile = { ...state, includeCache: false }
  const text = JSON.stringify(normalized)
  const contentHash = await sha256Hex(text)
  const meta: DriveAppStateMeta = {
    schemaVersion: 1,
    exportedAt: normalized.exportedAt,
    deviceId: getOrCreateDeviceId(),
    contentHash,
  }
  await upsertTextFile({
    name: DRIVE_APP_STATE_FILE,
    parentId: folderId,
    text,
    mimeType: 'application/json',
  })
  await upsertTextFile({
    name: DRIVE_APP_STATE_META_FILE,
    parentId: folderId,
    text: JSON.stringify(meta),
    mimeType: 'application/json',
  })
  writeLastSyncMeta(meta)
  clearDriveAppStateDirty()
  return meta
}

async function requireProviders(): Promise<{
  getSnapshot: SnapshotProvider
  applyFavorites: ApplyFavorites
}> {
  if (!snapshotProvider || !applyFavorites) {
    throw new Error('Drive app-state sync is not configured yet.')
  }
  return { getSnapshot: snapshotProvider, applyFavorites }
}

async function buildLocalState(): Promise<AppStateBackupFile> {
  const { getSnapshot } = await requireProviders()
  const input = await getSnapshot()
  return buildAppStateBackup(input, false)
}

async function applyCloudState(
  state: AppStateBackupFile,
  mode: 'replace' | 'merge',
): Promise<void> {
  const { applyFavorites: applyFav } = await requireProviders()
  const favorites =
    mode === 'merge'
      ? mergeFavoritesByUnion((await buildLocalState()).favorites, state.favorites)
      : state.favorites
  await applyFav(favorites, mode)
  applyLocalStorageSnapshot(state.localStorage || {})
}

/**
 * Non-blocking hydrate: pull cloud app-state when appropriate.
 * Safe to call repeatedly; concurrent calls share one in-flight promise.
 */
export async function ensureDriveHydrate(): Promise<void> {
  restoreGoogleConnection()
  if (!isDriveSyncEnabled() || !googleAuthState.connected || !readConnection()) return
  if (hydrateInFlight) return hydrateInFlight

  hydrateInFlight = (async () => {
    driveSyncState.status = 'hydrating'
    driveSyncState.message = ''
    try {
      const local = await buildLocalState()
      const localHash = await hashAppState(local)
      const cloud = await readCloudAppStateMeta()
      const decision = decideDriveAppStateSync({
        cloud,
        localHash,
        localExportedAt: local.exportedAt,
        dirty: isDriveAppStateDirty(),
        lastSync: readLastSyncMeta(),
      })

      if (decision.action === 'noop') {
        driveSyncState.status = 'idle'
        driveSyncState.message = 'Drive synced'
        return
      }

      if (decision.action === 'upload') {
        await writeCloudAppState(local)
        driveSyncState.status = 'idle'
        driveSyncState.message = 'Uploaded app state to Drive'
        return
      }

      if (decision.action === 'download') {
        const remote = await readCloudAppState()
        if (!remote) {
          await writeCloudAppState(local)
          return
        }
        await applyCloudState(remote, 'replace')
        const meta = cloud!
        writeLastSyncMeta(meta)
        clearDriveAppStateDirty()
        driveSyncState.status = 'idle'
        driveSyncState.message = 'Restored app state from Drive'
        // Prefs / recent live in localStorage — reload so Pinia picks them up.
        window.setTimeout(() => window.location.reload(), 250)
        return
      }

      // conflict
      const choice = await defaultConflictChooser()
      if (choice === 'keep-local') {
        await writeCloudAppState(local)
        driveSyncState.message = 'Kept this device; uploaded to Drive'
      } else if (choice === 'keep-cloud') {
        const remote = await readCloudAppState()
        if (remote) {
          await applyCloudState(remote, 'replace')
          if (cloud) writeLastSyncMeta(cloud)
          clearDriveAppStateDirty()
          driveSyncState.message = 'Kept Drive; restored to this device'
          window.setTimeout(() => window.location.reload(), 250)
        }
      } else {
        const remote = await readCloudAppState()
        if (remote) {
          const mergedFav = mergeFavoritesByUnion(local.favorites, remote.favorites)
          const merged: AppStateBackupFile = {
            ...local,
            exportedAt: new Date().toISOString(),
            favorites: mergedFav,
            localStorage: {
              ...remote.localStorage,
              ...local.localStorage,
            },
          }
          await applyCloudState(merged, 'merge')
          await writeCloudAppState(merged)
          driveSyncState.message = 'Merged favorites; uploaded to Drive'
          window.setTimeout(() => window.location.reload(), 250)
        }
      }
      driveSyncState.status = 'idle'
    } catch (e) {
      driveSyncState.status = 'error'
      driveSyncState.message = e instanceof Error ? e.message : String(e)
    } finally {
      hydrateInFlight = null
    }
  })()

  return hydrateInFlight
}

/** Debounced background upload after local changes. */
export function scheduleDriveAppStatePush(): void {
  restoreGoogleConnection()
  if (!isDriveSyncEnabled() || !googleAuthState.connected) return
  markDriveAppStateDirty()
  if (pushTimer) clearTimeout(pushTimer)
  pushTimer = setTimeout(() => {
    pushTimer = null
    void pushDriveAppStateNow()
  }, PUSH_DEBOUNCE_MS)
}

export async function pushDriveAppStateNow(): Promise<void> {
  restoreGoogleConnection()
  if (!isDriveSyncEnabled() || !googleAuthState.connected) return
  driveSyncState.status = 'pushing'
  try {
    const local = await buildLocalState()
    await writeCloudAppState(local)
    driveSyncState.status = 'idle'
    driveSyncState.message = 'Drive synced'
  } catch (e) {
    driveSyncState.status = 'error'
    driveSyncState.message = e instanceof Error ? e.message : String(e)
  }
}

/** Test hook. */
export function __resetDriveAppStateSyncForTests(): void {
  snapshotProvider = null
  applyFavorites = null
  conflictChooser = null
  if (pushTimer) clearTimeout(pushTimer)
  pushTimer = null
  hydrateInFlight = null
  driveSyncState.status = 'idle'
  driveSyncState.message = ''
  driveSyncState.lastSyncedAt = ''
}
