/**
 * Choose VexFlow rest keys so multi-voice rests clear the other voice.
 * Prefer the same-voice “lane” (nearby notes); when crowded, escape above
 * (stem-up) or below (stem-down) the other voice — never through it.
 */
import { midiToMusicXmlPitch } from '../midiPitch'
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

const DEGREE_STEPS = ['c', 'd', 'e', 'f', 'g', 'a', 'b'] as const

/** Vex key for a diatonic degree (natural spelling). */
export function degreeToVexKey(degree: number): string {
  const octave = Math.floor(degree / 7)
  const step = DEGREE_STEPS[((degree % 7) + 7) % 7]!
  return `${step}/${octave}`
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

export function noteDegreeFromConcert(
  concertMidi: number,
  clefFamily: TagRollClefFamily,
  staffKind: SheetStaffKind,
  preferFlats: boolean,
): number {
  const written = concertToWrittenMidi(concertMidi, clefFamily, staffKind)
  const { step, octave } = midiToMusicXmlPitch(written, preferFlats)
  return diatonicIndex(step, octave)
}

/** Default rest degree for a voice / duration (engraving convention). */
function defaultRestDegree(
  clef: 'treble' | 'bass',
  stemUp: boolean,
  kind: RestDurationKind,
): number {
  if (clef === 'bass') {
    if (kind === 'whole') return diatonicIndex('D', 3)
    if (kind === 'half') return diatonicIndex('B', 2)
    return stemUp ? diatonicIndex('A', 3) : diatonicIndex('G', 2)
  }
  if (kind === 'whole') return diatonicIndex('D', 5)
  if (kind === 'half') return diatonicIndex('B', 4)
  return stemUp ? diatonicIndex('E', 5) : diatonicIndex('G', 4)
}

/**
 * Candidate rest keys around a preferred degree (same-voice lane / escape).
 * Includes on-staff slots plus ledger overflow in the voice’s direction.
 */
export function restKeyCandidates(
  clef: 'treble' | 'bass',
  stemUp: boolean,
  kind: RestDurationKind = 'other',
  preferDegree?: number,
): string[] {
  const { lo, hi } = staffDegreeRange(clef)
  const def =
    preferDegree != null && Number.isFinite(preferDegree)
      ? Math.round(preferDegree)
      : defaultRestDegree(clef, stemUp, kind)
  const onStaff: number[] = []
  for (let d = lo; d <= hi; d++) onStaff.push(d)
  onStaff.sort((a, b) => {
    const da = Math.abs(a - def)
    const db = Math.abs(b - def)
    if (da !== db) return da - db
    return stemUp ? b - a : a - b
  })

  // Enough ledger room to clear a high/low other-voice note.
  const overflowSteps = kind === 'other' ? 6 : 5
  const above: number[] = []
  const below: number[] = []
  for (let i = 1; i <= overflowSteps; i++) {
    above.push(hi + i)
    below.push(lo - i)
  }
  const overflow = stemUp ? [...above, ...below] : [...below, ...above]
  // Prefer near `def` first (may be off-staff for high tenor lanes).
  const all = [...onStaff, ...overflow]
  all.sort((a, b) => {
    const da = Math.abs(a - def)
    const db = Math.abs(b - def)
    if (da !== db) return da - db
    return stemUp ? b - a : a - b
  })
  return all.map(degreeToVexKey)
}

function restClearance(kind: RestDurationKind): number {
  if (kind === 'whole' || kind === 'half') return 1
  return 2
}

function restCollisionScore(
  degree: number,
  occupied: ReadonlySet<number>,
  clearance: number,
): number {
  let score = 0
  for (const o of occupied) {
    const dist = Math.abs(o - degree)
    if (dist <= clearance) score += clearance - dist + 1
  }
  return score
}

export function restDurationKind(type: string): RestDurationKind {
  if (type === 'whole') return 'whole'
  if (type === 'half') return 'half'
  return 'other'
}

/** Slight horizontal nudge when a rest still shares a column with a notehead. */
export const REST_X_NUDGE_PX = 3.5

export type RestPlacement = {
  key: string
  /** Pixels; negative = left. Applied via StaveNote.setXShift. */
  xShift: number
}

type RestPickOpts = {
  clef: 'treble' | 'bass'
  stemUp: boolean
  startTick: number
  durationTicks: number
  occupants: readonly RestOccupant[]
  durationKind?: RestDurationKind
  /**
   * Preferred staff degree from nearby same-voice notes (tenor lane, etc.).
   * Combined with escape-above/below the other voice.
   */
  preferDegree?: number
}

/**
 * Nearest sounding same-voice degree before/after a rest (for lane alignment).
 */
export function nearbySameVoiceDegree(
  events: readonly {
    startTick: number
    durationTicks: number
    concertMidi: number | null
  }[],
  restStart: number,
  restDuration: number,
  clefFamily: TagRollClefFamily,
  staffKind: SheetStaffKind,
  preferFlats: boolean,
): number | undefined {
  const restEnd = restStart + Math.max(1, restDuration)
  let best: { dist: number; degree: number } | null = null
  for (const e of events) {
    if (e.concertMidi == null) continue
    const eEnd = e.startTick + Math.max(1, e.durationTicks)
    // Skip notes that overlap the rest span (shouldn't happen in mono voice).
    if (spansOverlap(restStart, restEnd, e.startTick, eEnd)) continue
    const dist =
      eEnd <= restStart
        ? restStart - eEnd
        : e.startTick >= restEnd
          ? e.startTick - restEnd
          : 0
    const degree = noteDegreeFromConcert(
      e.concertMidi,
      clefFamily,
      staffKind,
      preferFlats,
    )
    if (!best || dist < best.dist) best = { dist, degree }
  }
  return best?.degree
}

/**
 * Pick rest staff position + optional L/R nudge.
 * Escapes above other-voice notes for stem-up (tenor), below for stem-down.
 */
export function pickRestPlacement(opts: RestPickOpts): RestPlacement {
  const end = opts.startTick + Math.max(1, opts.durationTicks)
  const occupied = new Set<number>()
  for (const o of opts.occupants) {
    const oEnd = o.startTick + Math.max(1, o.durationTicks)
    if (!spansOverlap(opts.startTick, end, o.startTick, oEnd)) continue
    occupied.add(o.degree)
  }
  const kind = opts.durationKind ?? 'other'
  const clearance = restClearance(kind)
  const fallbackDef = defaultRestDegree(opts.clef, opts.stemUp, kind)

  let prefer = opts.preferDegree ?? fallbackDef
  if (occupied.size) {
    let hi = -Infinity
    let lo = Infinity
    for (const o of occupied) {
      if (o > hi) hi = o
      if (o < lo) lo = o
    }
    // Stem-up (tenor): stay at/above the other voice — never drop under the lead.
    // Stem-down (lead): stay at/below.
    const escape = opts.stemUp ? hi + clearance + 1 : lo - clearance - 1
    prefer = opts.stemUp ? Math.max(prefer, escape) : Math.min(prefer, escape)
  }

  const candidates = restKeyCandidates(opts.clef, opts.stemUp, kind, prefer)
  const fallback = candidates[0] ?? (opts.clef === 'bass' ? 'd/3' : 'b/4')
  const closestToPrefer = (): string => {
    let best = fallback
    let bestDist = Number.POSITIVE_INFINITY
    for (const key of candidates) {
      const dist = Math.abs(vexKeyToDegree(key) - prefer)
      if (dist < bestDist) {
        bestDist = dist
        best = key
      }
    }
    return best
  }
  if (!occupied.size) return { key: closestToPrefer(), xShift: 0 }

  let bestKey = fallback
  let bestScore = Number.POSITIVE_INFINITY
  let bestDist = Number.POSITIVE_INFINITY
  let bestDir = -Infinity
  for (const key of candidates) {
    const deg = vexKeyToDegree(key)
    const score = restCollisionScore(deg, occupied, clearance)
    const dist = Math.abs(deg - prefer)
    const dir = opts.stemUp ? deg : -deg
    // Clear first, then near preferred lane, then further in escape direction.
    const better =
      score < bestScore ||
      (score === bestScore && dist < bestDist) ||
      (score === bestScore && dist === bestDist && dir > bestDir)
    if (!better) continue
    bestScore = score
    bestKey = key
    bestDist = dist
    bestDir = dir
  }

  const deg = vexKeyToDegree(bestKey)
  let minDist = Number.POSITIVE_INFINITY
  for (const o of occupied) minDist = Math.min(minDist, Math.abs(o - deg))
  const needX = bestScore > 0 || minDist <= clearance + 1
  const xShift = needX
    ? opts.stemUp
      ? -REST_X_NUDGE_PX
      : REST_X_NUDGE_PX
    : 0
  return { key: bestKey, xShift }
}

/** Staff-key only (tests / callers that ignore horizontal nudge). */
export function pickRestKey(opts: RestPickOpts): string {
  return pickRestPlacement(opts).key
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
      degree: noteDegreeFromConcert(e.concertMidi, clefFamily, staffKind, preferFlats),
    })
  }
  return out
}
