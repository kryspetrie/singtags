/**
 * How large the optical send stage (QR grid) should be in CSS pixels.
 */

/** Available CSS box for the optical grid (may be rectangular). */
export function fitOpticalStageBox(opts: {
  viewportWidth: number
  viewportHeight: number
  containerWidth: number
  displayScale: number
  fullscreen: boolean
  /** Non-fullscreen preferred size before scale (square). */
  displayPx: number
  /** Measured stage panel (preferred in fullscreen overlay). */
  stageWidth?: number
  stageHeight?: number
  /** Top/bottom chrome when stage box is unknown. */
  chromeReserveY?: number
}): { width: number; height: number } {
  const scale = Math.min(1, Math.max(0.4, opts.displayScale))
  // displayScale is a fill factor: 1 = full stage, 0.4 ≈ smallest useful size.
  const zoom = scale
  if (!opts.fullscreen) {
    const requested = opts.displayPx * (scale * 2)
    const viewportBudget = 0.92 * Math.min(opts.viewportWidth, opts.viewportHeight)
    const containerBudget = Math.max(1, opts.containerWidth)
    const side = Math.max(1, Math.min(viewportBudget, containerBudget, requested))
    return { width: side, height: side }
  }

  let width: number
  let height: number
  if (
    opts.stageWidth != null &&
    opts.stageHeight != null &&
    opts.stageWidth > 32 &&
    opts.stageHeight > 32
  ) {
    // Use the full measured stage (minus a tiny gap so shadows/borders don't clip).
    width = opts.stageWidth * 0.995
    height = opts.stageHeight * 0.995
  } else {
    const chromeY = opts.chromeReserveY ?? 150
    width = opts.viewportWidth * 0.98
    height = Math.max(160, opts.viewportHeight - chromeY) * 0.98
  }
  return {
    width: Math.max(1, width * zoom),
    height: Math.max(1, height * zoom),
  }
}

/** Longest-side budget (backward-compatible helper for square-ish callers). */
export function fitOpticalStageCssPx(opts: Parameters<typeof fitOpticalStageBox>[0]): number {
  const box = fitOpticalStageBox(opts)
  return Math.min(box.width, box.height)
}

/**
 * Map a source pixel grid into a CSS budget, filling as much of the stage as
 * possible while preserving aspect ratio.
 *
 * When `integerUpscale` is true and the symbol would enlarge, prefer whole-module
 * device pixels — but never leave more than ~one module of unused stage; if floor
 * would waste space, fall back to exact (fractional) fill.
 */
export function fitSourceToStage(opts: {
  sourceWidth: number
  sourceHeight: number
  budgetWidth: number
  budgetHeight: number
  devicePixelRatio?: number
  integerUpscale?: boolean
}): { cssWidth: number; cssHeight: number; canvasWidth: number; canvasHeight: number } {
  const sw = Math.max(1, opts.sourceWidth)
  const sh = Math.max(1, opts.sourceHeight)
  const dpr = opts.devicePixelRatio ?? 1
  const fitCss = Math.min(opts.budgetWidth / sw, opts.budgetHeight / sh)
  const cssWidth = sw * fitCss
  const cssHeight = sh * fitCss

  if (opts.integerUpscale && fitCss >= 1) {
    const fitDev = Math.min((opts.budgetWidth * dpr) / sw, (opts.budgetHeight * dpr) / sh)
    const intScale = Math.max(1, Math.floor(fitDev))
    const intCssW = (sw * intScale) / dpr
    const intCssH = (sh * intScale) / dpr
    // If integer scale leaves >8% of the long side unused, prefer exact fill.
    const fillRatio = Math.min(intCssW / cssWidth, intCssH / cssHeight)
    if (fillRatio >= 0.92) {
      return {
        cssWidth: intCssW,
        cssHeight: intCssH,
        canvasWidth: sw * intScale,
        canvasHeight: sh * intScale,
      }
    }
  }

  return {
    cssWidth,
    cssHeight,
    canvasWidth: Math.max(1, Math.round(cssWidth * dpr)),
    canvasHeight: Math.max(1, Math.round(cssHeight * dpr)),
  }
}

/** Resolve the fullscreen overlay stage box when present. */
export function measureOpticalStageBox(canvas: HTMLCanvasElement): {
  stageWidth?: number
  stageHeight?: number
} {
  const panel = canvas.closest('.optical-stream-panel') as HTMLElement | null
  if (!panel) return {}
  const rect = panel.getBoundingClientRect()
  return { stageWidth: rect.width, stageHeight: rect.height }
}
