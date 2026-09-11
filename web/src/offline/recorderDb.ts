/**
 * IndexedDB for Labs Audio Recorder sessions + take blobs.
 */
import { idbReq } from './offlineIndexedDb'
import { newLocalId } from './localLibraryDb'
import {
  normalizeRecorderSession,
  normalizeRecorderTake,
  type RecorderBlob,
  type RecorderSession,
  type RecorderTake,
} from '../types/recorder'

export const RECORDER_DB_NAME = 'singtags-recorder'
export const RECORDER_DB_VERSION = 2
export const RECORDER_SESSIONS_STORE = 'sessions'
export const RECORDER_TAKES_STORE = 'takes'
export const RECORDER_BLOBS_STORE = 'blobs'
export const RECORDER_CROP_BACKUPS_STORE = 'cropBackups'

/** Persisted one-step crop undo payload (same shape as store cropUndo). */
export type RecorderCropBackup = {
  takeId: string
  mime: string
  data: ArrayBuffer
  durationSec: number
  sampleRate: number | null
  channels: 1 | 2
  byteLength: number
}

function copyBlobData(data: ArrayBuffer | ArrayLike<number>): ArrayBuffer {
  if (data instanceof ArrayBuffer) return data.slice(0)
  return Uint8Array.from(data as ArrayLike<number>).buffer
}

export function openRecorderDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const idb =
      typeof indexedDB !== 'undefined'
        ? indexedDB
        : (globalThis as { indexedDB?: IDBFactory }).indexedDB
    if (!idb) {
      reject(new Error('IndexedDB unavailable'))
      return
    }
    const req = idb.open(RECORDER_DB_NAME, RECORDER_DB_VERSION)
    req.onerror = () => reject(req.error ?? new Error('IndexedDB open failed'))
    req.onsuccess = () => resolve(req.result)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(RECORDER_SESSIONS_STORE)) {
        db.createObjectStore(RECORDER_SESSIONS_STORE, { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains(RECORDER_TAKES_STORE)) {
        const takes = db.createObjectStore(RECORDER_TAKES_STORE, { keyPath: 'id' })
        takes.createIndex('bySession', 'sessionId', { unique: false })
      }
      if (!db.objectStoreNames.contains(RECORDER_BLOBS_STORE)) {
        db.createObjectStore(RECORDER_BLOBS_STORE, { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains(RECORDER_CROP_BACKUPS_STORE)) {
        db.createObjectStore(RECORDER_CROP_BACKUPS_STORE, { keyPath: 'takeId' })
      }
    }
  })
}

export function newRecorderSessionId(): string {
  return newLocalId('rs')
}

export function newRecorderTakeId(): string {
  return newLocalId('rt')
}

export async function listRecorderSessions(): Promise<RecorderSession[]> {
  const db = await openRecorderDb()
  try {
    const tx = db.transaction(RECORDER_SESSIONS_STORE, 'readonly')
    const rows = await idbReq(tx.objectStore(RECORDER_SESSIONS_STORE).getAll())
    return (rows as RecorderSession[])
      .map(normalizeRecorderSession)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  } finally {
    db.close()
  }
}

export async function getRecorderSession(id: string): Promise<RecorderSession | null> {
  const db = await openRecorderDb()
  try {
    const tx = db.transaction(RECORDER_SESSIONS_STORE, 'readonly')
    const row = await idbReq(tx.objectStore(RECORDER_SESSIONS_STORE).get(id))
    return row ? normalizeRecorderSession(row as RecorderSession) : null
  } finally {
    db.close()
  }
}

export async function putRecorderSession(session: RecorderSession): Promise<void> {
  const db = await openRecorderDb()
  try {
    const tx = db.transaction(RECORDER_SESSIONS_STORE, 'readwrite')
    await idbReq(tx.objectStore(RECORDER_SESSIONS_STORE).put(normalizeRecorderSession(session)))
  } finally {
    db.close()
  }
}

export async function deleteRecorderSession(id: string): Promise<void> {
  const db = await openRecorderDb()
  try {
    const stores = [RECORDER_SESSIONS_STORE, RECORDER_TAKES_STORE, RECORDER_BLOBS_STORE]
    if (db.objectStoreNames.contains(RECORDER_CROP_BACKUPS_STORE)) {
      stores.push(RECORDER_CROP_BACKUPS_STORE)
    }
    const tx = db.transaction(stores, 'readwrite')
    const sessionStore = tx.objectStore(RECORDER_SESSIONS_STORE)
    const takesStore = tx.objectStore(RECORDER_TAKES_STORE)
    const blobsStore = tx.objectStore(RECORDER_BLOBS_STORE)
    const backupStore = db.objectStoreNames.contains(RECORDER_CROP_BACKUPS_STORE)
      ? tx.objectStore(RECORDER_CROP_BACKUPS_STORE)
      : null
    const session = (await idbReq(sessionStore.get(id))) as RecorderSession | undefined
    const takeIds = session?.takeIds ?? []
    for (const takeId of takeIds) {
      await idbReq(takesStore.delete(takeId))
      await idbReq(blobsStore.delete(takeId))
      if (backupStore) await idbReq(backupStore.delete(takeId))
    }
    // Also clear any orphaned takes for this session.
    const bySession = takesStore.index('bySession')
    const orphans = (await idbReq(bySession.getAll(id))) as RecorderTake[]
    for (const t of orphans) {
      await idbReq(takesStore.delete(t.id))
      await idbReq(blobsStore.delete(t.id))
      if (backupStore) await idbReq(backupStore.delete(t.id))
    }
    await idbReq(sessionStore.delete(id))
  } finally {
    db.close()
  }
}

