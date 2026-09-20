/**
 * Diatonic major scale membership from project tonality (pitch-class root).
 */
/** Major scale intervals from root (semitones). */
const MAJOR_INTERVALS = [0, 2, 4, 5, 7, 9, 11] as const

/** Pitch classes (0–11) in the major scale built on `tonality`. */
export function majorScalePitchClasses(tonality: number): Set<number> {
  const root = ((Math.round(tonality) % 12) + 12) % 12
  return new Set(MAJOR_INTERVALS.map((i) => (root + i) % 12))
}

/** True when midi pitch is in the major scale of `tonality`. */
export function midiInMajorScale(midi: number, tonality: number): boolean {
  const pc = ((Math.round(midi) % 12) + 12) % 12
  return majorScalePitchClasses(tonality).has(pc)
}
