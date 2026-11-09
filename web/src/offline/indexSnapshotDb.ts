/**
 * Persist catalog and lyrics index snapshots in IndexedDB for offline cold start.
 *
 * Catalog is stored as gzip JSON (small IO) with a legacy object-form reader so
 * existing installs keep working until the next successful network save.
 */

import type { ExpansionMap } from '../search/expansions'
import type { TagSummary } from '../types/tag'
import { parseGzipJsonBuffer } from '../lib/gunzipJson'
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

/** Decoded catalog snapshot returned to callers. */
export interface CatalogSnapshotRecord {
  id: typeof CATALOG_SNAPSHOT_ID
  tags: TagSummary[]
  expansions: ExpansionMap
  savedAt: string
  /** `gzip` rows are already in the fast format; legacy rows should be rewritten. */
  storageFormat: 'gzip' | 'legacy'
  /** SHA-1 of the published `core.json.gz` bytes, when this row came from the network. */
  sourceHash: string | null
}

/** Lyrics documents keyed by tag id for offline lyrics search. */
export interface LyricsSnapshotRecord {
  id: typeof LYRICS_SNAPSHOT_ID
  docs: Array<{ id: number; lyrics: string }>
  savedAt: string
  /** SHA-1 of the published `lyrics.json.gz` bytes, when this row came from the network. */
  sourceHash?: string | null
}

const CATALOG_FORMAT_GZIP = 'gzip-json-v1'

type CatalogSnapshotGzipRow = {
  id: typeof CATALOG_SNAPSHOT_ID
  format: typeof CATALOG_FORMAT_GZIP
  data: ArrayBuffer
  savedAt: string
  sourceHash?: string | null
}

type CatalogSnapshotLegacyRow = {
  id: typeof CATALOG_SNAPSHOT_ID
  tags: TagSummary[]
  expansions?: ExpansionMap
  savedAt?: string
  format?: undefined
}

async function gzipJsonPayload(payload: unknown): Promise<ArrayBuffer> {
  const bytes = new TextEncoder().encode(JSON.stringify(payload))
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip'))
  return new Response(stream).arrayBuffer()
}

async function decodeCatalogRow(
  raw: CatalogSnapshotGzipRow | CatalogSnapshotLegacyRow | undefined,
): Promise<CatalogSnapshotRecord | undefined> {
  if (!raw) return undefined
  if (raw.format === CATALOG_FORMAT_GZIP && raw.data) {
    const parsed = await parseGzipJsonBuffer<{
      tags?: TagSummary[]
      expansions?: ExpansionMap
    }>(raw.data)
    if (!parsed.tags?.length) return undefined
    return {
      id: CATALOG_SNAPSHOT_ID,
      tags: parsed.tags,
      expansions: parsed.expansions ?? {},
      savedAt: raw.savedAt,
      storageFormat: 'gzip',
      sourceHash: raw.sourceHash ?? null,
    }
  }
  if ('tags' in raw && raw.tags?.length) {
    return {
      id: CATALOG_SNAPSHOT_ID,
      tags: raw.tags,
      expansions: raw.expansions ?? {},
      savedAt: raw.savedAt ?? new Date(0).toISOString(),
      storageFormat: 'legacy',
      sourceHash: null,
    }
  }
  return undefined
}

/** Read the catalog snapshot from IndexedDB, or `undefined` on miss/error. */
export async function getCatalogSnapshotIdb(): Promise<CatalogSnapshotRecord | undefined> {
  try {
    const db = await openOfflineDb()
    try {
      const tx = db.transaction(CATALOG_SNAPSHOT_STORE, 'readonly')
      const raw = (await idbReq(
        tx.objectStore(CATALOG_SNAPSHOT_STORE).get(CATALOG_SNAPSHOT_ID),
      )) as CatalogSnapshotGzipRow | CatalogSnapshotLegacyRow | undefined
      return await decodeCatalogRow(raw)
    } finally {
      db.close()
    }
  } catch {
    return undefined
  }
}

/** Remember the published core-file hash without rewriting the gzip payload. */
export async function setCatalogSnapshotSourceHash(sourceHash: string): Promise<void> {
  const db = await openOfflineDb()
  try {
    const tx = db.transaction(CATALOG_SNAPSHOT_STORE, 'readwrite')
    const store = tx.objectStore(CATALOG_SNAPSHOT_STORE)
    const raw = (await idbReq(store.get(CATALOG_SNAPSHOT_ID))) as CatalogSnapshotGzipRow | undefined
    if (!raw || raw.format !== CATALOG_FORMAT_GZIP) return
    raw.sourceHash = sourceHash
    await idbReq(store.put(raw))
  } finally {
    db.close()
  }
}

/** Save catalog tags and search expansions to IndexedDB (gzip JSON). */
export async function putCatalogSnapshotIdb(
  tags: TagSummary[],
  expansions: ExpansionMap,
  sourceHash?: string | null,
): Promise<void> {
  const data = await gzipJsonPayload({ tags, expansions })
  const db = await openOfflineDb()
  try {
    const tx = db.transaction(CATALOG_SNAPSHOT_STORE, 'readwrite')
    const rec: CatalogSnapshotGzipRow = {
      id: CATALOG_SNAPSHOT_ID,
      format: CATALOG_FORMAT_GZIP,
      data,
      savedAt: new Date().toISOString(),
      sourceHash: sourceHash ?? null,
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
  sourceHash?: string | null,
): Promise<void> {
  const db = await openOfflineDb()
  try {
    const tx = db.transaction(LYRICS_SNAPSHOT_STORE, 'readwrite')
    const rec: LyricsSnapshotRecord = {
      id: LYRICS_SNAPSHOT_ID,
      docs,
      savedAt: new Date().toISOString(),
      sourceHash: sourceHash ?? null,
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