export async function listTakesForSession(sessionId: string): Promise<RecorderTake[]> {
  const db = await openRecorderDb()
  try {
    const tx = db.transaction([RECORDER_SESSIONS_STORE, RECORDER_TAKES_STORE], 'readonly')
    const session = (await idbReq(tx.objectStore(RECORDER_SESSIONS_STORE).get(sessionId))) as
      | RecorderSession
      | undefined
    const takesStore = tx.objectStore(RECORDER_TAKES_STORE)
    if (session?.takeIds?.length) {
      const out: RecorderTake[] = []
      for (const id of session.takeIds) {
        const row = await idbReq(takesStore.get(id))
        if (row) out.push(normalizeRecorderTake(row as RecorderTake))
      }
      return out
    }
    const bySession = takesStore.index('bySession')
    const rows = (await idbReq(bySession.getAll(sessionId))) as RecorderTake[]
    return rows.map(normalizeRecorderTake).sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  } finally {
    db.close()
  }
}

export async function getRecorderTake(id: string): Promise<RecorderTake | null> {
  const db = await openRecorderDb()
  try {
    const tx = db.transaction(RECORDER_TAKES_STORE, 'readonly')
    const row = await idbReq(tx.objectStore(RECORDER_TAKES_STORE).get(id))
    return row ? normalizeRecorderTake(row as RecorderTake) : null
  } finally {
    db.close()
  }
}

export async function putRecorderTake(take: RecorderTake, blob: RecorderBlob): Promise<void> {
  if (take.id !== blob.id) throw new Error('Take and blob ids must match')
  const db = await openRecorderDb()
  try {
    const tx = db.transaction([RECORDER_TAKES_STORE, RECORDER_BLOBS_STORE], 'readwrite')
    await idbReq(tx.objectStore(RECORDER_TAKES_STORE).put(normalizeRecorderTake(take)))
    await idbReq(
      tx.objectStore(RECORDER_BLOBS_STORE).put({
        id: blob.id,
        mime: blob.mime,
        data: copyBlobData(blob.data),
      } satisfies RecorderBlob),
    )
  } finally {
    db.close()
  }
}

/**
 * Atomically write take + blob and append takeId onto the session in one transaction.
 */
export async function appendRecorderTake(
  sessionId: string,
  take: RecorderTake,
  blob: RecorderBlob,
): Promise<void> {
  if (take.id !== blob.id) throw new Error('Take and blob ids must match')
  if (take.sessionId !== sessionId) throw new Error('Take sessionId mismatch')
  const db = await openRecorderDb()
  try {
    const tx = db.transaction(
      [RECORDER_SESSIONS_STORE, RECORDER_TAKES_STORE, RECORDER_BLOBS_STORE],
      'readwrite',
    )
    const sessionStore = tx.objectStore(RECORDER_SESSIONS_STORE)
    const session = (await idbReq(sessionStore.get(sessionId))) as RecorderSession | undefined
    if (!session) throw new Error('Session not found')
    const next = normalizeRecorderSession({
      ...session,
      takeIds: session.takeIds.includes(take.id) ? session.takeIds : [...session.takeIds, take.id],
      updatedAt: new Date().toISOString(),
    })
    await idbReq(tx.objectStore(RECORDER_TAKES_STORE).put(normalizeRecorderTake(take)))
    await idbReq(
      tx.objectStore(RECORDER_BLOBS_STORE).put({
        id: blob.id,
        mime: blob.mime,
        data: copyBlobData(blob.data),
      } satisfies RecorderBlob),
    )
    await idbReq(sessionStore.put(next))
  } finally {
    db.close()
  }
}

/** Sum of take.byteLength metadata (no blob materialization). */
export async function sumRecorderTakeBytesFromMeta(): Promise<number> {
  const db = await openRecorderDb()
  try {
    const tx = db.transaction(RECORDER_TAKES_STORE, 'readonly')
    const rows = (await idbReq(tx.objectStore(RECORDER_TAKES_STORE).getAll())) as RecorderTake[]
    let total = 0
    for (const row of rows) {
      const n = Number(row.byteLength)
      if (Number.isFinite(n) && n > 0) total += Math.trunc(n)
    }
    return total
  } finally {
    db.close()
  }
}

