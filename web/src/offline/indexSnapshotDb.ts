/**
 * Persist catalog and lyrics index snapshots in IndexedDB for offline cold start.
 *
 * Complements in-memory/localStorage catalog cache with durable tag lists and lyrics docs
 * so search works before the network returns.
 */

import type { ExpansionMap } from '../search/expansions'
import type { TagSummary } from '../types/tag'
import {
  CATALOG_SNAPSHOT_STORE,
  LYRICS_SNAPSHOT_STORE,
  idbReq,
  openOfflineDb,
} from './offlineIndexedDb'

/** Fixed primary key for the catalog snapshot record. */
export const CATALOG_SNAPSHOT_ID = 'catalog'
/** Fixed primary key for the lyrics snapshot record. */
export const LYRICS_SNAPSHOT_ID = 'lyrics'

/** Catalog tag list plus search expansion map saved for offline browse/search. */
export interface CatalogSnapshotRecord {
  id: typeof CATALOG_SNAPSHOT_ID
  tags: TagSummary[]
  expansions: ExpansionMap
  savedAt: string
}

/** Lyrics documents keyed by tag id for offline lyrics search. */
export interface LyricsSnapshotRecord {
  id: typeof LYRICS_SNAPSHOT_ID
  docs: Array<{ id: number; lyrics: string }>
  savedAt: string
}

/** Read the catalog snapshot from IndexedDB, or `undefined` on miss/error. */
export async function getCatalogSnapshotIdb(): Promise<CatalogSnapshotRecord | undefined> {
  try {
    const db = await openOfflineDb()
    try {
      const tx = db.transaction(CATALOG_SNAPSHOT_STORE, 'readonly')
      return (await idbReq(
        tx.objectStore(CATALOG_SNAPSHOT_STORE).get(CATALOG_SNAPSHOT_ID),
      )) as CatalogSnapshotRecord | undefined
    } finally {
      db.close()
    }
  } catch {
    return undefined
  }
}

/** Save catalog tags and search expansions to IndexedDB. */
export async function putCatalogSnapshotIdb(
  tags: TagSummary[],
  expansions: ExpansionMap,
): Promise<void> {
  const db = await openOfflineDb()
  try {
    const tx = db.transaction(CATALOG_SNAPSHOT_STORE, 'readwrite')
    const rec: CatalogSnapshotRecord = {
      id: CATALOG_SNAPSHOT_ID,
      tags,
      expansions,
      savedAt: new Date().toISOString(),
    }
    await idbReq(tx.objectStore(CATALOG_SNAPSHOT_STORE).put(rec))
  } finally {
    db.close()
  }
}

/** Read the lyrics snapshot from IndexedDB, or `undefined` on miss/error. */
export async function getLyricsSnapshotIdb(): Promise<LyricsSnapshotRecord | undefined> {
  try {
    const db = await openOfflineDb()
    try {
      const tx = db.transaction(LYRICS_SNAPSHOT_STORE, 'readonly')
      return (await idbReq(
        tx.objectStore(LYRICS_SNAPSHOT_STORE).get(LYRICS_SNAPSHOT_ID),
      )) as LyricsSnapshotRecord | undefined
    } finally {
      db.close()
    }
  } catch {
    return undefined
  }
}

/** Save lyrics documents to IndexedDB for offline search. */
export async function putLyricsSnapshotIdb(
  docs: Array<{ id: number; lyrics: string }>,
): Promise<void> {
  const db = await openOfflineDb()
  try {
    const tx = db.transaction(LYRICS_SNAPSHOT_STORE, 'readwrite')
    const rec: LyricsSnapshotRecord = {
      id: LYRICS_SNAPSHOT_ID,
      docs,
      savedAt: new Date().toISOString(),
    }
    await idbReq(tx.objectStore(LYRICS_SNAPSHOT_STORE).put(rec))
  } finally {
    db.close()
  }
}

/** Delete catalog and lyrics snapshots (e.g. when clearing all offline data). */
export async function clearIndexSnapshotsIdb(): Promise<void> {
  try {
    const db = await openOfflineDb()
    try {
      const tx = db.transaction(
        [CATALOG_SNAPSHOT_STORE, LYRICS_SNAPSHOT_STORE],
        'readwrite',
      )
      await idbReq(tx.objectStore(CATALOG_SNAPSHOT_STORE).delete(CATALOG_SNAPSHOT_ID))
      await idbReq(tx.objectStore(LYRICS_SNAPSHOT_STORE).delete(LYRICS_SNAPSHOT_ID))
    } finally {
      db.close()
    }
  } catch {
    /* ignore */
  }
}
