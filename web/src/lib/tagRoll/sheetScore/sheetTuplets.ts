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

/** Written note type for each member of a 3:2 tuplet spanning `sumTicks`. */
export function tupletMemberDuration(sumTicks: number, ppq = TAG_ROLL_PPQ): MappedDuration {
  // Three eighths in a quarter: sum=ppq, each glyph = eighth = ppq/2 = sum/2.
  return mapTicksToDuration(Math.round(sumTicks / 2), ppq)
}

/**
 * If `durationTicks` is a classic triplet atom (⅓ or ⅔ of a quarter), return a
 * single mapped duration with the written glyph — do not binary-decompose it.
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
    // Quarter-triplet atom inside a half.
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
    // 3:2 occupies a binary span that is 2/3 of the sum… sum should equal a
    // catalog duration (quarter, half, dotted quarter, etc.).
    const parent = mapTicksToDuration(sum, ppq)
    if (!near(parent.ticks, sum)) {
      i++
      continue
    }
    // Each member is ~ parent/3 and parent is divisible-ish by the 3:2 story:
    // parent ticks == time of 2 written notes of member type.
    const written = tupletMemberDuration(sum, ppq)
    if (!near(written.ticks * 2, sum) && !near(written.ticks * 2, parent.ticks)) {
      // Still accept if each slice is ~sum/3
      if (!near(d0 * 3, sum)) {
        i++
        continue
      }
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
