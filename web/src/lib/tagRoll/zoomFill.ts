/**
 * Horizontal zoom floors so the arrangement always fills the viewport width.
 */
import {
  TAG_ROLL_CELL_W_MAX,
  TAG_ROLL_CELL_W_MIN,
  TAG_ROLL_PPQ,
  TAG_ROLL_SHEET_ZOOM_MAX,
  TAG_ROLL_SHEET_ZOOM_MIN,
} from './types'
import type { TagRollTimeSignature } from './types'
import { measureTicks } from './tempoMap'

/** Must stay in sync with `renderVexScore.ts` layout constants. */
export const SHEET_LEFT_PAD = 16
export const SHEET_RIGHT_PAD = 24
export const SHEET_MEASURE_WIDTH_FACTOR = 1.35
export const SHEET_MEASURE_WIDTH_MIN = 120
/** Extra width on measure 0 for clef + key + time signature (must match renderVexScore). */
export const SHEET_FIRST_MEASURE_CLEF_EXTRA_PX = 108

export function sheetMeasureCount(
  lengthTicks: number,
  timeSignature: TagRollTimeSignature,
  ppq = TAG_ROLL_PPQ,
): number {
  const mLen = measureTicks(timeSignature, ppq)
  const length = Math.max(mLen, lengthTicks)
  return Math.max(1, Math.ceil(length / mLen))
}

export function sheetMeasureWidthPx(
  pxPerBeat: number,
  timeSignature: TagRollTimeSignature,
  ppq = TAG_ROLL_PPQ,
): number {
  const mLen = measureTicks(timeSignature, ppq)
  return Math.max(
    SHEET_MEASURE_WIDTH_MIN,
    Math.round(pxPerBeat * (mLen / ppq) * SHEET_MEASURE_WIDTH_FACTOR),
  )
}

export function sheetScoreContentWidthPx(
  pxPerBeat: number,
  lengthTicks: number,
  timeSignature: TagRollTimeSignature,
  ppq = TAG_ROLL_PPQ,
): number {
  const n = sheetMeasureCount(lengthTicks, timeSignature, ppq)
  const body = sheetMeasureWidthPx(pxPerBeat, timeSignature, ppq)
  const first = body + SHEET_FIRST_MEASURE_CLEF_EXTRA_PX
  return SHEET_LEFT_PAD + first + Math.max(0, n - 1) * body + SHEET_RIGHT_PAD
}

/**
 * Minimum px-per-beat so the sheet's measures span at least `viewportWidth`.
 */
export function minPxPerBeatToFillSheet(
  viewportWidth: number,
  lengthTicks: number,
  timeSignature: TagRollTimeSignature,
  ppq = TAG_ROLL_PPQ,
): number {
  const vp = Math.max(1, Math.floor(viewportWidth))
  const n = sheetMeasureCount(lengthTicks, timeSignature, ppq)
  const mLen = measureTicks(timeSignature, ppq)
  const beatsPerMeasure = mLen / ppq
  // Ignore the 120px floor for the zoom-out limit — that floor only prevents
  // unreadable measures, it must not allow empty side gutters when zooming out.
  const usable = Math.max(
    1,
    vp - SHEET_LEFT_PAD - SHEET_RIGHT_PAD - SHEET_FIRST_MEASURE_CLEF_EXTRA_PX,
  )
  const perMeasure = usable / n
  const raw = perMeasure / (beatsPerMeasure * SHEET_MEASURE_WIDTH_FACTOR)
  return clampSheetZoom(Math.ceil(raw))
}

/** Piano-roll: content width for `lengthTicks` at `cellW` (px per beat). */
export function rollContentWidthPx(
  cellW: number,
  lengthTicks: number,
  ppq = TAG_ROLL_PPQ,
): number {
  return (Math.max(1, lengthTicks) / ppq) * cellW
}

/**
 * Minimum cellW so the piano-roll timeline spans at least `viewportWidth`.
 */
export function minCellWToFillRoll(
  viewportWidth: number,
  lengthTicks: number,
  ppq = TAG_ROLL_PPQ,
): number {
  const vp = Math.max(1, Math.floor(viewportWidth))
  const len = Math.max(1, lengthTicks)
  const raw = (vp * ppq) / len
  return clampCellW(Math.ceil(raw))
}

export function clampCellW(cellW: number, minW = TAG_ROLL_CELL_W_MIN): number {
  const lo = Math.max(TAG_ROLL_CELL_W_MIN, Math.round(minW))
  return Math.max(lo, Math.min(TAG_ROLL_CELL_W_MAX, Math.round(cellW)))
}

export function clampSheetZoom(zoom: number, minZ = TAG_ROLL_SHEET_ZOOM_MIN): number {
  const lo = Math.max(TAG_ROLL_SHEET_ZOOM_MIN, Math.round(minZ))
  return Math.max(lo, Math.min(TAG_ROLL_SHEET_ZOOM_MAX, Math.round(zoom)))
}
