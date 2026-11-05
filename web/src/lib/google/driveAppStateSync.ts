/**
 * Drive app-state backup / hydrate (Phase 2).
 *
 * Stores under appDataFolder/singtags/state/:
 *   app-state.json + app-state.meta.json
 *
 * Concurrent devices: favorites are union-merged (never last-writer-wins wipe).
 * Failed uploads retry with backoff until dirty clears.
 */

import { isSingTagsOffline } from '../appOffline'
import {
  APP_STATE_LOCAL_KEYS,
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
  getAccessToken,
  googleAuthState,
  hasUsableAccessToken,
  isDriveSyncEnabled,
  readConnection,
  restoreGoogleConnection,
  GoogleAuthError,
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
  /** Both sides changed — auto-merge favorites (no data loss) then upload. */
  | { action: 'merge'; reason: string }

/** While applying a cloud restore, favorites import must not mark local dirty / schedule push. */
let suppressDrivePush = false

export type DriveConflictChoice = 'keep-local' | 'keep-cloud' | 'merge'

export const driveSyncState = reactive({
  status: 'idle' as 'idle' | 'hydrating' | 'pushing' | 'error' | 'retrying',
  message: '' as string,
  lastSyncedAt: '' as string,
  retryAttempt: 0,
  pendingDirty: false,
})

type SnapshotProvider = () => Promise<AppStateSnapshotInput> | AppStateSnapshotInput
type ApplyFavorites = (favorites: FavoritesBackupFile, mode: 'replace' | 'merge') => Promise<void>

let snapshotProvider: SnapshotProvider | null = null
let applyFavorites: ApplyFavorites | null = null
let conflictChooser: (() => Promise<DriveConflictChoice>) | null = null
let pushTimer: ReturnType<typeof setTimeout> | null = null
let retryTimer: ReturnType<typeof setTimeout> | null = null
let hydrateInFlight: Promise<void> | null = null
let pushInFlight: Promise<void> | null = null
let onlineHooked = false
let storageHooked = false

/** How long to wait so a burst of stars / settings edits becomes one Drive upload. */
export const DRIVE_PUSH_BATCH_SECONDS_KEY = 'singtags.drive.sync.pushBatchSeconds.v1'
/** Preset batch windows (seconds). `0` = don’t auto-upload. */
export const DRIVE_PUSH_BATCH_OPTIONS = [0, 2, 5, 15, 30, 60] as const
export const DRIVE_PUSH_BATCH_DEFAULT_SECONDS = 5

const RETRY_BASE_MS = 15_000
const RETRY_MAX_MS = 5 * 60_000
const SYNCED_LOCAL_KEYS = new Set<string>(APP_STATE_LOCAL_KEYS)

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
  driveSyncState.pendingDirty = true
}

export function clearDriveAppStateDirty(): void {
  writeFlag(DRIVE_DIRTY_KEY, null)
  driveSyncState.pendingDirty = false
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
  ensureOnlineRetryHook()
  installAppStateStorageHook()
  driveSyncState.pendingDirty = isDriveAppStateDirty()
}

export function normalizeDrivePushBatchSeconds(n: unknown): number {
  const v = typeof n === 'number' ? n : Number(n)
  if (!Number.isFinite(v) || v <= 0) return 0
  const seconds = Math.floor(v)
  if ((DRIVE_PUSH_BATCH_OPTIONS as readonly number[]).includes(seconds)) return seconds
  return Math.min(300, Math.max(1, seconds))
}

export function getDrivePushBatchSeconds(): number {
  const raw = readFlag(DRIVE_PUSH_BATCH_SECONDS_KEY)
  if (raw == null || raw === '') return DRIVE_PUSH_BATCH_DEFAULT_SECONDS
  return normalizeDrivePushBatchSeconds(raw)
}

export function setDrivePushBatchSeconds(seconds: number): void {
  const next = normalizeDrivePushBatchSeconds(seconds)
  writeFlag(DRIVE_PUSH_BATCH_SECONDS_KEY, String(next))
  if (!pushTimer) return
  clearTimeout(pushTimer)
  pushTimer = null
  if (isDriveAppStateDirty()) scheduleDriveAppStatePush()
}

