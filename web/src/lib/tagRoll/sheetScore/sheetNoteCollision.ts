/**
 * Horizontal offsets when two voices on one staff collide (unison / second).
 * Stem-up (v1) nudges left; stem-down (v2) nudges right — classic engraving.
 */
import type { StaveNote } from 'vexflow'
import { midiToMusicXmlPitch } from '../midiPitch'
import type { TagRollClefFamily } from '../types'
import type { SheetRhythmEvent } from './rhythmLayout'
import { diatonicIndex } from './staffPitch'
import type { SheetStaffKind } from './types'
import { concertToWrittenMidi } from './writtenPitch'

/** Pixels to separate colliding heads (similar scale to rest nudge). */
export const NOTE_COLLISION_NUDGE_PX = 4.5

function spansOverlap(a0: number, a1: number, b0: number, b1: number): boolean {
  return a0 < b1 && b0 < a1
}

function writtenDegree(
  concertMidi: number,
  clefFamily: TagRollClefFamily,
  staffKind: SheetStaffKind,
  preferFlats: boolean,
): number {
  const written = concertToWrittenMidi(concertMidi, clefFamily, staffKind)
  const { step, octave } = midiToMusicXmlPitch(written, preferFlats)
  return diatonicIndex(step, octave)
}

/**
 * When v1 and v2 sounding notes overlap in time and sit a unison or second
 * apart, shift heads apart. Each note is nudged at most once.
 */
export function applyOpposingVoiceOffsets(opts: {
  v1Events: readonly SheetRhythmEvent[]
  v1Notes: readonly StaveNote[]
  v2Events: readonly SheetRhythmEvent[]
  v2Notes: readonly StaveNote[]
  clefFamily: TagRollClefFamily
  staffKind: SheetStaffKind
  preferFlats: boolean
}): void {
  const { v1Events, v1Notes, v2Events, v2Notes, clefFamily, staffKind, preferFlats } =
    opts
  if (v1Events.length !== v1Notes.length || v2Events.length !== v2Notes.length) return

  const shifted1 = new Set<number>()
  const shifted2 = new Set<number>()

  for (let i = 0; i < v1Events.length; i++) {
    const a = v1Events[i]!
    if (a.concertMidi == null || v1Notes[i]!.isRest()) continue
    const aDeg = writtenDegree(a.concertMidi, clefFamily, staffKind, preferFlats)
    const a0 = a.startTick
    const a1 = a.startTick + a.durationTicks

    for (let j = 0; j < v2Events.length; j++) {
      const b = v2Events[j]!
      if (b.concertMidi == null || v2Notes[j]!.isRest()) continue
      if (!spansOverlap(a0, a1, b.startTick, b.startTick + b.durationTicks)) continue
      const bDeg = writtenDegree(b.concertMidi, clefFamily, staffKind, preferFlats)
      if (Math.abs(aDeg - bDeg) > 1) continue
      if (!shifted1.has(i)) {
        v1Notes[i]!.setXShift(-NOTE_COLLISION_NUDGE_PX)
        shifted1.add(i)
      }
      if (!shifted2.has(j)) {
        v2Notes[j]!.setXShift(NOTE_COLLISION_NUDGE_PX)
        shifted2.add(j)
      }
    }
  }
}
