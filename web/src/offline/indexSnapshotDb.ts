/** Persist catalog + lyrics indexes in IndexedDB for offline cold start. */

import type { ExpansionMap } from '../search/expansions'
import type { TagSummary } from '../types/tag'
import {
  CATALOG_SNAPSHOT_STORE,
  LYRICS_SNAPSHOT_STORE,
  idbReq,
  openOfflineDb,
} from './offlineIndexedDb'

export const CATALOG_SNAPSHOT_ID = 'catalog'
export const LYRICS_SNAPSHOT_ID = 'lyrics'

export interface CatalogSnapshotRecord {
  id: typeof CATALOG_SNAPSHOT_ID
  tags: TagSummary[]
  expansions: ExpansionMap
  savedAt: string
}

export interface LyricsSnapshotRecord {
  id: typeof LYRICS_SNAPSHOT_ID
  docs: Array<{ id: number; lyrics: string }>
  savedAt: string
}

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
