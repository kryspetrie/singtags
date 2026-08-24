/** Persist offline pack download progress across sessions. */

const DB_NAME = 'singtags-offline'
const DB_VERSION = 1
const STORE = 'packProgress'

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
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onerror = () => reject(req.error ?? new Error('IndexedDB open failed'))
    req.onsuccess = () => resolve(req.result)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'kind' })
      }
    }
  })
}

function idbReq<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('IndexedDB request failed'))
  })
}

export async function getPackProgress(
  kind: 'sheets' | 'audio',
): Promise<PackProgressRecord | undefined> {
  const db = await openDb()
  try {
    const tx = db.transaction(STORE, 'readonly')
    return (await idbReq(tx.objectStore(STORE).get(kind))) as PackProgressRecord | undefined
  } finally {
    db.close()
  }
}

export async function putPackProgress(rec: PackProgressRecord): Promise<void> {
  const db = await openDb()
  try {
    const tx = db.transaction(STORE, 'readwrite')
    await idbReq(tx.objectStore(STORE).put(rec))
  } finally {
    db.close()
  }
}

export async function clearPackProgress(kind: 'sheets' | 'audio'): Promise<void> {
  const db = await openDb()
  try {
    const tx = db.transaction(STORE, 'readwrite')
    await idbReq(tx.objectStore(STORE).delete(kind))
  } finally {
    db.close()
  }
}
