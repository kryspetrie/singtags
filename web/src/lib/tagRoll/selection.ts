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
  /** Offset from the earliest selected note’s start. */
  startTick: number
  durationTicks: number
  partId: string
  lyric?: string
}

/** Normalize selection into clipboard rows anchored at min startTick = 0. */
export function notesToClipboard(notes: readonly TagRollNote[]): ClipboardNote[] {
  if (!notes.length) return []
  const minTick = Math.min(...notes.map((n) => n.startTick))
  return notes.map((n) => ({
    midi: n.midi,
    startTick: n.startTick - minTick,
    durationTicks: n.durationTicks,
    partId: n.partId,
    ...(n.lyric ? { lyric: n.lyric } : {}),
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
