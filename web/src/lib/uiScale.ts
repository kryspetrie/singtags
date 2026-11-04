/**
 * App-wide UI scale via CSS `zoom` on `<html>`.
 *
 * User Display size: 70%–130% in 5% steps (default 100%).
 * Applied as a plain numeric `zoom` (CSS `zoom: calc(...)` is unreliable).
 */

export const UI_SCALE_MIN = 70
export const UI_SCALE_MAX = 130
export const UI_SCALE_STEP = 5
/** User-facing default (preference + Reset). */
export const UI_SCALE_DEFAULT = 100
export const UI_SCALE_STORAGE_KEY = 'singtags.uiScale.v1'

/** Snap to the allowed 5% ladder and clamp to 70–130. */
export function normalizeUiScalePercent(raw: unknown): number {
  const n = typeof raw === 'number' ? raw : Number(raw)
  if (!Number.isFinite(n)) return UI_SCALE_DEFAULT
  const stepped = Math.round(n / UI_SCALE_STEP) * UI_SCALE_STEP
  return Math.min(UI_SCALE_MAX, Math.max(UI_SCALE_MIN, stepped))
}

/** @deprecated Prefer {@link UI_SCALE_DEFAULT}. */
export function defaultUiScaleForViewport(): number {
  return UI_SCALE_DEFAULT
}

/** Read a persisted scale, or `null` if unset / invalid. */
export function readStoredUiScale(): number | null {
  if (typeof localStorage === 'undefined') return null
  try {
    const raw = localStorage.getItem(UI_SCALE_STORAGE_KEY)
    if (raw == null || raw === '') return null
    return normalizeUiScalePercent(Number(raw))
  } catch {
    return null
  }
}

/** Persist scale percent. */
export function writeStoredUiScale(percent: number): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(UI_SCALE_STORAGE_KEY, String(normalizeUiScalePercent(percent)))
  } catch {
    /* ignore */
  }
}

/** Current CSS `zoom` factor on `<html>` (1 = 100%). */
export function uiZoomFactor(): number {
  if (typeof document === 'undefined') return 1
  const inline = Number.parseFloat(document.documentElement.style.zoom || '')
  if (Number.isFinite(inline) && inline > 0) return inline
  const css = Number.parseFloat(
    getComputedStyle(document.documentElement).getPropertyValue('--ui-scale'),
  )
  return Number.isFinite(css) && css > 0 ? css : 1
}

/**
 * Convert a getBoundingClientRect length/offset to layout CSS px.
 * Under `html { zoom }`, GBR + window.scrollY/innerHeight are visual; offset*
 * and CSS layout lengths (incl. virtualizer translates) are layout.
 */
export function visualPxToLayoutPx(visual: number): number {
  const z = uiZoomFactor()
  return z > 0 && z !== 1 ? visual / z : visual
}

/** Convert layout CSS px to visual (GBR / window.scrollY) space under `html` zoom. */
export function layoutPxToVisualPx(layout: number): number {
  const z = uiZoomFactor()
  return z > 0 && z !== 1 ? layout * z : layout
}

/** `window.scrollY` expressed in layout CSS px. */
export function windowScrollYLayout(): number {
  if (typeof window === 'undefined') return 0
  return visualPxToLayoutPx(window.scrollY)
}

/** Scroll the window to a layout-CSS Y (converts for `html` zoom). */
export function scrollWindowToLayoutY(
  layoutY: number,
  behavior: ScrollBehavior = 'auto',
): void {
  if (typeof window === 'undefined') return
  window.scrollTo({ top: layoutPxToVisualPx(layoutY), left: 0, behavior })
}

/** Local point inside an element in layout CSS px (pointer vs getBoundingClientRect). */
export function layoutLocalFromClient(
  clientX: number,
  clientY: number,
  rect: Pick<DOMRect, 'left' | 'top'>,
): { x: number; y: number } {
  return {
    x: visualPxToLayoutPx(clientX - rect.left),
    y: visualPxToLayoutPx(clientY - rect.top),
  }
}

/** Apply user Display size as a plain numeric CSS `zoom`. */
export function applyUiScale(percent: number): void {
  if (typeof document === 'undefined') return
  const p = normalizeUiScalePercent(percent)
  const user = p / 100
  const root = document.documentElement
  root.style.zoom = String(user)
  root.style.setProperty('--ui-scale', String(user))
  root.style.removeProperty('--ui-layout-base')
  root.dataset.uiScale = String(p)
  // Remeasure sticky chrome / virtualizer consumers that cache layout px.
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('resize'))
  }
}

/** Resolve initial user scale: stored value, else 100%. */
export function resolveInitialUiScale(): number {
  migrateLegacyMobileDefaultPreference()
  return readStoredUiScale() ?? UI_SCALE_DEFAULT
}

/**
 * Earlier build stored 95% as a mobile preference default. Clear a lone
 * leftover 95 so users land on the real default (100%).
 */
function migrateLegacyMobileDefaultPreference(): void {
  if (typeof localStorage === 'undefined') return
  try {
    const flag = 'singtags.uiScale.migratedLayoutBase.v1'
    if (localStorage.getItem(flag) === '1') return
    if (localStorage.getItem(UI_SCALE_STORAGE_KEY) === '95') {
      localStorage.removeItem(UI_SCALE_STORAGE_KEY)
    }
    localStorage.setItem(flag, '1')
  } catch {
    /* ignore */
  }
}
