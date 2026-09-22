/**
 * Contest / learning chord allowlists (Rylander 11 + BHS extended).
 * @see knowledge/12-eleven-chords-ji.md
 */
import type { ContestProfile } from './types'

export type { ContestProfile }
export { DEFAULT_CONTEST_PROFILE } from './types'

/** Rylander / Sweet Adelines 11. */
export const CHORDS_SAI11 = [
  'major',
  'seventh',
  'maj7',
  'add9',
  'sixth',
  'ninth',
  'minor',
  'madd6',
  'm7',
  'dim7',
  'aug',
] as const

/** 1980 manual extras commonly in BHS practice tables. */
export const CHORDS_BHS_EXTRA = ['half-dim', 'dim'] as const

export const CHORDS_BHS_EXTENDED = [...CHORDS_SAI11, ...CHORDS_BHS_EXTRA] as const

export function allowlistForProfile(profile: ContestProfile): readonly string[] {
  switch (profile) {
    case 'sai11':
      return CHORDS_SAI11
    case 'bhs_extended':
      return CHORDS_BHS_EXTENDED
    case 'learning':
      return CHORDS_BHS_EXTENDED
  }
}

export function isNatureAllowed(profile: ContestProfile, natureId: string): boolean {
  return allowlistForProfile(profile).includes(natureId)
}

/** Lower = more ringing / more common — aligns with knowledge/12 LCD / RING ranking. */
export const RING_TIER: Record<string, number> = {
  major: 1,
  seventh: 1,
  minor: 2,
  madd6: 2,
  sixth: 3,
  add9: 3,
  ninth: 3,
  m7: 4,
  maj7: 4,
  'half-dim': 5,
  dim7: 5,
  dim: 5,
  aug: 6,
}

export function ringTier(natureId: string): number {
  return RING_TIER[natureId] ?? 7
}
