/**
 * Notes intersecting a timeline tick (for stack audition / playhead).
 */
import type { TagRollNote } from './types'

export function notesAtTick(
  notes: readonly TagRollNote[],
  tick: number,
): TagRollNote[] {
  const t = Math.max(0, tick)
  return notes.filter((n) => n.startTick <= t && t < n.startTick + n.durationTicks)
}

/**
 * Stack audition at a tick: one note per part — the latest-starting (rightmost)
 * when portamento overlaps leave multiple notes spanning the cursor.
 */
export function hearStackNotesAtTick(
  notes: readonly TagRollNote[],
  tick: number,
): TagRollNote[] {
  const at = notesAtTick(notes, tick)
  const bestByPart = new Map<string, TagRollNote>()
  const withoutPart: TagRollNote[] = []
  for (const n of at) {
    if (!n.partId) {
      withoutPart.push(n)
      continue
    }
    const prev = bestByPart.get(n.partId)
    if (
      !prev ||
      n.startTick > prev.startTick ||
      (n.startTick === prev.startTick && n.id.localeCompare(prev.id) > 0)
    ) {
      bestByPart.set(n.partId, n)
    }
  }
  return [...bestByPart.values(), ...withoutPart]
}

/** Chronological notes for one part (lyrics walk). */
export function notesForPartSorted(
  notes: readonly TagRollNote[],
  partId: string,
): TagRollNote[] {
  return notes
    .filter((n) => n.partId === partId)
    .slice()
    .sort((a, b) => a.startTick - b.startTick || a.midi - b.midi)
}

/** Exclusive end tick of the latest note (0 when there are no notes). */
export function lastNoteEndTick(notes: readonly TagRollNote[]): number {
  let end = 0
  for (const n of notes) {
    end = Math.max(end, n.startTick + n.durationTicks)
  }
  return end
}

/**
 * Where transport should stop: end of last note, else full project length.
 * Always clamped to `lengthTicks`.
 */
export function playbackEndTick(
  notes: readonly TagRollNote[],
  lengthTicks: number,
): number {
  const content = lastNoteEndTick(notes)
  const length = Math.max(0, lengthTicks)
  if (content <= 0) return length
  return Math.min(length, content)
}
