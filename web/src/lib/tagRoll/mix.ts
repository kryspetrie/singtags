/**
 * Tag Studio part mix defaults and audible-gate helpers.
 * Pan −1 = full L, +1 = full R (equal-power when rendered).
 */
import type { TagRollPart, TagRollPartMix } from './types'

/** User-requested defaults: T 60%L, Lead 20%L, Bass 20%R, Bari 60%R. */
export const TAG_ROLL_DEFAULT_PAN: Record<string, number> = {
  tenor: -0.6,
  lead: -0.2,
  bass: 0.2,
  bari: 0.6,
  baritone: 0.6,
}

export const TAG_ROLL_DEFAULT_VOLUME = 0.82
export const TAG_ROLL_LEAD_VOLUME = 1

export function defaultPanForPartName(name: string): number {
  return TAG_ROLL_DEFAULT_PAN[name.trim().toLowerCase()] ?? 0
}

export function defaultVolumeForPartName(name: string): number {
  return name.trim().toLowerCase() === 'lead' ? TAG_ROLL_LEAD_VOLUME : TAG_ROLL_DEFAULT_VOLUME
}

export function defaultMixForPart(part: Pick<TagRollPart, 'id' | 'name'>): TagRollPartMix {
  return {
    partId: part.id,
    volume: defaultVolumeForPartName(part.name),
    pan: defaultPanForPartName(part.name),
    mute: false,
    solo: false,
  }
}

/** Ensure every part has a mix row; drop orphans; keep user edits. */
export function syncProjectMix(
  parts: readonly TagRollPart[],
  mix: readonly TagRollPartMix[] | undefined | null,
): TagRollPartMix[] {
  const byId = new Map((mix ?? []).map((m) => [m.partId, m]))
  return parts.map((p) => {
    const prev = byId.get(p.id)
    if (!prev) return defaultMixForPart(p)
    return {
      partId: p.id,
      volume: clamp(prev.volume, 0, 1.5),
      pan: clamp(prev.pan, -1, 1),
      mute: Boolean(prev.mute),
      solo: Boolean(prev.solo),
    }
  })
}

function clamp(n: number, lo: number, hi: number): number {
  if (!Number.isFinite(n)) return lo
  return Math.max(lo, Math.min(hi, n))
}

/** Solo wins: if any part is soloed, only soloed (and unmuted) parts sound. */
export function isPartAudible(
  partId: string,
  mix: readonly TagRollPartMix[],
): boolean {
  const row = mix.find((m) => m.partId === partId)
  if (!row) return true
  if (row.mute) return false
  const anySolo = mix.some((m) => m.solo)
  if (anySolo) return row.solo
  return true
}

export function mixForPart(
  partId: string,
  mix: readonly TagRollPartMix[],
): { volume: number; pan: number } {
  const row = mix.find((m) => m.partId === partId)
  return {
    volume: row ? clamp(row.volume, 0, 1.5) : TAG_ROLL_DEFAULT_VOLUME,
    pan: row ? clamp(row.pan, -1, 1) : 0,
  }
}
