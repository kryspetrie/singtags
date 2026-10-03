/**
 * Catalog snapshot persistence: tag summaries + search expansions in IndexedDB.
 *
 * A localStorage mirror is read for legacy/small snapshots only — the full
 * library (~6MB JSON) exceeds typical 5MB quotas, so we never write it there
 * (failed setItem + giant stringify was stalling refresh).
 */

import type { ExpansionMap } from '../search/expansions'
import type { TagSummary } from '../types/tag'
import {
  getCatalogSnapshotIdb,
  putCatalogSnapshotIdb,
} from '../offline/indexSnapshotDb'
import {
  clearPersistentSnapshot,
  loadPersistentSnapshot,
} from './persistentSnapshot'

/** localStorage key for legacy/small catalog mirrors (read-only going forward). */
export const CATALOG_SNAPSHOT_KEY = 'singtags.catalogSnapshot.v1'

/** localStorage / IDB payload shape for the full tag index. */
export interface CatalogSnapshot {
  tags: TagSummary[]
  expansions: ExpansionMap
}

/** Runtime type guard for {@link CatalogSnapshot}. */
function isCatalogSnapshot(data: unknown): data is CatalogSnapshot {
  return (
    typeof data === 'object' &&
    data != null &&
    Array.isArray((data as CatalogSnapshot).tags)
  )
}

/** Persist to IndexedDB; clear any oversized/legacy sync mirror. */
export async function saveCatalogSnapshot(
  tags: TagSummary[],
  expansions: ExpansionMap,
): Promise<void> {
  // Full catalog must not go through localStorage (quota + main-thread jank).
  clearPersistentSnapshot(CATALOG_SNAPSHOT_KEY)
  try {
    await putCatalogSnapshotIdb(tags, expansions)
  } catch {
    /* IDB quota or private mode */
  }
}

/** Synchronous read from the localStorage mirror only (legacy / tests / tiny snapshots). */
export function loadCatalogSnapshotSync(): CatalogSnapshot | null {
  const snap = loadPersistentSnapshot(CATALOG_SNAPSHOT_KEY, isCatalogSnapshot)
  if (!snap) return null
  return { tags: snap.tags, expansions: snap.expansions ?? {} }
}

/** IndexedDB first (full library), then localStorage mirror. */
export async function loadCatalogSnapshotAsync(): Promise<CatalogSnapshot | null> {
  const fromLocal = loadCatalogSnapshotSync()
  try {
    const idb = await getCatalogSnapshotIdb()
    if (idb?.tags?.length) {
      const fromIdb: CatalogSnapshot = {
        tags: idb.tags,
        expansions: idb.expansions ?? {},
      }
      if (!fromLocal?.tags.length || fromIdb.tags.length >= fromLocal.tags.length) {
        return fromIdb
      }
    }
  } catch {
    /* ignore */
  }
  return fromLocal
}

/** Drop catalog snapshot from browser storage mirrors (IDB cleared separately if needed). */
export function clearCatalogSnapshot(): void {
  clearPersistentSnapshot(CATALOG_SNAPSHOT_KEY)
}

/** @deprecated use loadCatalogSnapshotSync */
export function loadCatalogSnapshot(): CatalogSnapshot | null {
  return loadCatalogSnapshotSync()
}
