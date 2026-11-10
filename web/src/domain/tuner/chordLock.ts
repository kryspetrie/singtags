/**
 * Chord-lock JI role targets — independent of key-grid temperament.
 * Reuses arranging justIntonation helpers.
 */

import {
  JUST_RATIOS,
  ratioToCentsVsEt,
  roleCents,
} from '../arranging/justIntonation'
import type { BarbershopChordNature, ChordToneRole } from '../arranging/chords'

export { roleCents }

/** Harmonic seventh vs ET tenth (~−31¢) — barbershop V7 hallmark. */
export function harm7CentsVsEt(): number {
  return ratioToCentsVsEt(JUST_RATIOS.harm7, 10)
}

/**
 * Cents error of a sung pitch vs a JI role target.
 * `etCents` = cents vs equal for the nearest note; `role` target is vs ET as well.
 */
export function centsVsChordLockRole(
  etCents: number,
  nature: BarbershopChordNature,
  role: ChordToneRole,
): number {
  return etCents - roleCents(nature, role)
}

/** True when |error| is within the chord-lock green window. */
export function isInTuneChordLock(errorCents: number, windowCents: number): boolean {
  if (!Number.isFinite(errorCents) || !Number.isFinite(windowCents) || windowCents < 0) {
    return false
  }
  return Math.abs(errorCents) <= windowCents
}
