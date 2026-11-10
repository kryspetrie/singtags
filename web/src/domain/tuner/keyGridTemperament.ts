/**
 * Key-grid temperament targets (equal / just triad / custom).
 * Independent of chord-lock JI role targets.
 */

export type KeyGridTemperament = 'equal' | 'justTriad' | 'custom'

/** Just-intonation offsets (¢) for major-scale degrees relative to equal, tonic = 0. */
export const JUST_TRIAD_OFFSETS_CENTS: Readonly<Record<number, number>> = {
  0: 0, // 1
  2: 3.9, // 2 ≈ 9/8
  4: -13.7, // 3 ≈ 5/4
  5: 2.0, // 4 ≈ 4/3
  7: 2.0, // 5 ≈ 3/2
  9: -15.6, // 6 ≈ 5/3
  11: -31.2, // 7 ≈ 15/8 (leading tone; just major seventh varies — keep mild)
}

/**
 * Cents offset of pitch-class `pc` vs equal temperament for the active key grid.
 * `keyPc` = tonic pitch class 0…11. `customOffsets` is length-12 keyed by PC.
 */
export function keyGridOffsetCents(
  pc: number,
  keyPc: number,
  temperament: KeyGridTemperament,
  customOffsets?: readonly number[],
): number {
  const p = ((Math.round(pc) % 12) + 12) % 12
  const tonic = ((Math.round(keyPc) % 12) + 12) % 12
  if (temperament === 'equal') return 0
  if (temperament === 'custom') {
    const off = customOffsets?.[p]
    return typeof off === 'number' && Number.isFinite(off) ? off : 0
  }
  // justTriad: offsets relative to tonic degree
  const degree = (p - tonic + 12) % 12
  return JUST_TRIAD_OFFSETS_CENTS[degree] ?? 0
}
