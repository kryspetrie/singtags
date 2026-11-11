/**
 * Solo Tune target cents — equal / key-grid / optional chord-lock JI role.
 */

import { BARBERSHOP_CHORDS } from '../arranging/chords'
import type { ChordToneRole } from '../arranging/chords'
import { centsVsChordLockRole, chordRoleForPc } from './chordLock'
import { keyGridOffsetCents, type KeyGridTemperament } from './keyGridTemperament'
import { noteFromHz, type NoteFromHz } from './noteFromHz'

export type TuneTargetOpts = {
  a4Hz: number
  keyPc: number
  temperament: KeyGridTemperament
  customOffsetsCents?: readonly number[]
  chordLockEnabled?: boolean
  chordNatureId?: string | null
  /** Root PC for auto role mapping when chord lock is on. Defaults to keyPc. */
  chordRootPc?: number | null
  /** Role to score against; omit/`auto` → nearest nature tone from sung PC. */
  chordRole?: ChordToneRole | 'auto'
  /**
   * Hysteresis-stable MIDI for note naming / cents reference.
   * When set, cents are vs this MIDI (not nearest), so the needle doesn't flip at boundaries.
   */
  displayMidi?: number | null
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
  const nearest = noteFromHz(hz, opts.a4Hz)
  if (!nearest) return null

  const displayMidi =
    typeof opts.displayMidi === 'number' && Number.isFinite(opts.displayMidi)
      ? Math.round(opts.displayMidi)
      : nearest.midi
  const note = noteFromDisplayMidi(hz, displayMidi, opts.a4Hz) ?? nearest
  const pc = ((note.midi % 12) + 12) % 12

  if (opts.chordLockEnabled && opts.chordNatureId) {
    const nature = BARBERSHOP_CHORDS.find((c) => c.id === opts.chordNatureId)
    if (nature) {
      const rootPc =
        typeof opts.chordRootPc === 'number' && Number.isFinite(opts.chordRootPc)
          ? ((opts.chordRootPc % 12) + 12) % 12
          : opts.keyPc
      const role =
        opts.chordRole === 'auto' || opts.chordRole == null
          ? chordRoleForPc(pc, rootPc, nature)
          : opts.chordRole
      if (role != null) {
        return {
          ...note,
          pc,
          errorCents: centsVsChordLockRole(note.cents, nature, role),
          targetKind: 'chordLock',
        }
      }
      // Sung PC is not a nature tone — fall through to key-grid (honest, not false-green root).
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

/** Note + cents vs a sticky MIDI (display hysteresis). */
function noteFromDisplayMidi(hz: number, midi: number, a4Hz: number): NoteFromHz | null {
  if (!(hz > 0) || !(a4Hz > 0) || midi < 0 || midi > 127) return null
  const targetHz = a4Hz * 2 ** ((midi - 69) / 12)
  const cents = 1200 * Math.log2(hz / targetHz)
  const named = noteFromHz(targetHz, a4Hz)
  if (!named) return null
  return { ...named, midi, cents, targetHz }
}
