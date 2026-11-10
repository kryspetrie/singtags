/**
 * Solo Tune target cents — equal / key-grid / optional chord-lock JI role.
 */

import { BARBERSHOP_CHORDS } from '../arranging/chords'
import type { ChordToneRole } from '../arranging/chords'
import { centsVsChordLockRole } from './chordLock'
import { keyGridOffsetCents, type KeyGridTemperament } from './keyGridTemperament'
import { noteFromHz, type NoteFromHz } from './noteFromHz'

export type TuneTargetOpts = {
  a4Hz: number
  keyPc: number
  temperament: KeyGridTemperament
  customOffsetsCents?: readonly number[]
  chordLockEnabled?: boolean
  chordNatureId?: string | null
  /** Role to score the solo note against when chord lock is on. Default 1 (root). */
  chordRole?: ChordToneRole
}

export type TuneReading = NoteFromHz & {
  /** Cents vs the active target (key-grid or chord-lock role). */
  errorCents: number
  /** Pitch class 0…11. */
  pc: number
  /** Which target layer produced errorCents. */
  targetKind: 'equal' | 'keyGrid' | 'chordLock'
}

/** Map hz → note + error vs active target layer. */
export function tuneReadingFromHz(hz: number, opts: TuneTargetOpts): TuneReading | null {
  const note = noteFromHz(hz, opts.a4Hz)
  if (!note) return null
  const pc = ((note.midi % 12) + 12) % 12

  if (opts.chordLockEnabled && opts.chordNatureId) {
    const nature = BARBERSHOP_CHORDS.find((c) => c.id === opts.chordNatureId)
    if (nature) {
      const role = opts.chordRole ?? 1
      return {
        ...note,
        pc,
        errorCents: centsVsChordLockRole(note.cents, nature, role),
        targetKind: 'chordLock',
      }
    }
  }

  const grid = keyGridOffsetCents(pc, opts.keyPc, opts.temperament, opts.customOffsetsCents)
  const targetKind =
    opts.temperament === 'equal' && !(grid !== 0) ? 'equal' : 'keyGrid'
  return {
    ...note,
    pc,
    errorCents: note.cents - grid,
    targetKind,
  }
}
