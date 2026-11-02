/**
 * Infer and attach tuplet brackets (triplets and friends).
 * Detects contiguous equal-length runs that fill a simple 3:2 span.
 */
import type { Factory, StaveNote } from 'vexflow'
import { TAG_ROLL_PPQ } from '../types'
import { mapTicksToDuration, type MappedDuration } from './durationMap'
import type { SheetRhythmEvent } from './rhythmLayout'

export type SheetTupletInfo = {
  /** Shared id for members of one tuplet. */
  id: number
  actualNotes: number
  normalNotes: number
  /** Index within the tuplet (0 … actualNotes-1). */
  index: number
}

const TOL = 2

function near(a: number, b: number): boolean {
  return Math.abs(a - b) <= TOL
}

/**
 * Written note type for each equal member of a tuplet spanning `sumTicks`.
 * Glyph length = sum / normalNotes (e.g. 3:2 in a quarter → eighth; 6:4 → sixteenth).
 */
export function tupletMemberDuration(
  sumTicks: number,
  ppq = TAG_ROLL_PPQ,
  normalNotes = 2,
): MappedDuration {
  const n = Math.max(1, Math.round(normalNotes))
  return mapTicksToDuration(Math.round(sumTicks / n), ppq)
}

/**
 * Written glyph for one (possibly multi-slot) tuplet member.
 * Sounding duration maps through the actual:normal ratio so a 2-slot member of
 * an eighth-triplet is a quarter, and a 2-slot member of a dotted-eighth
 * triplet (dotted-quarter span) is a dotted quarter.
 */
export function tupletMemberWrittenDuration(
  memberDurationTicks: number,
  spanTicks: number,
  actualNotes: number,
  normalNotes: number,
  ppq = TAG_ROLL_PPQ,
): MappedDuration {
  const actual = Math.max(1, Math.round(actualNotes))
  const normal = Math.max(1, Math.round(normalNotes))
  const span = Math.max(1, Math.round(spanTicks))
  const soundUnit = span / actual
  const writtenUnit = span / normal
  const slots = soundUnit > 0 ? memberDurationTicks / soundUnit : 1
  const writtenTicks = Math.max(1, Math.round(slots * writtenUnit))
  return { ...mapTicksToDuration(writtenTicks, ppq), ticks: memberDurationTicks }
}

/**
 * If `durationTicks` is a classic triplet atom whose sounding length is not a
 * binary catalog value (⅓ or ⅔ of a quarter / eighth), return a single written
 * glyph — do not binary-decompose it.
 *
 * Do not match lengths that are already normal catalog values (quarter, half,
 * …): those collide with ordinary mid-bar / syncopation splits.
 */
export function tryTupletMemberAtom(
  durationTicks: number,
  ppq = TAG_ROLL_PPQ,
): MappedDuration | null {
  const dur = Math.max(1, Math.round(durationTicks))
  const third = Math.round(ppq / 3)
  const twoThirds = Math.round((ppq * 2) / 3)
  if (near(dur, third)) {
    // Eighth-triplet atom inside a quarter.
    return { ...mapTicksToDuration(ppq / 2, ppq), ticks: dur }
  }
  if (near(dur, twoThirds)) {
    // Two slots of an eighth-triplet (written quarter) inside a half.
    return { ...mapTicksToDuration(ppq, ppq), ticks: dur }
  }
  // Half-beat triplet atoms (⅓ of an eighth) — sixteenth triplets in an eighth.
  const eighth = ppq / 2
  const eighthThird = Math.round(eighth / 3)
  if (near(dur, eighthThird)) {
    return { ...mapTicksToDuration(ppq / 4, ppq), ticks: dur }
  }
  return null
}

/**
 * Mark triplet (3:2) groups on sounding events of one voice.
 * Mutates `duration` to the written tuplet glyph when inferred.
 */
export function inferTupletsOnEvents(
  events: SheetRhythmEvent[],
  ppq = TAG_ROLL_PPQ,
): void {
  const notes = events
    .map((e, idx) => ({ e, idx }))
    .filter(({ e }) => e.concertMidi != null)
    .sort((a, b) => a.e.startTick - b.e.startTick)

  let nextId = 1
  let i = 0
  while (i < notes.length) {
    const first = notes[i]!
    // Prefer explicit note tuplet metadata when present on the source event.
    if (first.e.tuplet) {
      i++
      continue
    }
    // Try length-3 equal run.
    if (i + 2 >= notes.length) break
    const a = notes[i]!
    const b = notes[i + 1]!
    const c = notes[i + 2]!
    const d0 = a.e.durationTicks
    const d1 = b.e.durationTicks
    const d2 = c.e.durationTicks
    if (!near(d0, d1) || !near(d1, d2)) {
      i++
      continue
    }
    // Contiguous (no gap larger than 1 tick).
    if (
      !near(a.e.startTick + a.e.durationTicks, b.e.startTick) ||
      !near(b.e.startTick + b.e.durationTicks, c.e.startTick)
    ) {
      i++
      continue
    }
    const sum = a.e.durationTicks + b.e.durationTicks + c.e.durationTicks
    // 3:2 occupies an undotted binary span (quarter, half, eighth, …).
    // Dotted parents are ordinary compound / 3/4 rhythms (three quarters in a
    // bar, three eighths in a dotted quarter) — never auto-infer those.
    const parent = mapTicksToDuration(sum, ppq)
    if (!near(parent.ticks, sum) || parent.dots !== 0) {
      i++
      continue
    }
    // Written member value × 2 should equal the parent span (3 in the time of 2).
    const written = tupletMemberDuration(sum, ppq)
    if (!near(written.ticks * 2, sum) && !near(written.ticks * 2, parent.ticks)) {
      i++
      continue
    }
    if (written.dots !== 0) {
      i++
      continue
    }
    const id = nextId++
    const group = [a, b, c]
    for (let g = 0; g < group.length; g++) {
      const { e } = group[g]!
      e.tuplet = {
        id,
        actualNotes: 3,
        normalNotes: 2,
        index: g,
      }
      // Override glyph to the tuplet member value (e.g. eighth), keep tick length.
      e.duration = { ...written, ticks: e.durationTicks }
    }
    i += 3
  }
}

/** Attach VexFlow Tuplet brackets for events that share a tuplet id. */
export function attachSheetTuplets(
  factory: Factory,
  notes: readonly StaveNote[],
  events: readonly SheetRhythmEvent[],
): void {
  if (notes.length !== events.length) return
  const byId = new Map<number, { note: StaveNote; index: number; actual: number; normal: number }[]>()
  for (let i = 0; i < events.length; i++) {
    const t = events[i]?.tuplet
    if (!t || notes[i]!.isRest()) continue
    const list = byId.get(t.id) ?? []
    list.push({
      note: notes[i]!,
      index: t.index,
      actual: t.actualNotes,
      normal: t.normalNotes,
    })
    byId.set(t.id, list)
  }
  for (const members of byId.values()) {
    if (members.length < 2) continue
    members.sort((a, b) => a.index - b.index)
    try {
      factory.Tuplet({
        notes: members.map((m) => m.note),
        options: {
          numNotes: members[0]!.actual,
          notesOccupied: members[0]!.normal,
          bracketed: true,
          location: 1,
        },
      })
    } catch {
      /* ignore malformed tuplet groups */
    }
  }
}