export function drivePushBatchLabel(seconds: number): string {
  const s = normalizeDrivePushBatchSeconds(seconds)
  if (s <= 0) return 'Off'
  if (s === 1) return 'Every second'
  return `Every ${s} seconds`
}

/**
 * Recents, settings, and other synced localStorage keys don’t go through the
 * favorites store. One hook batches those writes into the same upload.
 */
function installAppStateStorageHook(): void {
  if (storageHooked || typeof localStorage === 'undefined') return
  const setItem = localStorage.setItem.bind(localStorage)
  const removeItem = localStorage.removeItem.bind(localStorage)
  const patchedSet = (key: string, value: string) => {
    setItem(key, value)
    if (SYNCED_LOCAL_KEYS.has(key)) scheduleDriveAppStatePush()
  }
  const patchedRemove = (key: string) => {
    removeItem(key)
    if (SYNCED_LOCAL_KEYS.has(key)) scheduleDriveAppStatePush()
  }
  try {
    Object.defineProperty(localStorage, 'setItem', {
      configurable: true,
      writable: true,
      value: patchedSet,
    })
    Object.defineProperty(localStorage, 'removeItem', {
      configurable: true,
      writable: true,
      value: patchedRemove,
    })
  } catch {
    return
  }
  storageHooked = true
}

export function setDriveConflictChooser(
  choose: (() => Promise<DriveConflictChoice>) | null,
): void {
  conflictChooser = choose
}

/** Bound by {@link DriveSyncConflictDialog} — optional manual override; concurrent sync auto-merges. */
export const driveConflictUi = reactive({
  open: false,
})

let conflictUiResolve: ((choice: DriveConflictChoice) => void) | null = null

/** Resolve the in-app conflict dialog (Keep device / Use Drive / Merge). */
export function resolveDriveConflict(choice: DriveConflictChoice): void {
  driveConflictUi.open = false
  const resolve = conflictUiResolve
  conflictUiResolve = null
  resolve?.(choice)
}

/** Dismiss / Escape → keep this device (do not overwrite local with Drive). */
export function dismissDriveConflict(): void {
  resolveDriveConflict('keep-local')
}

async function defaultConflictChooser(): Promise<DriveConflictChoice> {
  if (conflictChooser) return conflictChooser()
  // Concurrent edits default to merge (favorites union) — never prompt to wipe data.
  return 'merge'
}

export async function hashAppState(state: AppStateBackupFile): Promise<string> {
  // Stable-ish: stringify without pretty-print; includeCache is always false for Drive.
  return sha256Hex(JSON.stringify({ ...state, includeCache: false }))
}

/**
 * Decide sync action from content hashes + dirty/lastSync — not from freshly minted
 * `exportedAt` (buildAppStateBackup always stamps "now", which falsely looks locally newer).
 */
