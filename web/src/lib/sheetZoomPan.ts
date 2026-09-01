/** Math helpers for fullscreen sheet zoom / pan (transform: translate + scale). */

/** Absolute floor for zoom (pathological tiny content). Prefer {@link fitAllScale} as the live min. */
export const SHEET_ZOOM_MIN = 0.05
/** Maximum zoom scale for fullscreen sheet view. */
export const SHEET_ZOOM_MAX = 6
/** Exponential wheel sensitivity (multiplier per pixel of deltaY). */
export const SHEET_ZOOM_WHEEL_STEP = 0.0018
/**
 * Under fit-all, if unused viewport width exceeds this fraction, prefer fit-width
 * (tall sheets / extreme pillarboxing).
 */
export const SHEET_FIT_MAX_PILLAR_FRACTION = 0.28

/** Current pan/zoom state for a sheet image (CSS transform inputs). */
export type SheetZoomPan = {
  scale: number
  panX: number
  panY: number
}

/** How to fit sheet content inside the viewport when resetting zoom. */
export type SheetFitMode = 'width' | 'all'

/** Vertical alignment when applying a fit. */
export type SheetFitAlign = 'center' | 'top'

/** Viewport or content dimensions in CSS pixels. */
export type SheetSize = { width: number; height: number }

/** Insets reserved for overlay chrome (safe content band). */
export type SheetInsets = { top: number; bottom: number }

/** Clamp scale to an optional min/max (defaults {@link SHEET_ZOOM_MIN}…{@link SHEET_ZOOM_MAX}). */
export function clampSheetZoom(scale: number, min = SHEET_ZOOM_MIN, max = SHEET_ZOOM_MAX): number {
  return Math.min(max, Math.max(min, scale))
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
  minScale = SHEET_ZOOM_MIN,
): SheetZoomPan {
  const s = clampSheetZoom(scale, minScale)
  if (content.width <= 0 || content.height <= 0) {
    return { scale: s, panX: 0, panY: 0 }
  }
  return {
    scale: s,
    panX: (viewport.width - content.width * s) / 2,
    panY: (viewport.height - content.height * s) / 2,
  }
}

/** Viewport band below/above overlay chrome. */
export function usableSheetViewport(viewport: SheetSize, insets: SheetInsets = { top: 0, bottom: 0 }): SheetSize {
  const top = Math.max(0, insets.top)
  const bottom = Math.max(0, insets.bottom)
  return {
    width: viewport.width,
    height: Math.max(1, viewport.height - top - bottom),
  }
}

/** Scale that fits content width to the viewport (typically ~1 when CSS is width:100%). */
export function fitWidthScale(viewport: SheetSize, content: SheetSize): number {
  if (content.width <= 0) return 1
  return viewport.width / content.width
}

/** Scale that fits entire content inside the viewport. */
export function fitAllScale(viewport: SheetSize, content: SheetSize): number {
  if (content.width <= 0 || content.height <= 0) return 1
  return Math.min(viewport.width / content.width, viewport.height / content.height)
}

/**
 * Pick fit-width vs fit-all for the usable viewport (chrome insets already applied).
 * Prefer fit-all when the page fits (or pillarboxing is mild); otherwise fit-width + vertical pan.
 * When content already fits at width, choose fit-all so we may zoom in (never shrink past width).
 */
export function chooseSheetFitMode(
  viewport: SheetSize,
  content: SheetSize,
  maxPillarFraction = SHEET_FIT_MAX_PILLAR_FRACTION,
  insets: SheetInsets = { top: 0, bottom: 0 },
): SheetFitMode {
  const usable = usableSheetViewport(viewport, insets)
  if (content.width <= 0 || content.height <= 0 || usable.width <= 0 || usable.height <= 0) {
    return 'width'
  }
  const sw = fitWidthScale(usable, content)
  // Fits at full width — fit-all may zoom in if content is short/narrow; never shrink past width.
  if (content.height * sw <= usable.height + 0.5) return 'all'

  const sa = fitAllScale(usable, content)
  const usedW = content.width * sa
  const pillar = 1 - usedW / usable.width
  if (pillar <= maxPillarFraction) return 'all'
  return 'width'
}

/** Live zoom floor: always allow zooming out until the whole page is visible in the usable band. */
export function sheetZoomMinScale(
  viewport: SheetSize,
  content: SheetSize,
  insets: SheetInsets = { top: 0, bottom: 0 },
): number {
  const all = fitAllScale(usableSheetViewport(viewport, insets), content)
  if (!Number.isFinite(all) || all <= 0) return SHEET_ZOOM_MIN
  return Math.max(SHEET_ZOOM_MIN, Math.min(all, SHEET_ZOOM_MAX))
}

