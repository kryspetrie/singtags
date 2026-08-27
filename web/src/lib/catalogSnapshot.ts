import type { ExpansionMap } from '../search/expansions'
import type { TagSummary } from '../types/tag'
import {
  getCatalogSnapshotIdb,
  putCatalogSnapshotIdb,
} from '../offline/indexSnapshotDb'
import {
  clearPersistentSnapshot,
  loadPersistentSnapshot,
  savePersistentSnapshot,
} from './persistentSnapshot'

export const CATALOG_SNAPSHOT_KEY = 'singtags.catalogSnapshot.v1'

export interface CatalogSnapshot {
  tags: TagSummary[]
  expansions: ExpansionMap
}

function isCatalogSnapshot(data: unknown): data is CatalogSnapshot {
  return (
    typeof data === 'object' &&
    data != null &&
    Array.isArray((data as CatalogSnapshot).tags)
  )
}

/** Fast mirror for sync boot (small catalogs). Primary store is IndexedDB. */
export function saveCatalogSnapshot(tags: TagSummary[], expansions: ExpansionMap): void {
  savePersistentSnapshot(CATALOG_SNAPSHOT_KEY, { tags, expansions })
  void putCatalogSnapshotIdb(tags, expansions).catch(() => {
    /* IDB quota or private mode */
  })
}

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

export function clearCatalogSnapshot(): void {
  clearPersistentSnapshot(CATALOG_SNAPSHOT_KEY)
}

/** @deprecated use loadCatalogSnapshotSync */
export function loadCatalogSnapshot(): CatalogSnapshot | null {
  return loadCatalogSnapshotSync()
}
