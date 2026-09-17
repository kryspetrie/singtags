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
