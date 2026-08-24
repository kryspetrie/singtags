export type PartId = string

export interface TagSummary {
  id: number
  title: string | null
  altTitle?: string | null
  arranger: string | null
  key: string | null
  writKey?: string | null
  rating: number | null
  ratingCount?: number | null
  downloads?: number | null
  type: string | null
  collection: string | null
  classic?: string | number | null
  year?: number | null
  parts?: number | null
  hasSheet: boolean
  audioParts: PartId[]
  sheet: string | null
  sheetPages?: string[]
}

export interface TagDetail {
  tag_id: number
  title: string | null
  alt_title?: string | null
  arranger: string | null
  key: string | null
  writ_key?: string | null
  rating?: number | null
  rating_count?: number | null
  download_count?: number | null
  type?: string | null
  collection?: string | null
  classic?: string | number | null
  year?: number | null
  parts_count?: number | null
  lyrics?: string | null
  /** Primary / legacy single sheet path (PDF or image). */
  sheet?: string | null
  /** All original sheet uploads when a tag has multiple PDFs and/or images. */
  sheets?: string[]
  sheet_pages?: string[]
  /** Paths keyed by part id (lead/tenor/… or extra parts). */
  audio: Record<string, string>
  source_folder?: string
}

export interface SampleManifest {
  count: number
  source: string
  tags: TagSummary[]
}

export interface CoreIndex {
  version: number
  tags: TagSummary[]
}

export interface LyricsIndex {
  version: number
  docs: Array<{ id: number; lyrics: string }>
}
