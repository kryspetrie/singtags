/**
 * Piano-roll note duration handles: left (start) and right (end) edges.
 */
import { snapTick } from './snap'

export type NoteResizeEdge = 'start' | 'end'

export type NoteResizeOrigin = {
  startTick: number
  durationTicks: number
}

export type NoteResizeResult = {
  startTick: number
  durationTicks: number
}

/**
 * Which duration handle is under the pointer, if any.
 * Narrow notes split at the midpoint so both edges stay usable.
 */
export function hitNoteResizeEdge(
  lx: number,
  ly: number,
  rect: { x: number; y: number; w: number; h: number },
  edgePx: number,
  handlesEnabled: boolean,
): NoteResizeEdge | null {
  if (!handlesEnabled || edgePx <= 0) return null
  if (ly < rect.y || ly >= rect.y + rect.h) return null
  if (lx < rect.x || lx >= rect.x + rect.w) return null
  if (rect.w <= edgePx * 2) {
    return lx < rect.x + rect.w / 2 ? 'start' : 'end'
  }
  if (lx < rect.x + edgePx) return 'start'
  if (lx >= rect.x + rect.w - edgePx) return 'end'
  return null
}

/**
 * Apply a horizontal drag (in ticks from gesture origin) to start or end.
 * End-edge keeps start fixed; start-edge keeps the release tick fixed.
 */
export function resizeNoteByEdge(
  edge: NoteResizeEdge,
  deltaTicks: number,
  origin: NoteResizeOrigin,
  opts: { snapTicks: number; lengthTicks: number },
): NoteResizeResult {
  const minDur = Math.max(1, opts.snapTicks)
  const endTick = origin.startTick + origin.durationTicks
  if (edge === 'end') {
    const raw = origin.durationTicks + deltaTicks
    const snapped = Math.max(minDur, snapTick(raw, opts.snapTicks))
    const maxDur = Math.max(minDur, opts.lengthTicks - origin.startTick)
    return {
      startTick: origin.startTick,
      durationTicks: Math.min(maxDur, snapped),
    }
  }
  const rawStart = origin.startTick + deltaTicks
  let startTick = snapTick(rawStart, opts.snapTicks)
  startTick = Math.max(0, Math.min(startTick, endTick - minDur))
  return {
    startTick,
    durationTicks: Math.max(minDur, endTick - startTick),
  }
}
