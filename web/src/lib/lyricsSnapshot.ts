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
export function saveLyricsSnapshot(docs: LyricsDoc[]): void {
  if (!docs.length) return
  void putLyricsSnapshotIdb(docs).catch(() => {
    /* IDB quota or private mode */
  })
}

/** Load lyrics docs from IndexedDB, or null when none stored. */
export async function loadLyricsSnapshotAsync(): Promise<LyricsDoc[] | null> {
  try {
    const rec = await getLyricsSnapshotIdb()
    if (rec?.docs?.length) return rec.docs
  } catch {
    /* ignore */
  }
  return null
}
