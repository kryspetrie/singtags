/**
 * Tiny sync catalog slice for instant Browse first paint.
 *
 * Full catalog (~6MB) lives in IndexedDB; this keeps ~one viewport of
 * collection-sorted tags in localStorage so reload can show real cards
 * before IDB returns.
 */

import type { TagSummary } from '../types/tag'
import { sortBrowseTags } from '../search/browse'
import {
  clearPersistentSnapshot,
  loadPersistentSnapshot,
  savePersistentSnapshot,
} from './persistentSnapshot'

/** localStorage key for the first-paint tag slice. */
export const CATALOG_FIRST_PAINT_KEY = 'singtags.catalogFirstPaint.v1'

/** Enough rows for ~2–3 mobile viewports of collection-sorted browse. */
export const CATALOG_FIRST_PAINT_COUNT = 96

/** Payload written after each successful full catalog apply. */
export interface CatalogFirstPaint {
  v: 1
  tags: TagSummary[]
  /** Full catalog size (for the count line while the slice is showing). */
  totalCount: number
  savedAt: string
}

function isFirstPaint(data: unknown): data is CatalogFirstPaint {
  return (
    typeof data === 'object' &&
    data != null &&
    (data as CatalogFirstPaint).v === 1 &&
    Array.isArray((data as CatalogFirstPaint).tags) &&
    typeof (data as CatalogFirstPaint).totalCount === 'number'
  )
}

/** Persist the top of default (collection) browse order. */
export function saveCatalogFirstPaint(allTags: readonly TagSummary[]): void {
  if (!allTags.length) {
    clearPersistentSnapshot(CATALOG_FIRST_PAINT_KEY)
    return
  }
  const sorted = sortBrowseTags([...allTags], 'collection', false)
  const payload: CatalogFirstPaint = {
    v: 1,
    tags: sorted.slice(0, CATALOG_FIRST_PAINT_COUNT),
    totalCount: allTags.length,
    savedAt: new Date().toISOString(),
  }
  savePersistentSnapshot(CATALOG_FIRST_PAINT_KEY, payload)
}

/** Sync read — null when missing/invalid. */
export function loadCatalogFirstPaint(): CatalogFirstPaint | null {
  return loadPersistentSnapshot(CATALOG_FIRST_PAINT_KEY, isFirstPaint)
}

export function clearCatalogFirstPaint(): void {
  clearPersistentSnapshot(CATALOG_FIRST_PAINT_KEY)
}

/**
 * True when the URL looks like default Browse (no search/filter chips).
 * First-paint would flash the wrong list if we ignored an active query.
 */
export function browseUrlLooksDefault(search = typeof location !== 'undefined' ? location.search : ''): boolean {
  const q = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
  const keys = ['q', 'ft', 'sheet', 'audio', 'cache', 'rated', 'ymin', 'ymax', 'arr', 'type', 'col', 'tl', 'sort', 'rev']
  return !keys.some((k) => {
    const v = q.get(k)
    return v != null && v !== ''
  })
}
