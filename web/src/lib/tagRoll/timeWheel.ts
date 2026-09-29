/**
 * Shared piano-roll / bottom-lane wheel → time pan + horizontal zoom.
 */
import { pxToTicks, ticksToPx } from './normalize'
import { TAG_ROLL_CELL_W_MIN, TAG_ROLL_PPQ } from './types'
import { clampCellW, minCellWToFillRoll } from './zoomFill'

export type TagRollTimeWheelInput = {
  scrollX: number
  scrollY: number
  cellW: number
  cellH: number
  lengthTicks: number
  ppq?: number
  viewportWidthPx: number
  /** X within the time track (not the left gutter). */
  localX: number
  /**
   * Lanes have no pitch axis — Shift+wheel pans time (default).
   * Piano roll keeps Shift for pitch pan when false.
   */
  shiftPansTime?: boolean
}

export type TagRollTimeWheelResult = {
  scroll?: { x: number; y: number }
  cellSize?: { cellW: number; cellH: number }
}

function maxScrollX(opts: {
  lengthTicks: number
  cellW: number
  viewportWidthPx: number
  ppq: number
}): number {
  return Math.max(
    0,
    ticksToPx(opts.lengthTicks, opts.cellW, opts.ppq) - opts.viewportWidthPx,
  )
}

function clampScrollX(x: number, maxX: number): number {
  return Math.max(0, Math.min(maxX, x))
}

/**
 * Interpret a wheel event as time pan and/or cellW zoom (tick under cursor stable).
 * Returns null when the event should be ignored (no-op).
 */
export function applyTagRollTimeWheel(
  e: Pick<WheelEvent, 'deltaX' | 'deltaY' | 'shiftKey' | 'altKey'>,
  opts: TagRollTimeWheelInput,
): TagRollTimeWheelResult | null {
  const ppq = opts.ppq ?? TAG_ROLL_PPQ
  const maxX = maxScrollX({
    lengthTicks: opts.lengthTicks,
    cellW: opts.cellW,
    viewportWidthPx: opts.viewportWidthPx,
    ppq,
  })

  // Shift: pitch pan on the roll; time pan on bottom lanes.
  if (e.shiftKey) {
    if (opts.shiftPansTime) {
      const x = clampScrollX(opts.scrollX + e.deltaY, maxX)
      if (x === opts.scrollX) return null
      return { scroll: { x, y: opts.scrollY } }
    }
    return null
  }

  // Trackpad horizontal / Alt+wheel: pan time.
  if (e.altKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
    const x = clampScrollX(opts.scrollX + (e.deltaX || e.deltaY), maxX)
    if (x === opts.scrollX) return null
    return { scroll: { x, y: opts.scrollY } }
  }

  // Default wheel: horizontal zoom (cellW), keep tick under cursor stable.
  const localX = opts.localX
  const tickUnder = pxToTicks(localX + opts.scrollX, opts.cellW, ppq)
  const t = Math.max(-1.25, Math.min(1.25, e.deltaY / 100))
  const factor = Math.exp(-t * 0.028)
  const minW = Math.max(
    TAG_ROLL_CELL_W_MIN,
    minCellWToFillRoll(opts.viewportWidthPx, opts.lengthTicks, ppq),
  )
  const nextW = clampCellW(Math.round(opts.cellW * factor), minW)
  if (nextW === opts.cellW) return null
  const nextMaxX = maxScrollX({
    lengthTicks: opts.lengthTicks,
    cellW: nextW,
    viewportWidthPx: opts.viewportWidthPx,
    ppq,
  })
  const newScrollX = clampScrollX(ticksToPx(tickUnder, nextW, ppq) - localX, nextMaxX)
  return {
    cellSize: { cellW: nextW, cellH: opts.cellH },
    scroll: { x: newScrollX, y: opts.scrollY },
  }
}
