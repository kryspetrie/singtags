/**
 * Pure helpers for Declared-strip alignment and geometry gestures.
 */
import { hitNoteResizeEdge, resizeNoteByEdge, type NoteResizeEdge } from './noteResize'
import { snapTick } from './snap'
import { pxToTicks, ticksToPx } from './normalize'

export const STRIP_RESIZE_EDGE_PX = 8
export const STRIP_DRAG_SLOP_PX = 4

/** Screen X of a span start — must match TagRollViewport note/ruler math (no track inset). */
export function stripSegX(
  startTick: number,
  scrollX: number,
  cellW: number,
  ppq: number,
): number {
  return -scrollX + ticksToPx(startTick, cellW, ppq)
}

export function stripSegW(
  startTick: number,
  endTick: number,
  cellW: number,
  ppq: number,
): number {
  return Math.max(4, ticksToPx(Math.max(0, endTick - startTick), cellW, ppq))
}

export function stripTickFromLocalX(
  localX: number,
  scrollX: number,
  cellW: number,
  ppq: number,
): number {
  return Math.max(0, pxToTicks(localX + scrollX, cellW, ppq))
}

export function hitStripResizeEdge(
  localX: number,
  segX: number,
  segW: number,
  handlesEnabled = true,
): NoteResizeEdge | null {
  return hitNoteResizeEdge(
    localX,
    0,
    { x: segX, y: 0, w: segW, h: 1 },
    STRIP_RESIZE_EDGE_PX,
    handlesEnabled,
  )
}

export function resizeSketchSpanByEdge(
  edge: NoteResizeEdge,
  deltaTicks: number,
  origin: { startTick: number; endTick: number },
  opts: { snapTicks: number; lengthTicks: number },
): { startTick: number; endTick: number } {
  const r = resizeNoteByEdge(edge, deltaTicks, {
    startTick: origin.startTick,
    durationTicks: Math.max(1, origin.endTick - origin.startTick),
  }, opts)
  return {
    startTick: r.startTick,
    endTick: r.startTick + r.durationTicks,
  }
}

/** Keep duration; shift both ends by snapped delta. */
export function moveSketchSpan(
  deltaTicks: number,
  origin: { startTick: number; endTick: number },
  opts: { snapTicks: number; lengthTicks: number },
): { startTick: number; endTick: number } {
  const dur = Math.max(1, origin.endTick - origin.startTick)
  let start = snapTick(origin.startTick + deltaTicks, opts.snapTicks)
  start = Math.max(0, Math.min(start, opts.lengthTicks - dur))
  return { startTick: start, endTick: start + dur }
}

export type { NoteResizeEdge as StripResizeEdge }
