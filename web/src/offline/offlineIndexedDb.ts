/** Shared IndexedDB for offline pack progress + index snapshots. */

export const OFFLINE_DB_NAME = 'singtags-offline'
export const OFFLINE_DB_VERSION = 2

export const PACK_PROGRESS_STORE = 'packProgress'
export const CATALOG_SNAPSHOT_STORE = 'catalogSnapshot'
export const LYRICS_SNAPSHOT_STORE = 'lyricsSnapshot'

export function openOfflineDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'))
      return
    }
    const req = indexedDB.open(OFFLINE_DB_NAME, OFFLINE_DB_VERSION)
    req.onerror = () => reject(req.error ?? new Error('IndexedDB open failed'))
    req.onsuccess = () => resolve(req.result)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(PACK_PROGRESS_STORE)) {
        db.createObjectStore(PACK_PROGRESS_STORE, { keyPath: 'kind' })
      }
      if (!db.objectStoreNames.contains(CATALOG_SNAPSHOT_STORE)) {
        db.createObjectStore(CATALOG_SNAPSHOT_STORE, { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains(LYRICS_SNAPSHOT_STORE)) {
        db.createObjectStore(LYRICS_SNAPSHOT_STORE, { keyPath: 'id' })
      }
    }
  })
}

export function idbReq<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('IndexedDB request failed'))
  })
}
