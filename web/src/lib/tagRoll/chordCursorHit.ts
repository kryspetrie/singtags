/**
 * Hit-test / resize helpers for the ruler inspect-range vertical band.
 */
export type ChordCursorRange = {
  startTick: number
  endTick: number
}

export type ChordCursorEdge = 'start' | 'end'

const HANDLE_PX = 8
const MIN_WIDTH_TICKS = 1

/** Screen x of start/end edges given scroll and cell width. */
export function chordCursorEdgeXs(
  cursor: ChordCursorRange,
  scrollX: number,
  ticksToPx: (tick: number, cellW: number) => number,
  cellW: number,
): { x0: number; x1: number } {
  const x0 = -scrollX + ticksToPx(cursor.startTick, cellW)
  const x1 = -scrollX + ticksToPx(cursor.endTick, cellW)
  return { x0, x1 }
}

/**
 * Hit left/right remodel handles below the ruler.
 * Returns null when pointer is outside the band vertically or not near an edge.
 */
export function hitChordCursorEdge(
  lx: number,
  ly: number,
  cursor: ChordCursorRange | null | undefined,
  opts: {
    rulerH: number
    cssH: number
    scrollX: number
    cellW: number
    ticksToPx: (tick: number, cellW: number) => number
    handlePx?: number
  },
): ChordCursorEdge | null {
  if (!cursor || cursor.endTick <= cursor.startTick) return null
  if (ly < opts.rulerH || ly > opts.cssH) return null
  const { x0, x1 } = chordCursorEdgeXs(cursor, opts.scrollX, opts.ticksToPx, opts.cellW)
  const h = opts.handlePx ?? HANDLE_PX
  if (Math.abs(lx - x0) <= h) return 'start'
  if (Math.abs(lx - x1) <= h) return 'end'
  return null
}

/** Resize one edge; keeps a positive width. */
export function resizeChordCursor(
  edge: ChordCursorEdge,
  tick: number,
  otherTick: number,
  lengthTicks: number,
  minWidth = MIN_WIDTH_TICKS,
): ChordCursorRange {
  const t = Math.max(0, Math.min(lengthTicks, Math.round(tick)))
  const other = Math.max(0, Math.min(lengthTicks, Math.round(otherTick)))
  if (edge === 'start') {
    const startTick = Math.min(t, other - minWidth)
    return { startTick: Math.max(0, startTick), endTick: other }
  }
  const endTick = Math.max(t, other + minWidth)
  return { startTick: other, endTick: Math.min(lengthTicks, endTick) }
}

/** Normalize a ruler drag from origin → current into a positive tick range. */
export function rangeFromDragTicks(
  originTick: number,
  currentTick: number,
  lengthTicks: number,
  minWidth = MIN_WIDTH_TICKS,
): ChordCursorRange {
  const a = Math.max(0, Math.min(lengthTicks, Math.round(originTick)))
  const b = Math.max(0, Math.min(lengthTicks, Math.round(currentTick)))
  const startTick = Math.min(a, b)
  let endTick = Math.max(a, b)
  if (endTick - startTick < minWidth) {
    endTick = Math.min(lengthTicks, startTick + minWidth)
  }
  return { startTick, endTick: Math.max(startTick + minWidth, endTick) }
}
