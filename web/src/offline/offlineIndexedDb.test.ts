/**
 * @vitest-environment node
 */
import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  CATALOG_SNAPSHOT_STORE,
  LYRICS_SNAPSHOT_STORE,
  OFFLINE_DB_NAME,
  OFFLINE_DB_VERSION,
  PACK_PROGRESS_STORE,
  PDF_RASTER_STORE,
  TRANSFERRED_TAGS_STORE,
  openOfflineDb,
} from './offlineIndexedDb'

function deleteOfflineDb(): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.deleteDatabase(OFFLINE_DB_NAME)
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error ?? new Error('delete failed'))
    req.onblocked = () => resolve()
  })
}

/** Simulate an older v4 database before transferredTags existed. */
async function seedLegacyV4Db(): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.open(OFFLINE_DB_NAME, 4)
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
    }
    req.onsuccess = () => {
      req.result.close()
      resolve()
    }
    req.onerror = () => reject(req.error ?? new Error('seed failed'))
  })
}

describe('openOfflineDb', () => {
  beforeEach(async () => {
    await deleteOfflineDb()
  })

  it('creates transferredTags when upgrading from legacy v4', async () => {
    await seedLegacyV4Db()
    const db = await openOfflineDb()
    expect(db.version).toBe(OFFLINE_DB_VERSION)
    expect(db.objectStoreNames.contains(TRANSFERRED_TAGS_STORE)).toBe(true)
    db.close()
  })
})