export function decideDriveAppStateSync(opts: {
  cloud: DriveAppStateMeta | null
  localHash: string
  dirty: boolean
  lastSync: DriveAppStateMeta | null
}): DriveSyncDecision {
  const { cloud, localHash, dirty, lastSync } = opts
  if (!cloud) {
    return { action: 'upload', reason: 'no-cloud-copy' }
  }
  if (cloud.contentHash === localHash) {
    return { action: 'noop', reason: 'same-hash' }
  }

  const cloudChanged = !lastSync || cloud.contentHash !== lastSync.contentHash
  const localChanged = dirty || !lastSync || localHash !== lastSync.contentHash

  // New browser / first hydrate: prefer Drive so we don't upload empty locals over cloud.
  if (!lastSync && !dirty) {
    return { action: 'download', reason: 'first-hydrate-prefer-cloud' }
  }
  if (cloudChanged && localChanged) {
    return { action: 'merge', reason: 'both-changed' }
  }
  if (cloudChanged) {
    return { action: 'download', reason: 'cloud-changed' }
  }
  if (localChanged) {
    return { action: 'upload', reason: 'local-changed' }
  }
  return { action: 'noop', reason: 'stable' }
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

/** Merge two app-state blobs: favorites union; localStorage local-over-cloud. */
export function mergeAppStates(
  local: AppStateBackupFile,
  cloud: AppStateBackupFile,
): AppStateBackupFile {
  return {
    version: 1,
    kind: 'singtags.app-state',
    exportedAt: new Date().toISOString(),
    includeCache: false,
    favorites: mergeFavoritesByUnion(local.favorites, cloud.favorites),
    localStorage: {
      ...cloud.localStorage,
      ...local.localStorage,
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
  await applyFav(favorites, mode === 'merge' ? 'merge' : 'replace')
  applyLocalStorageSnapshot(state.localStorage || {})
}

/**
 * If Drive moved since lastSync, merge remote into local (favorites union) then upload.
 * Never blind-overwrite a newer peer device.
 */
async function uploadMergingRemoteIfNeeded(local: AppStateBackupFile): Promise<DriveAppStateMeta> {
  const lastSync = readLastSyncMeta()
  const cloudMeta = await readCloudAppStateMeta()
  if (
    cloudMeta &&
    (!lastSync || cloudMeta.contentHash !== lastSync.contentHash) &&
    (await hashAppState(local)) !== cloudMeta.contentHash
  ) {
    const remote = await readCloudAppState()
    if (remote) {
      const merged = mergeAppStates(local, remote)
      suppressDrivePush = true
      try {
        await applyCloudState(merged, 'merge')
      } finally {
        suppressDrivePush = false
      }
      // Re-snapshot after apply so IDB/prefs match what we upload.
      const after = await buildLocalState()
      const toWrite = mergeAppStates(after, remote)
      return writeCloudAppState(toWrite)
    }
  }
  return writeCloudAppState(local)
}

async function applyMergedRemote(local: AppStateBackupFile): Promise<void> {
  const remote = await readCloudAppState()
  if (!remote) {
    await writeCloudAppState(local)
    driveSyncState.message = 'Uploaded app state to Drive'
    return
  }
  const merged = mergeAppStates(local, remote)
  suppressDrivePush = true
  try {
    await applyCloudState(merged, 'merge')
  } finally {
    suppressDrivePush = false
  }
  const after = await buildLocalState()
  await writeCloudAppState(mergeAppStates(after, remote))
  driveSyncState.message = 'Merged with Drive and uploaded'
  // Prefs may have changed — reload so Pinia picks up localStorage.
  window.setTimeout(() => window.location.reload(), 250)
}

function clearRetry(): void {
  driveSyncState.retryAttempt = 0
  if (retryTimer) {
    clearTimeout(retryTimer)
    retryTimer = null
  }
}

function scheduleRetry(reason: string): void {
  markDriveAppStateDirty()
  if (isSingTagsOffline()) {
    driveSyncState.status = 'idle'
    driveSyncState.message = 'Offline — Drive sync paused'
    return
  }
  const attempt = driveSyncState.retryAttempt
  const delay = Math.min(RETRY_MAX_MS, RETRY_BASE_MS * 2 ** Math.min(attempt, 6))
  driveSyncState.retryAttempt = attempt + 1
  driveSyncState.status = 'retrying'
  driveSyncState.message = `${reason} — retrying in ${Math.round(delay / 1000)}s`
  if (retryTimer) clearTimeout(retryTimer)
  retryTimer = setTimeout(() => {
    retryTimer = null
    void pushDriveAppStateNow()
  }, delay)
}

function ensureOnlineRetryHook(): void {
  if (onlineHooked || typeof window === 'undefined') return
  onlineHooked = true
  window.addEventListener('online', () => {
    if (isDriveAppStateDirty()) scheduleDriveAppStatePush()
  })
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && isDriveAppStateDirty()) {
      scheduleDriveAppStatePush()
    }
  })
}

