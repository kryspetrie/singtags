export type PartId = string

/** Published audio quality ladder (see audio-storage-cache ADR). */
export type AudioTierId =
  | 'original'
  | 'playback'
  | 'ultra_solo'
  | 'ultra_downmix'
  | 'ultra_stereo'
  | 'ultra_mix'

export interface AudioPartLayout {
  kind: string
  solo_side?: 'left' | 'right' | null
  channels?: number
  balance?: number
  correlation?: number
  side_mid?: number
}

export interface AudioLayoutSummary {
  parts: string
  mix?: string
  ultra_low?: string
  solo_side?: 'left' | 'right' | null
  /** Best mono xcorr between mix and voice parts (0–1). */
  mix_correlation?: number
  /** Mix track unrelated to learning parts — cache hosted ultra_mix. */
  mix_disjoint?: boolean
  /** `hosted` = ship mix in offline pack; `reconstruct` = build from solos. */
  mix_cache?: 'hosted' | 'reconstruct'
  /**
   * False when voice parts must not be mono-solo extracted / client-reconstructed
   * (piano stems, untrusted alignment, etc.). Prefer hosted ultra_stereo.
   */
  parts_recombinable?: boolean
  /** Why parts_recombinable is false (mirror diagnostic). */
  recombine_reason?: string
  analyzed_at?: string
}

export interface AudioAlignEntry {
  ref_part?: string
  offset_ms: number
  corr?: number
  zero_corr?: number
  trusted?: boolean
  /** Delay baked into Opus tiers (≥50 ms only); 0 means unused. */
  applied_ms?: number
  method?: string
  min_offset_ms?: number
  analyzed_at?: string
}

export interface AudioAlignSummary {
  status: string
  ref_part?: string
  min_offset_ms?: number
  trusted_parts?: string[]
  applied_ms?: Record<string, number>
  analyzed_at?: string
}

export interface AudioTiersSummary {
  ultra_policy?: string
  mix_only?: boolean
  mix_disjoint?: boolean
  mix_cache?: 'hosted' | 'reconstruct'
  parts_recombinable?: boolean
  recombine_reason?: string
  playback_kbps?: number
  align_status?: string
  align_applied_ms?: Record<string, number>
  align_min_offset_ms?: number
  encoded_at?: string
}

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
  year?: number | string | null
  parts?: number | null
  hasSheet: boolean
  audioParts: PartId[]
  /** Non-original tier kinds present in sample/publish media. */
  audioTiers?: AudioTierId[]
  ultraLow?: string | null
  sheet: string | null
  sheetPreview?: string | null
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
  year?: number | string | null
  parts_count?: number | null
  lyrics?: string | null
  /** Primary / legacy single sheet path (PDF or image). */
  sheet?: string | null
  /** All original sheet uploads when a tag has multiple PDFs and/or images. */
  sheets?: string[]
  /** Compact 2-bit dither WebP for offline cache + default display. */
  sheet_preview?: string | null
  sheet_pages?: string[]
  /**
   * Original-quality paths keyed by part id (legacy / download).
   * Prefer ``audio_tiers[part].original`` when present.
   */
  audio: Record<string, string>
  /**
   * Per-part publish tiers. Keys are tier ids (`original`, `playback`,
   * `ultra_solo`, …); values are catalog-relative media paths.
   */
  audio_tiers?: Record<string, Partial<Record<AudioTierId, string>>> | null
  audio_tiers_summary?: AudioTiersSummary | null
  /** Tag-level stereo layout (part-left / mono / …) from mirror analysis. */
  audio_layout_summary?: AudioLayoutSummary | null
  /** Per-part layout keyed by part id (lead/bari/…). */
  audio_layouts?: Record<string, AudioPartLayout> | null
  /** Per-part accompaniment timing vs Lead (offsets already baked when applied_ms ≠ 0). */
  audio_align?: Record<string, AudioAlignEntry> | null
  audio_align_summary?: AudioAlignSummary | null
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
