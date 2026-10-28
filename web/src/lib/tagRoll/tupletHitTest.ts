/**
 * Hit-testing for piano-roll tuplet container bands.
 */
import type { TagRollTuplet } from './types'
import { tupletEndTick } from './tupletContainers'

export type TupletHitEdge = 'start' | 'end' | 'body'

export type TupletHit = {
  tuplet: TagRollTuplet
  edge: TupletHitEdge
}

export type TupletBandRect = {
  id: string
  x: number
  y: number
  w: number
  h: number
}

/** Axis-aligned band covering the full pitch plane for a tuplet span. */
export function tupletBandRect(
  t: Pick<TagRollTuplet, 'id' | 'startTick' | 'spanTicks'>,
  opts: {
    scrollX: number
    bandY: number
    bandH: number
    ticksToPx: (tick: number, cellW: number) => number
    cellW: number
  },
): TupletBandRect {
  const x0 = -opts.scrollX + opts.ticksToPx(t.startTick, opts.cellW)
  const x1 = -opts.scrollX + opts.ticksToPx(tupletEndTick(t), opts.cellW)
  return {
    id: t.id,
    x: x0,
    y: opts.bandY,
    w: Math.max(1, x1 - x0),
    h: Math.max(1, opts.bandH),
  }
}

/**
 * Topmost (later in array) tuplet under (lx, ly) on the given part filter.
 * When `partId` is set, only that part's containers are hittable.
 */
export function hitTupletAtPoint(
  tuplets: readonly TagRollTuplet[],
  lx: number,
  ly: number,
  opts: {
    scrollX: number
    bandY: number
    bandH: number
    ticksToPx: (tick: number, cellW: number) => number
    cellW: number
    handleW?: number
    partId?: string | null
  },
): TupletHit | null {
  const handleW = opts.handleW ?? 8
  if (ly < opts.bandY || ly > opts.bandY + opts.bandH) return null
  for (let i = tuplets.length - 1; i >= 0; i--) {
    const t = tuplets[i]!
    if (opts.partId && t.partId !== opts.partId) continue
    const r = tupletBandRect(t, opts)
    if (lx < r.x || lx > r.x + r.w) continue
    if (Math.abs(lx - r.x) <= handleW) return { tuplet: t, edge: 'start' }
    if (Math.abs(lx - (r.x + r.w)) <= handleW) return { tuplet: t, edge: 'end' }
    return { tuplet: t, edge: 'body' }
  }
  return null
}

/** Snap a drag span onto the binary grid; returns null if span < one snap. */
export function snapTupletDragSpan(
  originTick: number,
  curTick: number,
  snapTicks: number,
): { startTick: number; spanTicks: number } | null {
  const snap = Math.max(1, Math.round(snapTicks))
  const a = Math.round(originTick / snap) * snap
  const b = Math.round(curTick / snap) * snap
  const startTick = Math.max(0, Math.min(a, b))
  const endTick = Math.max(a, b)
  const spanTicks = endTick - startTick
  if (spanTicks < snap) return null
  return { startTick, spanTicks }
}
