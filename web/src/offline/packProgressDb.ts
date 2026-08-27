/** Persist offline pack download progress across sessions. */

import { idbReq, openOfflineDb, PACK_PROGRESS_STORE } from './offlineIndexedDb'

export interface PackProgressRecord {
  kind: 'sheets' | 'audio'
  manifestVersion: number
  /** Next item index to download. */
  cursor: number
  donePaths: string[]
  updatedAt: string
  status: 'idle' | 'running' | 'paused' | 'done' | 'error' | 'quota'
  dismissedPrompt?: boolean
}

function openDb(): Promise<IDBDatabase> {
  return openOfflineDb()
}

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

export async function putPackProgress(rec: PackProgressRecord): Promise<void> {
  const db = await openDb()
  try {
    const tx = db.transaction(PACK_PROGRESS_STORE, 'readwrite')
    await idbReq(tx.objectStore(PACK_PROGRESS_STORE).put(rec))
  } finally {
    db.close()
  }
}

export async function clearPackProgress(kind: 'sheets' | 'audio'): Promise<void> {
  const db = await openDb()
  try {
    const tx = db.transaction(PACK_PROGRESS_STORE, 'readwrite')
    await idbReq(tx.objectStore(PACK_PROGRESS_STORE).delete(kind))
  } finally {
    db.close()
  }
}

export async function clearAllPackProgress(): Promise<void> {
  const db = await openDb()
  try {
    const tx = db.transaction(PACK_PROGRESS_STORE, 'readwrite')
    await idbReq(tx.objectStore(PACK_PROGRESS_STORE).clear())
  } finally {
    db.close()
  }
}
