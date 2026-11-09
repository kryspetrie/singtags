/**
 * Drive app-state file IO: read, write, and merge the cloud copy.
 * Dirty flags, decisions, and the sync loop stay in driveAppStateSync.ts.
 */
import { applyLocalStorageSnapshot, buildAppStateBackup, parseAppStateBackup, type AppStateBackupFile } from '../appStateBackup'
import { applyUserDocuments } from '../userDocuments'
import { downloadUserBlob, ensureUserBlobsUploaded } from './driveUserBlobs'
import { downloadJsonFile, ensureAppDataPath, findChildByName, upsertTextFile } from './driveAppData'
import {
  DRIVE_APP_STATE_FILE,
  DRIVE_APP_STATE_META_FILE,
  DRIVE_STATE_SEGMENTS,
  applyFavorites,
  clearDriveAppStateDirty,
  clearRetry,
  driveSyncState,
  getOrCreateDeviceId,
  hashAppState,
  mergeAppStates,
  mergeFavoritesByUnion,
  setSuppressDrivePush,
  snapshotProvider,
  writeLastSyncMeta,
  type ApplyFavorites,
  type DriveAppStateMeta,
  type SnapshotProvider,
} from './driveAppStateSync'

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
  const contentHash = await hashAppState(normalized)
  await ensureUserBlobsUploaded(normalized.documents)
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
  clearRetry()
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

export async function buildLocalState(): Promise<AppStateBackupFile> {
  const { getSnapshot } = await requireProviders()
  const input = await getSnapshot()
  return buildAppStateBackup(input, false)
}

export async function applyCloudState(
  state: AppStateBackupFile,
  mode: 'replace' | 'merge',
): Promise<void> {
  const { applyFavorites: applyFav } = await requireProviders()
  const favorites =
    mode === 'merge'
      ? mergeFavoritesByUnion((await buildLocalState()).favorites, state.favorites)
      : state.favorites
  await applyFav(favorites, mode === 'merge' ? 'merge' : 'replace')
  applyLocalStorageSnapshot(state.localStorage || {})
  await applyUserDocuments(state.documents, downloadUserBlob)
}

/**
 * If Drive moved since lastSync, merge remote into local (favorites union) then upload.
 * Never blind-overwrite a newer peer device.
 */
export async function uploadMergingRemoteIfNeeded(local: AppStateBackupFile): Promise<DriveAppStateMeta> {
  const localHash = await hashAppState(local)
  const cloudMeta = await readCloudAppStateMeta()
  // Compare the file body, not only the meta hash. A meta hash from an older
  // build can match lastSync while the favorites in the file differ.
  if (cloudMeta && localHash !== cloudMeta.contentHash) {
    const remote = await readCloudAppState()
    if (remote && (await hashAppState(remote)) !== localHash) {
      const merged = mergeAppStates(local, remote)
      setSuppressDrivePush(true)
      try {
        await applyCloudState(merged, 'merge')
      } finally {
        setSuppressDrivePush(false)
      }
      // Re-snapshot after apply so IDB/prefs match what we upload.
      const after = await buildLocalState()
      const toWrite = mergeAppStates(after, remote)
      return writeCloudAppState(toWrite)
    }
  }
  return writeCloudAppState(local)
}

/**
 * This browser has never finished a Drive sync. Take Drive's favorites,
 * recents, and settings, and keep any stars that exist only on this device.
 */
export async function restoreFirstCloudCopy(
  local: AppStateBackupFile,
  pushLocal: boolean,
): Promise<void> {
  const remote = await readCloudAppState()
  if (!remote) {
    if (!pushLocal) {
      driveSyncState.status = 'idle'
      driveSyncState.message = 'Local changes queued to upload'
      return
    }
    await writeCloudAppState(local)
    driveSyncState.status = 'idle'
    driveSyncState.message = 'Uploaded app state to Drive'
    return
  }
  const merged: AppStateBackupFile = {
    ...remote,
    exportedAt: new Date().toISOString(),
    includeCache: false,
    favorites: mergeFavoritesByUnion(local.favorites, remote.favorites),
  }
  setSuppressDrivePush(true)
  try {
    await applyCloudState(merged, 'replace')
  } finally {
    setSuppressDrivePush(false)
  }
  const applied = await buildLocalState()
  // Rewrite Drive so the stored hash matches the restored favorites and settings.
  // Otherwise the next check treats this device as edited and uploads over the copy.
  await writeCloudAppState(applied)
  driveSyncState.status = 'idle'
  driveSyncState.message =
    (await hashAppState(applied)) === (await hashAppState(remote))
      ? 'Restored app state from Drive'
      : 'Merged with Drive and uploaded'
  clearRetry()
  window.setTimeout(() => window.location.reload(), 250)
}

export async function applyMergedRemote(local: AppStateBackupFile): Promise<void> {
  const remote = await readCloudAppState()
  if (!remote) {
    await writeCloudAppState(local)
    driveSyncState.message = 'Uploaded app state to Drive'
    return
  }
  const merged = mergeAppStates(local, remote)
  setSuppressDrivePush(true)
  try {
    await applyCloudState(merged, 'merge')
  } finally {
    setSuppressDrivePush(false)
  }
  const after = await buildLocalState()
  await writeCloudAppState(mergeAppStates(after, remote))
  driveSyncState.message = 'Merged with Drive and uploaded'
  // Prefs may have changed — reload so Pinia picks up localStorage.
  window.setTimeout(() => window.location.reload(), 250)
}

