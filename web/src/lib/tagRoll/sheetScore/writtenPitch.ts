/**
 * Concert MIDI ↔ written MIDI for barbershop octave-transposing clefs.
 */
import type { TagRollClefFamily } from '../types'
import type { SheetStaffKind } from './types'

/**
 * Convert concert pitch to the MIDI value placed on the staff (written).
 * TTBB upper sounds an octave lower than written → write concert+12.
 * SSAA lower sounds an octave higher than written → write concert-12.
 */
export function concertToWrittenMidi(
  concertMidi: number,
  clefFamily: TagRollClefFamily,
  staffKind: SheetStaffKind,
): number {
  const m = Math.round(concertMidi)
  if (clefFamily === 'ttbb' && staffKind === 'upper') return m + 12
  if (clefFamily === 'ssaa' && staffKind === 'lower') return m - 12
  return m
}

/** Inverse of concertToWrittenMidi (for future hit-testing). */
export function writtenToConcertMidi(
  writtenMidi: number,
  clefFamily: TagRollClefFamily,
  staffKind: SheetStaffKind,
): number {
  const m = Math.round(writtenMidi)
  if (clefFamily === 'ttbb' && staffKind === 'upper') return m - 12
  if (clefFamily === 'ssaa' && staffKind === 'lower') return m + 12
  return m
}
