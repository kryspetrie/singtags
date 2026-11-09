/**
 * Lyrics full-text index snapshot (IndexedDB only).
 * Populated when FTS lyrics data is fetched for search.
 */

import {
  getLyricsSnapshotIdb,
  putLyricsSnapshotIdb,
} from '../offline/indexSnapshotDb'

/** One tag's lyrics document for the search engine. */
export type LyricsDoc = { id: number; lyrics: string }

/** Persist lyrics docs to IndexedDB (no-op when empty). */
export function saveLyricsSnapshot(docs: LyricsDoc[], sourceHash?: string | null): void {
  if (!docs.length) return
  void putLyricsSnapshotIdb(docs, sourceHash).catch(() => {
    /* IDB quota or private mode */
  })
}

/** Lyrics docs plus the published-file hash, or null when none stored. */
export async function loadLyricsSnapshotMeta(): Promise<{
  docs: LyricsDoc[]
  sourceHash: string | null
} | null> {
  try {
    const rec = await getLyricsSnapshotIdb()
    if (rec?.docs?.length) {
      return { docs: rec.docs, sourceHash: rec.sourceHash ?? null }
    }
  } catch {
    /* ignore */
  }
  return null
}

/** Load lyrics docs from IndexedDB, or null when none stored. */
export async function loadLyricsSnapshotAsync(): Promise<LyricsDoc[] | null> {
  const meta = await loadLyricsSnapshotMeta()
  return meta?.docs ?? null
}
