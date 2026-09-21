/**
 * Just-intonation cents offsets for barbershop lock & ring (playback / MIDI bend).
 * Ratios from Rylander *11 Chords* (knowledge/12-eleven-chords-ji.md).
 */
import type { ChordToneRole } from './chords'
import { BARBERSHOP_CHORDS, leadRoleInChord, type BarbershopChordNature } from './chords'

/** Just ratio → cents deviation from equal temperament for the same chord-tone role. */
export function ratioToCentsVsEt(ratio: number, etSemitones: number): number {
  return 1200 * Math.log2(ratio) - 100 * etSemitones
}

/** Rylander frequency ratios vs root. */
export const JUST_RATIOS: Record<string, number> = {
  root: 1,
  M3: 5 / 4,
  m3_65: 6 / 5,
  m3_76: 7 / 6,
  P5: 3 / 2,
  harm7: 7 / 4,
  M6: 5 / 3,
  M7: 15 / 8,
  M9: 9 / 8,
  A5: 25 / 16,
  d5: 7 / 5,
}

export const JI_CENTS_BY_ROLE: Partial<Record<ChordToneRole, number>> = {
  1: 0,
  3: ratioToCentsVsEt(JUST_RATIOS.M3, 4),
  5: ratioToCentsVsEt(JUST_RATIOS.P5, 7),
  6: ratioToCentsVsEt(JUST_RATIOS.M6, 9),
  7: ratioToCentsVsEt(JUST_RATIOS.harm7, 10),
  9: ratioToCentsVsEt(JUST_RATIOS.M9, 2),
}

export const JI_MINOR_THIRD_CENTS = ratioToCentsVsEt(JUST_RATIOS.m3_65, 3)
export const JI_FLAT_MINOR_THIRD_CENTS = ratioToCentsVsEt(JUST_RATIOS.m3_76, 3)

export function roleCents(nature: BarbershopChordNature, role: ChordToneRole): number {
  if (role === 3) {
    const third = nature.offsets[3]
    if (third === 3) {
      // Flatter 7/6 third when tetrad minor (m6 / m7); 6/5 for plain minor triad
      if (nature.id === 'madd6' || nature.id === 'm7' || nature.id === 'half-dim') {
        return JI_FLAT_MINOR_THIRD_CENTS
      }
      return JI_MINOR_THIRD_CENTS
    }
    return JI_CENTS_BY_ROLE[3] ?? 0
  }
  if (role === 5) {
    const fifth = nature.offsets[5]
    if (fifth === 8) return ratioToCentsVsEt(JUST_RATIOS.A5, 8)
    if (fifth === 6) return ratioToCentsVsEt(JUST_RATIOS.d5, 6)
    return JI_CENTS_BY_ROLE[5] ?? 0
  }
  if (role === 7) {
    const sev = nature.offsets[7]
    if (sev === 11) return ratioToCentsVsEt(JUST_RATIOS.M7, 11)
    if (sev === 9) return ratioToCentsVsEt(JUST_RATIOS.M6, 9) // dim7 "6" as o7 spelling
    return JI_CENTS_BY_ROLE[7] ?? 0
  }
  return JI_CENTS_BY_ROLE[role] ?? 0
}

export type VoiceCents = {
  bass: number
  bari: number
  lead: number
  tenor: number
}

export function justCentsForVoicing(opts: {
  natureId: string
  rootPc: number
  voicing: string
  leadMidi: number
  equalLead?: boolean
}): VoiceCents | null {
  const nature = BARBERSHOP_CHORDS.find((c) => c.id === opts.natureId)
  if (!nature || opts.voicing.length < 4) return null
  const roles = opts.voicing.split('').map((c) => Number(c) as ChordToneRole)
  const [bassR, bariR, leadR, tenorR] = roles
  if (!bassR || !bariR || !leadR || !tenorR) return null

  const detected = leadRoleInChord(nature, opts.rootPc, opts.leadMidi)
  void detected

  return {
    bass: roleCents(nature, bassR),
    bari: roleCents(nature, bariR),
    lead: opts.equalLead ? 0 : roleCents(nature, leadR),
    tenor: roleCents(nature, tenorR),
  }
}

export function centsToPitchBend(cents: number, bendRangeSemitones = 2): number {
  const maxCents = bendRangeSemitones * 100
  const clamped = Math.max(-maxCents, Math.min(maxCents, cents))
  const norm = clamped / maxCents
  return Math.round(8192 + norm * 8191)
}
