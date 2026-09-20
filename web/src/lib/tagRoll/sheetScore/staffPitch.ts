/**
 * Written MIDI → staff position, accidental, ledger lines.
 */
import { midiToMusicXmlPitch } from '../musicxmlExport'
import type { SheetClefKind } from './types'

const STEP_INDEX: Record<string, number> = {
  C: 0,
  D: 1,
  E: 2,
  F: 3,
  G: 4,
  A: 5,
  B: 6,
}

/** Diatonic index: C0=0, D0=1, … B0=6, C1=7, … */
export function diatonicIndex(step: string, octave: number): number {
  const s = STEP_INDEX[step] ?? 0
  return octave * 7 + s
}

/** Bottom staff line diatonic index for a clef (treble E4, bass G2). */
export function clefBottomLineIndex(clef: SheetClefKind): number {
  if (clef === 'bass' || clef === 'bass8va') return diatonicIndex('G', 2)
  return diatonicIndex('E', 4)
}

export type StaffPitchPos = {
  /** Y of notehead center in staff-local coords (0 = top line). */
  yFromTop: number
  /** Diatonic steps down from the top staff line (0 = top line). */
  stepsFromTop: number
  alter: number
  accidental: 'sharp' | 'flat' | 'natural' | null
  /** Ledger line stepsFromTop values that need short lines through the note. */
  ledgerStepsFromTop: number[]
}

/**
 * Place a written MIDI pitch on a staff.
 * `lineGap` is the distance between adjacent staff lines.
 */
export function writtenMidiToStaffPos(
  writtenMidi: number,
  clef: SheetClefKind,
  lineGap: number,
  preferFlats: boolean,
): StaffPitchPos {
  const { step, alter, octave } = midiToMusicXmlPitch(writtenMidi, preferFlats)
  const noteIdx = diatonicIndex(step, octave)
  const bottomIdx = clefBottomLineIndex(clef)
  const topIdx = bottomIdx + 8 // 5 lines = 8 half-spaces from bottom to top
  const stepsFromTop = topIdx - noteIdx
  const yFromTop = stepsFromTop * (lineGap / 2)

  let accidental: StaffPitchPos['accidental'] = null
  if (alter > 0) accidental = 'sharp'
  else if (alter < 0) accidental = 'flat'
  // Naturals: omitted until we track key signature / prior accidentals.

  const ledgerStepsFromTop: number[] = []
  // Above staff: stepsFromTop < 0 (negative = above top line)
  if (stepsFromTop < 0) {
    for (let s = -2; s >= stepsFromTop; s -= 2) ledgerStepsFromTop.push(s)
  }
  // Below staff: stepsFromTop > 8
  if (stepsFromTop > 8) {
    for (let s = 10; s <= stepsFromTop; s += 2) ledgerStepsFromTop.push(s)
  }

  return { yFromTop, stepsFromTop, alter, accidental, ledgerStepsFromTop }
}
