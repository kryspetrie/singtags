/** One bounced audio file ready for library ingest. */
export type LibraryIngestTrack = {
  filename: string
  bytes: ArrayBuffer
  mime?: string
}

export type LibraryIngestInput = {
  title: string
  /** Optional linked Local Library entry to update in place. */
  entryId?: string | null
  sheetPng: Blob
  tracks: readonly LibraryIngestTrack[]
  lyricsHint?: string
  notes?: string
}

/** Port: push Tag Studio artifacts into My Library. */
export interface LibraryIngest {
  ingest(input: LibraryIngestInput): Promise<{ entryId: string }>
}