/**
 * Non-blocking hydrate: pull cloud app-state when appropriate.
 * Safe to call repeatedly; concurrent calls share one in-flight promise.
 */
export async function ensureDriveHydrate(opts?: {
  allowTokenPrompt?: boolean
  /**
   * When false, a pull may download or merge but will not upload local-only
   * changes. Those stay dirty for the short push batch.
   */
  pushLocal?: boolean
}): Promise<void> {
  restoreGoogleConnection()
  if (!isDriveSyncEnabled() || !googleAuthState.connected || !readConnection()) return
  if (isSingTagsOffline()) {
    driveSyncState.status = 'idle'
    driveSyncState.message = 'Offline — Drive sync paused'
    return
  }
  // Background hydrate must not open GIS popups (they flash and close without a gesture).
  if (!opts?.allowTokenPrompt && !hasUsableAccessToken()) {
    driveSyncState.status = 'idle'
    driveSyncState.message = 'Connected — tap Sync now in Labs to refresh Drive'
    if (isDriveAppStateDirty()) {
      driveSyncState.message = 'Pending upload — tap Sync now in Labs (signed in)'
    }
    return
  }
  if (hydrateInFlight) return hydrateInFlight

  const pushLocal = opts?.pushLocal !== false
  hydrateInFlight = (async () => {
    const dirtyStamp = readFlag(DRIVE_DIRTY_KEY)
    driveSyncState.status = 'hydrating'
    driveSyncState.message = ''
    try {
      if (opts?.allowTokenPrompt && !hasUsableAccessToken()) {
        await getAccessToken({ interactive: true })
      }
      const local = await buildLocalState()
      const localHash = await hashAppState(local)
      const cloud = await readCloudAppStateMeta()
      const decision = decideDriveAppStateSync({
        cloud,
        localHash,
        dirty: isDriveAppStateDirty(),
        lastSync: readLastSyncMeta(),
      })

      if (decision.action === 'noop') {
        driveSyncState.status = 'idle'
        driveSyncState.message = 'Drive synced'
        // A star during this check must stay queued for the push batch.
        if (readFlag(DRIVE_DIRTY_KEY) === dirtyStamp) {
          clearDriveAppStateDirty()
          clearRetry()
        }
        if (cloud) writeLastSyncMeta(cloud)
        return
      }

      if (decision.action === 'upload') {
        if (!pushLocal) {
          driveSyncState.status = 'idle'
          driveSyncState.message = 'Local changes queued to upload'
          return
        }
        await uploadMergingRemoteIfNeeded(local)
        driveSyncState.status = 'idle'
        driveSyncState.message = 'Uploaded app state to Drive'
        return
      }

      if (decision.action === 'download') {
        const remote = await readCloudAppState()
        if (!remote) {
          await writeCloudAppState(local)
          driveSyncState.status = 'idle'
          driveSyncState.message = 'Uploaded app state to Drive'
          return
        }
        // If we somehow have local dirty during download decision, merge instead of replace.
        if (isDriveAppStateDirty()) {
          await applyMergedRemote(local)
          driveSyncState.status = 'idle'
          return
        }
        suppressDrivePush = true
        try {
          await applyCloudState(remote, 'replace')
        } finally {
          suppressDrivePush = false
        }
        writeLastSyncMeta(cloud!)
        clearDriveAppStateDirty()
        clearRetry()
        driveSyncState.status = 'idle'
        driveSyncState.message = 'Restored app state from Drive'
        window.setTimeout(() => window.location.reload(), 250)
        return
      }

      // merge — concurrent devices; never wipe favorites
      if (cloud) {
        const choice = await defaultConflictChooser()
        if (choice === 'keep-local') {
          await uploadMergingRemoteIfNeeded(local)
          driveSyncState.message = 'Kept this device; uploaded to Drive'
        } else if (choice === 'keep-cloud') {
          const remote = await readCloudAppState()
          if (remote) {
            suppressDrivePush = true
            try {
              await applyCloudState(remote, 'replace')
            } finally {
              suppressDrivePush = false
            }
            writeLastSyncMeta(cloud)
            clearDriveAppStateDirty()
            clearRetry()
            driveSyncState.message = 'Kept Drive; restored to this device'
            window.setTimeout(() => window.location.reload(), 250)
          }
        } else {
          await applyMergedRemote(local)
        }
      }
      driveSyncState.status = 'idle'
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      driveSyncState.status = 'error'
      driveSyncState.message = msg
      if (!(e instanceof GoogleAuthError && e.code === 'reconnect')) {
        scheduleRetry(msg || 'Drive sync failed')
      } else {
        driveSyncState.message = `${msg} — tap Sync now when ready`
        markDriveAppStateDirty()
      }
    } finally {
      suppressDrivePush = false
      hydrateInFlight = null
    }
  })()

  return hydrateInFlight
}

