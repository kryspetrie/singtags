/**
 * Marquee / multi-select helpers for Tag Studio.
 */
import type { TagRollNote } from './types'

export type ScreenRect = { x: number; y: number; w: number; h: number }

export function normalizeScreenBox(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): ScreenRect {
  const x = Math.min(x0, x1)
  const y = Math.min(y0, y1)
  return { x, y, w: Math.abs(x1 - x0), h: Math.abs(y1 - y0) }
}

export function rectsIntersect(a: ScreenRect, b: ScreenRect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
}

/** Notes whose screen rects intersect the marquee (optional part filter). */
export function noteIdsInMarquee(
  notes: readonly TagRollNote[],
  noteRect: (n: TagRollNote) => ScreenRect,
  box: ScreenRect,
  opts?: { partId?: string | null },
): string[] {
  if (!(box.w > 0) || !(box.h > 0)) return []
  const out: string[] = []
  for (const n of notes) {
    if (opts?.partId && n.partId !== opts.partId) continue
    if (rectsIntersect(noteRect(n), box)) out.push(n.id)
  }
  return out
}

export type ClipboardNote = {
  midi: number
  /** Offset from the earliest selected note’s start (or an explicit section anchor). */
  startTick: number
  durationTicks: number
  partId: string
  lyric?: string
}

/** In-app note clipboard; `spanTicks` preserves inspect-range width for paste. */
export type TagRollNoteClipboard = {
  notes: ClipboardNote[]
  /** Copied section width (left→right bound); paste restores bounds at the playhead. */
  spanTicks?: number
}

/** Normalize selection into clipboard rows anchored at `anchorTick` (default: min start). */
export function notesToClipboard(
  notes: readonly TagRollNote[],
  anchorTick?: number,
): ClipboardNote[] {
  if (!notes.length) return []
  const minTick =
    anchorTick != null ? anchorTick : Math.min(...notes.map((n) => n.startTick))
  return notes.map((n) => ({
    midi: n.midi,
    startTick: n.startTick - minTick,
    durationTicks: n.durationTicks,
    partId: n.partId,
    ...(n.lyric ? { lyric: n.lyric } : {}),
  }))
}

/** Clip a note to the half-open interval `[start, end)`; null if no overlap. */
export function clipNoteToRange(
  n: Pick<TagRollNote, 'startTick' | 'durationTicks' | 'midi' | 'partId' | 'lyric'>,
  start: number,
  end: number,
): Omit<TagRollNote, 'id'> | null {
  const nEnd = n.startTick + n.durationTicks
  if (nEnd <= start || n.startTick >= end) return null
  const clippedStart = Math.max(n.startTick, start)
  const clippedEnd = Math.min(nEnd, end)
  const durationTicks = clippedEnd - clippedStart
  if (durationTicks <= 0) return null
  return {
    partId: n.partId,
    midi: n.midi,
    startTick: clippedStart,
    durationTicks,
    ...(n.lyric && n.startTick >= start && n.startTick < end ? { lyric: n.lyric } : {}),
  }
}

/** Build a section clipboard; notes crossing the bounds are sliced to the interior. */
export function sectionClipboardFromRange(
  notes: readonly TagRollNote[],
  range: { startTick: number; endTick: number },
): TagRollNoteClipboard | null {
  const start = Math.max(0, Math.round(range.startTick))
  const end = Math.max(start + 1, Math.round(range.endTick))
  const clipped: TagRollNote[] = []
  for (const n of notes) {
    const c = clipNoteToRange(n, start, end)
    if (c) clipped.push({ id: n.id, ...c })
  }
  if (!clipped.length) return null
  return {
    notes: notesToClipboard(clipped, start),
    spanTicks: end - start,
  }
}

/**
 * Remove the interior of `[startTick, endTick)` from notes, splitting at the bounds.
 * Left/right remnants outside the range are kept.
 */
export function carveNotesInRange(
  notes: readonly TagRollNote[],
  range: { startTick: number; endTick: number },
  newId: () => string,
): TagRollNote[] {
  const start = Math.max(0, Math.round(range.startTick))
  const end = Math.max(start + 1, Math.round(range.endTick))
  const out: TagRollNote[] = []
  for (const n of notes) {
    const nEnd = n.startTick + n.durationTicks
    if (nEnd <= start || n.startTick >= end) {
      out.push(n)
      continue
    }
    if (n.startTick < start) {
      out.push({ ...n, durationTicks: start - n.startTick })
    }
    if (nEnd > end) {
      const hadLeft = n.startTick < start
      const right: TagRollNote = {
        ...n,
        id: hadLeft ? newId() : n.id,
        startTick: end,
        durationTicks: nEnd - end,
      }
      if (hadLeft) delete right.lyric
      out.push(right)
    }
  }
  return out
}

/** Remap clipboard part ids onto the open project (unknown → active part). */
export function mapClipboardToProjectParts(
  clip: readonly ClipboardNote[],
  partIds: ReadonlySet<string>,
  fallbackPartId: string | undefined,
): ClipboardNote[] {
  return clip.map((c) => ({
    ...c,
    partId: partIds.has(c.partId) ? c.partId : (fallbackPartId ?? c.partId),
  }))
}

/** Place clipboard notes so the earliest starts at `originTick`. */
export function clipboardToNotesAt(
  clip: readonly ClipboardNote[],
  originTick: number,
  newId: () => string,
): Omit<TagRollNote, never>[] {
  return clip.map((c) => ({
    id: newId(),
    partId: c.partId,
    midi: c.midi,
    startTick: Math.max(0, Math.round(originTick + c.startTick)),
    durationTicks: Math.max(1, Math.round(c.durationTicks)),
    ...(c.lyric ? { lyric: c.lyric } : {}),
  }))
}
