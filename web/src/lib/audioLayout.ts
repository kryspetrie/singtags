/** Helpers for learning-track stereo layout metadata (part-left / mono / …). */

/** Which stereo channel carries the solo voice on a learning track. */
export type PartSide = 'left' | 'right'

/** Classifier for how a stem is panned in the published file. */
export type AudioLayoutKind =
  | 'part_left'
  | 'part_right'
  | 'mono'
  | 'near_mono'
  | 'stereo_other'
  | 'mixed'
  | 'unknown'

/** Per-part layout analysis from the publish pipeline. */
export interface AudioPartLayout {
  kind: AudioLayoutKind | string
  solo_side?: PartSide | null
  channels?: number
  balance?: number
  correlation?: number
  side_mid?: number
}

/** Tag-level audio layout summary (mix policy, recombine flags, ultra tier). */
export interface AudioLayoutSummary {
  parts: string
  mix?: string
  ultra_low?: string
  solo_side?: PartSide | null
  mix_correlation?: number
  mix_disjoint?: boolean
  mix_cache?: 'hosted' | 'reconstruct'
  parts_recombinable?: boolean
  recombine_reason?: string
  analyzed_at?: string
}

/** True when Custom multi-part solo mixing is meaningful for this tag. */
export function supportsCustomSoloMix(
  summary: AudioLayoutSummary | null | undefined,
): boolean {
  if (summary?.parts_recombinable === false) return false
  if (summary?.ultra_low === 'stereo_fallback') return false
  if (!summary?.parts && !summary?.ultra_low) return true
  if (summary.ultra_low === 'mono_solos' || summary.ultra_low === 'mono_downmix') return true
  const parts = summary.parts
  if (parts === 'part_left' || parts === 'part_right') return true
  if (parts === 'mono' || parts === 'near_mono') return false
  return true
}

/**
 * Which file channel holds the solo voice for a learning track.
 * Returns null when unknown (caller should use prefs / default left).
 */
export function soloSideForPart(
  part: string,
  partLayouts: Record<string, AudioPartLayout> | null | undefined,
  summary: AudioLayoutSummary | null | undefined,
): PartSide | null {
  const key = part.toLowerCase()
  const pl = partLayouts?.[key] ?? partLayouts?.[part]
  if (pl?.solo_side === 'left' || pl?.solo_side === 'right') return pl.solo_side
  if (pl?.kind === 'part_left') return 'left'
  if (pl?.kind === 'part_right') return 'right'

  if (summary?.solo_side === 'left' || summary?.solo_side === 'right') {
    return summary.solo_side
  }
  if (summary?.parts === 'part_left') return 'left'
  if (summary?.parts === 'part_right') return 'right'
  return null
}

/** True when metadata specifies solo side (hide manual Part L/R controls). */
export function hasKnownSoloSide(
  part: string,
  partLayouts: Record<string, AudioPartLayout> | null | undefined,
  summary: AudioLayoutSummary | null | undefined,
): boolean {
  return soloSideForPart(part, partLayouts, summary) != null
}
