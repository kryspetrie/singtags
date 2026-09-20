import {
  chooseSheetFitMode,
  clampSheetPan,
  fitSheetZoomPan,
  sheetZoomMinScale,
  sheetZoomPansNearlyEqual,
  SHEET_ZOOM_MAX,
  type SheetFitMode,
  type SheetZoomPan,
} from '../sheetZoomPan'
import type { SheetFsPageMode } from '../../stores/preferences'
import type { Size2 } from './layout'

export type ChromeInsets = { top: number; bottom: number }

/**
 * Default fit for a new fullscreen session.
 * Paging multi-page shows one page at a time → Fit all.
 * Continuous scroll stacks pages → Fit width (document reading).
 * Single-page still auto-picks width vs all from aspect / pillarboxing.
 */
export function initialFullscreenFitMode(input: {
  pageCount: number
  sheetFsPageMode: SheetFsPageMode
  measured: { viewport: Size2; content: Size2 } | null
  insets: ChromeInsets
}): SheetFitMode {
  if (input.pageCount > 1) {
    return input.sheetFsPageMode === 'scroll' ? 'width' : 'all'
  }
  if (!input.measured) return 'width'
  return chooseSheetFitMode(
    input.measured.viewport,
    input.measured.content,
    undefined,
    input.insets,
  )
}

/** Resolved fit transform after the same clamp path as commitZoomPan. */
export function clampedFitZoomPan(
  mode: SheetFitMode,
  viewport: Size2,
  content: Size2,
  insets: ChromeInsets,
): SheetZoomPan {
  const next = fitSheetZoomPan(mode, viewport, content, { insets })
  const min = sheetZoomMinScale(viewport, content, insets)
  const scale = Math.min(SHEET_ZOOM_MAX, Math.max(min, next.scale))
  return clampSheetPan({ ...next, scale }, viewport, content, insets)
}

export function clampedZoomPan(
  next: SheetZoomPan,
  viewport: Size2,
  content: Size2,
  insets: ChromeInsets,
): SheetZoomPan {
  const min = sheetZoomMinScale(viewport, content, insets)
  const scale = Math.min(SHEET_ZOOM_MAX, Math.max(min, next.scale))
  return clampSheetPan({ ...next, scale }, viewport, content, insets)
}

export function isFitCycleDisabled(current: SheetZoomPan, target: SheetZoomPan | null): boolean {
  if (!target) return true
  return sheetZoomPansNearlyEqual(current, target)
}
