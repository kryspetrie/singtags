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
