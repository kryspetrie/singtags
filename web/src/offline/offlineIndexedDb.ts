/**
 * Shared IndexedDB schema for offline auxiliary data.
 *
 * Database `singtags-offline` holds pack download cursors, catalog/lyrics snapshots,
 * and derived PDF page rasters. Favorites live in a separate DB (`singtags`, store `starred`).
 */

/** IndexedDB database name for offline progress and snapshots. */
export const OFFLINE_DB_NAME = 'singtags-offline'
/** Schema version; bump when adding object stores or migrations. */
export const OFFLINE_DB_VERSION = 5

/** Object store: {@link PackProgressRecord} keyed by pack kind. */
export const PACK_PROGRESS_STORE = 'packProgress'
/** Object store: catalog tag list + search expansions snapshot. */
export const CATALOG_SNAPSHOT_STORE = 'catalogSnapshot'
/** Object store: lyrics text snapshot for offline search. */
export const LYRICS_SNAPSHOT_STORE = 'lyricsSnapshot'
/** Object store: client-side high-res PDF page rasters (derived; safe to clear). */
export const PDF_RASTER_STORE = 'pdfRaster'
/** Object store: sheets received via peer QR transfer. */
export const TRANSFERRED_TAGS_STORE = 'transferredTags'

/**
 * Open the shared offline IndexedDB, creating stores on upgrade.
 *
 * @throws When IndexedDB is unavailable (SSR, private mode, etc.).
 */
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
      if (!db.objectStoreNames.contains(PDF_RASTER_STORE)) {
        db.createObjectStore(PDF_RASTER_STORE, { keyPath: 'key' })
      }
      if (!db.objectStoreNames.contains(TRANSFERRED_TAGS_STORE)) {
        db.createObjectStore(TRANSFERRED_TAGS_STORE, { keyPath: 'tagId' })
      }
    }
  })
}

/** Promisify a single IndexedDB request (resolve result or reject on error). */
export function idbReq<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('IndexedDB request failed'))
  })
}
