/**
 * Navigate Tag Roll note selection with arrow keys (same-part L/R, stack U/D).
 */
import type { TagRollNote } from './types'

function noteEnd(n: TagRollNote): number {
  return n.startTick + n.durationTicks
}

/** Notes that overlap a tick window (stack mates). */
export function notesOverlappingTick(
  notes: readonly TagRollNote[],
  tick: number,
): TagRollNote[] {
  return notes.filter((n) => n.startTick <= tick && tick < noteEnd(n))
}

/** Previous / next note on the same part (by start, then midi). */
export function neighborNoteSamePart(
  notes: readonly TagRollNote[],
  currentId: string,
  dir: -1 | 1,
): TagRollNote | null {
  const cur = notes.find((n) => n.id === currentId)
  if (!cur) return null
  const same = notes
    .filter((n) => n.partId === cur.partId)
    .sort((a, b) => a.startTick - b.startTick || a.midi - b.midi || a.id.localeCompare(b.id))
  const i = same.findIndex((n) => n.id === currentId)
  if (i < 0) return null
  return same[i + dir] ?? null
}

/**
 * Note above (higher midi) or below (lower midi) in the vertical stack at the
 * current note’s start tick. Null when nothing sits in that direction.
 */
export function neighborNoteInStack(
  notes: readonly TagRollNote[],
  currentId: string,
  dir: 'up' | 'down',
): TagRollNote | null {
  const cur = notes.find((n) => n.id === currentId)
  if (!cur) return null
  const stack = notesOverlappingTick(notes, cur.startTick).sort(
    (a, b) => a.midi - b.midi || a.id.localeCompare(b.id),
  )
  const i = stack.findIndex((n) => n.id === currentId)
  if (i < 0) return null
  if (dir === 'up') return stack[i + 1] ?? null
  return stack[i - 1] ?? null
}
