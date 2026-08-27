import {
  getLyricsSnapshotIdb,
  putLyricsSnapshotIdb,
} from '../offline/indexSnapshotDb'

export type LyricsDoc = { id: number; lyrics: string }

export function saveLyricsSnapshot(docs: LyricsDoc[]): void {
  if (!docs.length) return
  void putLyricsSnapshotIdb(docs).catch(() => {
    /* IDB quota or private mode */
  })
}

export async function loadLyricsSnapshotAsync(): Promise<LyricsDoc[] | null> {
  try {
    const rec = await getLyricsSnapshotIdb()
    if (rec?.docs?.length) return rec.docs
  } catch {
    /* ignore */
  }
  return null
}