export async function getRecorderBlob(id: string): Promise<RecorderBlob | null> {
  const db = await openRecorderDb()
  try {
    const tx = db.transaction(RECORDER_BLOBS_STORE, 'readonly')
    const row = (await idbReq(tx.objectStore(RECORDER_BLOBS_STORE).get(id))) as RecorderBlob | undefined
    if (!row) return null
    return { id: row.id, mime: row.mime, data: copyBlobData(row.data) }
  } finally {
    db.close()
  }
}

export async function deleteRecorderTake(takeId: string): Promise<void> {
  const db = await openRecorderDb()
  try {
    const stores = [RECORDER_SESSIONS_STORE, RECORDER_TAKES_STORE, RECORDER_BLOBS_STORE]
    if (db.objectStoreNames.contains(RECORDER_CROP_BACKUPS_STORE)) {
      stores.push(RECORDER_CROP_BACKUPS_STORE)
    }
    const tx = db.transaction(stores, 'readwrite')
    const take = (await idbReq(tx.objectStore(RECORDER_TAKES_STORE).get(takeId))) as
      | RecorderTake
      | undefined
    if (take) {
      const session = (await idbReq(tx.objectStore(RECORDER_SESSIONS_STORE).get(take.sessionId))) as
        | RecorderSession
        | undefined
      if (session) {
        const next = normalizeRecorderSession({
          ...session,
          takeIds: session.takeIds.filter((id) => id !== takeId),
          updatedAt: new Date().toISOString(),
        })
        await idbReq(tx.objectStore(RECORDER_SESSIONS_STORE).put(next))
      }
    }
    await idbReq(tx.objectStore(RECORDER_TAKES_STORE).delete(takeId))
    await idbReq(tx.objectStore(RECORDER_BLOBS_STORE).delete(takeId))
    if (db.objectStoreNames.contains(RECORDER_CROP_BACKUPS_STORE)) {
      await idbReq(tx.objectStore(RECORDER_CROP_BACKUPS_STORE).delete(takeId))
    }
  } finally {
    db.close()
  }
}

export async function putRecorderCropBackup(backup: RecorderCropBackup): Promise<void> {
  const db = await openRecorderDb()
  try {
    const tx = db.transaction(RECORDER_CROP_BACKUPS_STORE, 'readwrite')
    await idbReq(
      tx.objectStore(RECORDER_CROP_BACKUPS_STORE).put({
        ...backup,
        data: copyBlobData(backup.data),
      }),
    )
  } finally {
    db.close()
  }
}

export async function getRecorderCropBackup(takeId: string): Promise<RecorderCropBackup | null> {
  const db = await openRecorderDb()
  try {
    const tx = db.transaction(RECORDER_CROP_BACKUPS_STORE, 'readonly')
    const row = (await idbReq(tx.objectStore(RECORDER_CROP_BACKUPS_STORE).get(takeId))) as
      | RecorderCropBackup
      | undefined
    if (!row) return null
    return { ...row, data: copyBlobData(row.data) }
  } finally {
    db.close()
  }
}

/** Load any single crop backup (at most one is kept). */
export async function getAnyRecorderCropBackup(): Promise<RecorderCropBackup | null> {
  const db = await openRecorderDb()
  try {
    if (!db.objectStoreNames.contains(RECORDER_CROP_BACKUPS_STORE)) return null
    const tx = db.transaction(RECORDER_CROP_BACKUPS_STORE, 'readonly')
    const rows = (await idbReq(tx.objectStore(RECORDER_CROP_BACKUPS_STORE).getAll())) as RecorderCropBackup[]
    const row = rows[0]
    if (!row) return null
    return { ...row, data: copyBlobData(row.data) }
  } finally {
    db.close()
  }
}

export async function deleteRecorderCropBackup(takeId: string): Promise<void> {
  const db = await openRecorderDb()
  try {
    if (!db.objectStoreNames.contains(RECORDER_CROP_BACKUPS_STORE)) return
    const tx = db.transaction(RECORDER_CROP_BACKUPS_STORE, 'readwrite')
    await idbReq(tx.objectStore(RECORDER_CROP_BACKUPS_STORE).delete(takeId))
  } finally {
    db.close()
  }
}

export async function clearAllRecorderCropBackups(): Promise<void> {
  const db = await openRecorderDb()
  try {
    if (!db.objectStoreNames.contains(RECORDER_CROP_BACKUPS_STORE)) return
    const tx = db.transaction(RECORDER_CROP_BACKUPS_STORE, 'readwrite')
    await idbReq(tx.objectStore(RECORDER_CROP_BACKUPS_STORE).clear())
  } finally {
    db.close()
  }
}

/** Sum of stored take blob sizes (bytes). */
export async function sumRecorderBlobBytes(): Promise<number> {
  const db = await openRecorderDb()
  try {
    const tx = db.transaction(RECORDER_BLOBS_STORE, 'readonly')
    const rows = (await idbReq(tx.objectStore(RECORDER_BLOBS_STORE).getAll())) as RecorderBlob[]
    let total = 0
    for (const row of rows) {
      total += row.data?.byteLength ?? 0
    }
    return total
  } finally {
    db.close()
  }
}
