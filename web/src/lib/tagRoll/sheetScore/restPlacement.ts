/**
 * Choose VexFlow rest keys so multi-voice rests/notes don’t share a staff line.
 * Whole/half (block) rests stay on the staff — never above/below the lines.
 */
import { midiToMusicXmlPitch } from '../musicxmlExport'
import type { TagRollClefFamily } from '../types'
import { diatonicIndex } from './staffPitch'
import type { SheetStaffKind } from './types'
import { concertToWrittenMidi } from './writtenPitch'

export type RestOccupant = {
  startTick: number
  durationTicks: number
  /** Diatonic staff index of a sounding note, or of another rest’s placement. */
  degree: number
}

export type RestDurationKind = 'whole' | 'half' | 'other'

function spansOverlap(
  a0: number,
  a1: number,
  b0: number,
  b1: number,
): boolean {
  return a0 < b1 && b0 < a1
}

/** Parse Vex key like `e/5` or `bb/4` → diatonic index. */
export function vexKeyToDegree(key: string): number {
  const m = key.trim().match(/^([a-g])(#{1,2}|b{1,2})?\/(-?\d+)$/i)
  if (!m) return 0
  const step = m[1]!.toUpperCase()
  const octave = Number(m[3])
  return diatonicIndex(step, octave)
}

/** Inclusive staff-line degree range (bottom line … top line). */
export function staffDegreeRange(clef: 'treble' | 'bass'): { lo: number; hi: number } {
  if (clef === 'bass') {
    return { lo: diatonicIndex('G', 2), hi: diatonicIndex('A', 3) }
  }
  return { lo: diatonicIndex('E', 4), hi: diatonicIndex('F', 5) }
}

export function isKeyOnStaff(clef: 'treble' | 'bass', key: string): boolean {
  const { lo, hi } = staffDegreeRange(clef)
  const d = vexKeyToDegree(key)
  return d >= lo && d <= hi
}

function noteDegree(
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
 * Candidate rest keys, preferred first — all on the staff.
 * Voice 1 prefers higher staff positions; voice 2 lower.
 * Whole/half defaults: hang from / sit on interior lines.
 */
export function restKeyCandidates(
  clef: 'treble' | 'bass',
  stemUp: boolean,
  kind: RestDurationKind = 'other',
): string[] {
  if (clef === 'bass') {
    // Staff: G2–A3. Whole hangs from D3; half sits on B2.
    if (kind === 'whole') {
      return stemUp
        ? ['d/3', 'f/3', 'b/2', 'a/3', 'c/3', 'g/2', 'e/3']
        : ['d/3', 'b/2', 'c/3', 'g/2', 'f/3', 'a/2', 'e/3']
    }
    if (kind === 'half') {
      return stemUp
        ? ['b/2', 'd/3', 'f/3', 'a/3', 'c/3', 'g/2', 'e/3']
        : ['b/2', 'g/2', 'c/3', 'a/2', 'd/3', 'f/3', 'e/3']
    }
    return stemUp
      ? ['a/3', 'f/3', 'd/3', 'e/3', 'c/3', 'b/2', 'g/2']
      : ['g/2', 'b/2', 'a/2', 'c/3', 'd/3', 'e/3', 'f/3']
  }
  // Treble staff: E4–F5. Whole hangs from D5; half sits on B4.
  if (kind === 'whole') {
    return stemUp
      ? ['d/5', 'b/4', 'c/5', 'e/5', 'a/4', 'f/5', 'g/4']
      : ['d/5', 'b/4', 'a/4', 'g/4', 'c/5', 'e/4', 'f/4']
  }
  if (kind === 'half') {
    return stemUp
      ? ['b/4', 'd/5', 'c/5', 'e/5', 'a/4', 'f/5', 'g/4']
      : ['b/4', 'g/4', 'a/4', 'e/4', 'c/5', 'f/4', 'd/5']
  }
  return stemUp
    ? ['e/5', 'c/5', 'd/5', 'a/4', 'b/4', 'f/5', 'g/4']
    : ['g/4', 'e/4', 'f/4', 'a/4', 'b/4', 'c/5', 'd/5']
}

/** True if a rest on `degree` would collide with an occupied degree. */
function restCollides(degree: number, occupied: ReadonlySet<number>): boolean {
  // Block rests sit on/under a line — keep ±1 clear of noteheads.
  return occupied.has(degree) || occupied.has(degree + 1) || occupied.has(degree - 1)
}

export function restDurationKind(type: string): RestDurationKind {
  if (type === 'whole') return 'whole'
  if (type === 'half') return 'half'
  return 'other'
}

/**
 * Pick a rest key for a span, avoiding other-voice notes/rests that overlap in time.
 * Never leaves the staff; shifts within staff lines/spaces only.
 */
export function pickRestKey(opts: {
  clef: 'treble' | 'bass'
  stemUp: boolean
  startTick: number
  durationTicks: number
  occupants: readonly RestOccupant[]
  durationKind?: RestDurationKind
}): string {
  const end = opts.startTick + Math.max(1, opts.durationTicks)
  const occupied = new Set<number>()
  for (const o of opts.occupants) {
    const oEnd = o.startTick + Math.max(1, o.durationTicks)
    if (!spansOverlap(opts.startTick, end, o.startTick, oEnd)) continue
    occupied.add(o.degree)
  }
  const kind = opts.durationKind ?? 'other'
  const candidates = restKeyCandidates(opts.clef, opts.stemUp, kind).filter((k) =>
    isKeyOnStaff(opts.clef, k),
  )
  for (const key of candidates) {
    if (!restCollides(vexKeyToDegree(key), occupied)) return key
  }
  return candidates[0] ?? (opts.clef === 'bass' ? 'd/3' : 'b/4')
}

/** Sounding-note occupants for rest collision (same staff, other voices). */
export function noteOccupantsFromEvents(
  events: readonly {
    startTick: number
    durationTicks: number
    concertMidi: number | null
    partId: string
  }[],
  excludePartIds: ReadonlySet<string>,
  clefFamily: TagRollClefFamily,
  staffKind: SheetStaffKind,
  preferFlats: boolean,
): RestOccupant[] {
  const out: RestOccupant[] = []
  for (const e of events) {
    if (e.concertMidi == null) continue
    if (excludePartIds.has(e.partId)) continue
    out.push({
      startTick: e.startTick,
      durationTicks: e.durationTicks,
      degree: noteDegree(e.concertMidi, clefFamily, staffKind, preferFlats),
    })
  }
  return out
}
