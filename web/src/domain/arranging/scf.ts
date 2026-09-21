/**
 * Primary / secondary chord families (Approach Two).
 * @see knowledge/02-chord-vocabulary.md
 */

export type ScfGroup = 1 | 2 | 3 | 4 | 5 | 6

/** Semitone offset of SCF group root relative to primary root X. */
export function scfRootOffset(group: ScfGroup): number | number[] {
  switch (group) {
    case 1:
      return 7 // P5 above X
    case 2:
      return 0 // dim7 containing X (root ambiguous; use X as label)
    case 3:
      return 11 // ½-step below X
    case 4:
      return 1 // ½-step above X
    case 5:
      return 6 // tritone
    case 6:
      return [5, 8] // P4 above (IV) and ♭VI (M3 below = +8 from X? Wait: ♭VI is 8 semitones above X)
    default:
      return 0
  }
}

export function scfRoots(primaryRoot: number, group: ScfGroup): number[] {
  const off = scfRootOffset(group)
  if (Array.isArray(off)) {
    return off.map((o) => (((primaryRoot + o) % 12) + 12) % 12)
  }
  return [(((primaryRoot + off) % 12) + 12) % 12]
}

/** Preferred natures for PCF on primary root. */
export const PCF_NATURE_PRIORITY = [
  'seventh',
  'major',
  'minor',
  'ninth',
  'sixth',
  'add9',
  'm7',
  'half-dim',
  'aug',
  'maj7',
  'dim',
] as const

/** Preferred natures per SCF group. */
export const SCF_NATURES: Record<ScfGroup, readonly string[]> = {
  1: ['seventh', 'ninth', 'm7', 'minor', 'major', 'half-dim'],
  2: ['dim7'],
  3: ['seventh', 'ninth'],
  4: ['seventh', 'ninth'],
  5: ['seventh', 'ninth'],
  6: ['seventh', 'major', 'ninth'],
}