/** Debounced background upload after local changes (favorites, recents, settings). */
export function scheduleDriveAppStatePush(): void {
  if (suppressDrivePush) return
  // Remember the edit even if Drive isn’t connected yet, so the next sign-in uploads it.
  markDriveAppStateDirty()
  restoreGoogleConnection()
  if (!isDriveSyncEnabled() || !googleAuthState.connected) return
  // Stay dirty while Offline; upload when connectivity / Online mode returns.
  if (isSingTagsOffline()) {
    driveSyncState.message = 'Offline — Drive upload pending'
    return
  }
  const seconds = getDrivePushBatchSeconds()
  if (seconds <= 0) return
  if (pushTimer) clearTimeout(pushTimer)
  pushTimer = setTimeout(() => {
    pushTimer = null
    void pushDriveAppStateNow()
  }, seconds * 1000)
}

export async function pushDriveAppStateNow(): Promise<void> {
  restoreGoogleConnection()
  if (!isDriveSyncEnabled() || !googleAuthState.connected) return
  if (isSingTagsOffline()) {
    driveSyncState.status = 'idle'
    driveSyncState.message = 'Offline — Drive sync paused'
    markDriveAppStateDirty()
    return
  }
  if (pushInFlight) return pushInFlight
  // Background debounce must not open a GIS popup after reload.
  if (!hasUsableAccessToken()) {
    driveSyncState.status = 'idle'
    driveSyncState.message = 'Pending upload — tap Sync now in Labs'
    markDriveAppStateDirty()
    return
  }

  pushInFlight = (async () => {
    driveSyncState.status = 'pushing'
    try {
      const local = await buildLocalState()
      await uploadMergingRemoteIfNeeded(local)
      driveSyncState.status = 'idle'
      driveSyncState.message = 'Drive synced'
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      driveSyncState.status = 'error'
      driveSyncState.message = msg
      if (!(e instanceof GoogleAuthError && e.code === 'reconnect')) {
        scheduleRetry(msg || 'Upload failed')
      } else {
        markDriveAppStateDirty()
        driveSyncState.message = `${msg} — tap Sync now when ready`
      }
    } finally {
      pushInFlight = null
    }
  })()

  return pushInFlight
}

/** User-gesture sync: may prompt GIS once, then hydrate or push as needed. */
export async function syncDriveAppStateNow(): Promise<void> {
  clearRetry()
  await ensureDriveHydrate({ allowTokenPrompt: true })
  if (isDriveAppStateDirty() && hasUsableAccessToken()) {
    await pushDriveAppStateNow()
  }
}

/** Test hook. */
export function __resetDriveAppStateSyncForTests(): void {
  snapshotProvider = null
  applyFavorites = null
  conflictChooser = null
  if (pushTimer) clearTimeout(pushTimer)
  pushTimer = null
  clearRetry()
  hydrateInFlight = null
  pushInFlight = null
  driveSyncState.status = 'idle'
  driveSyncState.message = ''
  driveSyncState.lastSyncedAt = ''
  driveSyncState.retryAttempt = 0
  driveSyncState.pendingDirty = false
  driveConflictUi.open = false
  conflictUiResolve = null
  suppressDrivePush = false
}
