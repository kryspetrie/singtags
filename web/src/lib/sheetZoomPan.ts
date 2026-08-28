/** Math helpers for fullscreen sheet zoom / pan (transform: translate + scale). */

/** Allow zooming out past fit-width (and a bit past fit-all). */
export const SHEET_ZOOM_MIN = 0.15
export const SHEET_ZOOM_MAX = 6
export const SHEET_ZOOM_WHEEL_STEP = 0.0018

export type SheetZoomPan = {
  scale: number
  panX: number
  panY: number
}

export type SheetFitMode = 'width' | 'all'

export type SheetSize = { width: number; height: number }

export function clampSheetZoom(scale: number): number {
  return Math.min(SHEET_ZOOM_MAX, Math.max(SHEET_ZOOM_MIN, scale))
}

/** Identity transform — image fills viewport width at 1× (CSS width: 100%). */
export function identitySheetZoomPan(): SheetZoomPan {
  return { scale: 1, panX: 0, panY: 0 }
}

/**
 * Center content of layout size `content` (at scale 1) in the viewport
 * at the given scale.
 */
export function centerSheetZoomPan(
  scale: number,
  viewport: SheetSize,
  content: SheetSize,
): SheetZoomPan {
  const s = clampSheetZoom(scale)
  if (content.width <= 0 || content.height <= 0) {
    return { scale: s, panX: 0, panY: 0 }
  }
  return {
    scale: s,
    panX: (viewport.width - content.width * s) / 2,
    panY: (viewport.height - content.height * s) / 2,
  }
}

/** Scale that fits content width to the viewport (typically ~1 when CSS is width:100%). */
export function fitWidthScale(viewport: SheetSize, content: SheetSize): number {
  if (content.width <= 0) return 1
  return clampSheetZoom(viewport.width / content.width)
}

/** Scale that fits entire content inside the viewport. */
export function fitAllScale(viewport: SheetSize, content: SheetSize): number {
  if (content.width <= 0 || content.height <= 0) return 1
  return clampSheetZoom(
    Math.min(viewport.width / content.width, viewport.height / content.height),
  )
}

export function fitSheetZoomPan(
  mode: SheetFitMode,
  viewport: SheetSize,
  content: SheetSize,
): SheetZoomPan {
  const scale = mode === 'width' ? fitWidthScale(viewport, content) : fitAllScale(viewport, content)
  return centerSheetZoomPan(scale, viewport, content)
}

/**
 * Zoom so the content point under (pointerX, pointerY) in the viewport
 * stays under the pointer. Coordinates are relative to the viewport top-left.
 */
export function zoomSheetAt(
  state: SheetZoomPan,
  pointerX: number,
  pointerY: number,
  nextScale: number,
): SheetZoomPan {
  const scale = clampSheetZoom(nextScale)
  if (scale === state.scale) return state
  const contentX = (pointerX - state.panX) / state.scale
  const contentY = (pointerY - state.panY) / state.scale
  return {
    scale,
    panX: pointerX - contentX * scale,
    panY: pointerY - contentY * scale,
  }
}

/** Wheel deltaY → multiplicative zoom factor (negative delta = zoom in). */
export function wheelZoomFactor(deltaY: number): number {
  return Math.exp(-deltaY * SHEET_ZOOM_WHEEL_STEP)
}

export function panSheet(state: SheetZoomPan, dx: number, dy: number): SheetZoomPan {
  return {
    scale: state.scale,
    panX: state.panX + dx,
    panY: state.panY + dy,
  }
}

export function sheetZoomPanCss(state: SheetZoomPan): string {
  return `translate(${state.panX}px, ${state.panY}px) scale(${state.scale})`
}
