/**
 * Persist tier-2 pack download progress across browser sessions.
 *
 * Cursors and status are stored in IndexedDB so large sheet/audio packs can pause/resume.
 */

import { idbReq, openOfflineDb, PACK_PROGRESS_STORE } from './offlineIndexedDb'

/** Saved state for one offline pack download (`sheets` or `audio`). */
export interface PackProgressRecord {
  kind: 'sheets' | 'audio'
  /** Manifest version this cursor belongs to (invalidates stale progress on manifest bump). */
  manifestVersion: number
  /** Next manifest item index to download on resume. */
  cursor: number
  /** Relative paths successfully stored (for UI / diagnostics). */
  donePaths: string[]
  updatedAt: string
  status: 'idle' | 'running' | 'paused' | 'done' | 'error' | 'quota'
  /** User dismissed the "resume download?" prompt for this pack. */
  dismissedPrompt?: boolean
}

/** @internal Alias — all pack progress uses {@link openOfflineDb}. */
function openDb(): Promise<IDBDatabase> {
  return openOfflineDb()
}

/** Load saved progress for a pack kind, if any. */
export async function getPackProgress(
  kind: 'sheets' | 'audio',
): Promise<PackProgressRecord | undefined> {
  const db = await openDb()
  try {
    const tx = db.transaction(PACK_PROGRESS_STORE, 'readonly')
    return (await idbReq(tx.objectStore(PACK_PROGRESS_STORE).get(kind))) as PackProgressRecord | undefined
  } finally {
    db.close()
  }
}

/** Upsert pack progress (typically after each downloaded item or status change). */
export async function putPackProgress(rec: PackProgressRecord): Promise<void> {
  const db = await openDb()
  try {
    const tx = db.transaction(PACK_PROGRESS_STORE, 'readwrite')
    await idbReq(tx.objectStore(PACK_PROGRESS_STORE).put(rec))
  } finally {
    db.close()
  }
}

/** Remove progress for one pack kind (e.g. after a successful full download). */
export async function clearPackProgress(kind: 'sheets' | 'audio'): Promise<void> {
  const db = await openDb()
  try {
    const tx = db.transaction(PACK_PROGRESS_STORE, 'readwrite')
    await idbReq(tx.objectStore(PACK_PROGRESS_STORE).delete(kind))
  } finally {
    db.close()
  }
}

/** Wipe all pack progress records (used by "clear offline data"). */
export async function clearAllPackProgress(): Promise<void> {
  const db = await openDb()
  try {
    const tx = db.transaction(PACK_PROGRESS_STORE, 'readwrite')
    await idbReq(tx.objectStore(PACK_PROGRESS_STORE).clear())
  } finally {
    db.close()
  }
}
