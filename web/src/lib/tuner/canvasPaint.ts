/**
 * Shared DPR canvas setup + theme color reads for tuner visualizations.
 */

export type TunerCanvasTheme = {
  accent: string
  text: string
  muted: string
  border: string
  surface: string
  bg: string
  danger: string
  onAccent: string
}

export function readTunerCanvasTheme(el: Element): TunerCanvasTheme {
  const s = getComputedStyle(el)
  const v = (name: string, fallback: string) => s.getPropertyValue(name).trim() || fallback
  return {
    accent: v('--accent', '#2a7'),
    text: v('--text', '#222'),
    muted: v('--muted', '#888'),
    border: v('--border', '#888'),
    surface: v('--surface', '#f4f4f4'),
    bg: v('--bg', '#fff'),
    danger: v('--danger', '#b33'),
    onAccent: v('--on-accent', '#fff'),
  }
}

export type SizeTunerCanvasOpts = {
  /** Cap devicePixelRatio (default 2). */
  maxDpr?: number
  /**
   * Soft pixel budget for the backing store (cssW×cssH×dpr²).
   * On large fullscreen / high-DPR phones, DPR is reduced so paints stay cheap.
   */
  maxPixels?: number
}

/**
 * Size canvas backing store to the laid-out CSS box (DPR-aware).
 * Only mutates width/height attributes when the pixel size changes, so we don't
 * clear the buffer / reset context every frame (which makes text look soft).
 * CSS must set display size (`width`/`height`); attributes are bitmap-only.
 *
 * Third arg may be a number (legacy maxDpr) or {@link SizeTunerCanvasOpts}.
 */
export function sizeTunerCanvas(
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  opts: number | SizeTunerCanvasOpts = 2,
): { cssW: number; cssH: number; dpr: number } {
  const maxDpr = typeof opts === 'number' ? opts : (opts.maxDpr ?? 2)
  const maxPixels = typeof opts === 'number' ? undefined : opts.maxPixels
  const rect = canvas.getBoundingClientRect()
  const cssW = Math.max(1, Math.round(rect.width || canvas.clientWidth || 320))
  const cssH = Math.max(1, Math.round(rect.height || canvas.clientHeight || 180))
  const view = typeof globalThis !== 'undefined' ? (globalThis as { devicePixelRatio?: number }) : undefined
  let dpr = Math.min(maxDpr, view?.devicePixelRatio || 1)
  if (maxPixels != null && cssW > 0 && cssH > 0) {
    const area = cssW * cssH
    const capped = Math.sqrt(maxPixels / area)
    if (Number.isFinite(capped) && capped < dpr) {
      dpr = Math.max(1, capped)
    }
  }
  const w = Math.max(1, Math.round(cssW * dpr))
  const h = Math.max(1, Math.round(cssH * dpr))
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w
    canvas.height = h
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  return { cssW, cssH, dpr }
}

const paintRafs = new WeakMap<object, number>()

/** Coalesce rapid paint requests (spectrum hops, ResizeObserver) to one rAF. */
export function scheduleTunerPaint(key: object, paint: () => void): void {
  if (paintRafs.has(key)) return
  const raf = globalThis.requestAnimationFrame?.bind(globalThis)
  if (!raf) {
    paint()
    return
  }
  const id = raf(() => {
    paintRafs.delete(key)
    paint()
  })
  paintRafs.set(key, id)
}

export function cancelScheduledTunerPaint(key: object): void {
  const id = paintRafs.get(key)
  if (id == null) return
  globalThis.cancelAnimationFrame?.(id)
  paintRafs.delete(key)
}
