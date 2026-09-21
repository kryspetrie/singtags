/**
 * Diatonic scale membership from project tonality + major/minor mode.
 */
import type { TonalityMode } from './keySignature'

/** Major scale intervals from root (semitones). */
const MAJOR_INTERVALS = [0, 2, 4, 5, 7, 9, 11] as const
/** Natural minor scale intervals from root (semitones). */
const MINOR_INTERVALS = [0, 2, 3, 5, 7, 8, 10] as const

/** Pitch classes (0–11) in the scale built on `tonality`. */
export function scalePitchClasses(
  tonality: number,
  mode: TonalityMode = 'major',
): Set<number> {
  const root = ((Math.round(tonality) % 12) + 12) % 12
  const intervals = mode === 'minor' ? MINOR_INTERVALS : MAJOR_INTERVALS
  return new Set(intervals.map((i) => (root + i) % 12))
}

/** @deprecated Prefer {@link scalePitchClasses}. */
export function majorScalePitchClasses(tonality: number): Set<number> {
  return scalePitchClasses(tonality, 'major')
}

/** True when midi pitch is in the scale of `tonality` / `mode`. */
export function midiInScale(
  midi: number,
  tonality: number,
  mode: TonalityMode = 'major',
): boolean {
  const pc = ((Math.round(midi) % 12) + 12) % 12
  return scalePitchClasses(tonality, mode).has(pc)
}

/** @deprecated Prefer {@link midiInScale}. */
export function midiInMajorScale(midi: number, tonality: number): boolean {
  return midiInScale(midi, tonality, 'major')
}