/** Compute pan/zoom to fit content by width or entirely within the usable viewport band. */
export function fitSheetZoomPan(
  mode: SheetFitMode,
  viewport: SheetSize,
  content: SheetSize,
  opts?: { align?: SheetFitAlign; minScale?: number; insets?: SheetInsets },
): SheetZoomPan {
  const insets = opts?.insets ?? { top: 0, bottom: 0 }
  const usable = usableSheetViewport(viewport, insets)
  const minScale = opts?.minScale ?? SHEET_ZOOM_MIN
  const raw = mode === 'width' ? fitWidthScale(usable, content) : fitAllScale(usable, content)
  const scale = clampSheetZoom(raw, minScale)
  const align = opts?.align ?? (mode === 'width' ? 'top' : 'center')
  const panX = content.width <= 0 ? 0 : (viewport.width - content.width * scale) / 2
  if (align === 'top') {
    return { scale, panX, panY: Math.max(0, insets.top) }
  }
  // Center within the usable band (below top chrome / above bottom chrome).
  const ch = content.height * scale
  const panY = Math.max(0, insets.top) + (usable.height - ch) / 2
  return { scale, panX, panY }
}

/**
 * Clamp pan so:
 * - content narrower than the viewport stays centered horizontally (no side scroll)
 * - content shorter than the usable band stays vertically centered in that band
 * - oversized content can pan but always covers the usable viewport edges
 */
export function clampSheetPan(
  state: SheetZoomPan,
  viewport: SheetSize,
  content: SheetSize,
  insets: SheetInsets = { top: 0, bottom: 0 },
): SheetZoomPan {
  const s = state.scale
  const cw = content.width * s
  const ch = content.height * s
  const top = Math.max(0, insets.top)
  const bottom = Math.max(0, insets.bottom)
  const usableTop = top
  const usableBottom = Math.max(usableTop + 1, viewport.height - bottom)
  const usableH = usableBottom - usableTop

  let panX = state.panX
  let panY = state.panY

  if (cw <= viewport.width + 0.5) {
    panX = (viewport.width - cw) / 2
  } else {
    const minX = viewport.width - cw
    const maxX = 0
    panX = Math.min(maxX, Math.max(minX, panX))
  }

  if (ch <= usableH + 0.5) {
    panY = usableTop + (usableH - ch) / 2
  } else {
    const minY = usableBottom - ch
    const maxY = usableTop
    panY = Math.min(maxY, Math.max(minY, panY))
  }

  return { scale: s, panX, panY }
}

/** True when two zoom/pan states would look the same on screen. */
export function sheetZoomPansNearlyEqual(
  a: SheetZoomPan,
  b: SheetZoomPan,
  opts?: { scaleEps?: number; panEps?: number },
): boolean {
  const scaleEps = opts?.scaleEps ?? 0.002
  const panEps = opts?.panEps ?? 0.75
  return (
    Math.abs(a.scale - b.scale) <= scaleEps &&
    Math.abs(a.panX - b.panX) <= panEps &&
    Math.abs(a.panY - b.panY) <= panEps
  )
}

/**
 * Keep the content point that was at the viewport center still centered after a
 * resize. Content layout size may change with viewport width (width:100%); map
 * via normalized content coordinates. Scale (relative to layout width) is kept.
 */
export function preserveSheetCenter(
  state: SheetZoomPan,
  prevViewport: SheetSize,
  prevContent: SheetSize,
  nextViewport: SheetSize,
  nextContent: SheetSize,
): SheetZoomPan {
  if (
    prevContent.width <= 0 ||
    prevContent.height <= 0 ||
    nextContent.width <= 0 ||
    nextContent.height <= 0
  ) {
    return state
  }
  const cx = (prevViewport.width / 2 - state.panX) / state.scale
  const cy = (prevViewport.height / 2 - state.panY) / state.scale
  const nx = (cx / prevContent.width) * nextContent.width
  const ny = (cy / prevContent.height) * nextContent.height
  return {
    scale: state.scale,
    panX: nextViewport.width / 2 - nx * state.scale,
    panY: nextViewport.height / 2 - ny * state.scale,
  }
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
  minScale = SHEET_ZOOM_MIN,
  maxScale = SHEET_ZOOM_MAX,
): SheetZoomPan {
  const scale = clampSheetZoom(nextScale, minScale, maxScale)
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

/** Apply a drag delta to pan offsets (scale unchanged). */
export function panSheet(state: SheetZoomPan, dx: number, dy: number): SheetZoomPan {
  return {
    scale: state.scale,
    panX: state.panX + dx,
    panY: state.panY + dy,
  }
}

/** CSS `transform` string for a {@link SheetZoomPan} (translate then scale). */
export function sheetZoomPanCss(state: SheetZoomPan): string {
  return `translate(${state.panX}px, ${state.panY}px) scale(${state.scale})`
}
