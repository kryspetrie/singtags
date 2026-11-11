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

/** Map sung pitch-class → nature role using root + nature offsets (auto solo lock). */
export function chordRoleForPc(
  pc: number,
  rootPc: number,
  nature: BarbershopChordNature,
): ChordToneRole | null {
  const rel = (((pc - rootPc) % 12) + 12) % 12
  let best: ChordToneRole | null = null
  let bestDist = 99
  for (const [roleStr, offset] of Object.entries(nature.offsets)) {
    if (typeof offset !== 'number') continue
    const role = Number(roleStr) as ChordToneRole
    const dist = Math.min(
      Math.abs(offset - rel),
      12 - Math.abs(offset - rel),
    )
    if (dist < bestDist) {
      bestDist = dist
      best = role
    }
  }
  // Only claim a role when within a semitone of a nature tone.
  return bestDist <= 1 ? best : null
}

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
