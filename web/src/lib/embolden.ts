/**
 * App-wide “Embolden text” preference for low-vision readability.
 * Applied via `data-embolden` on `<html>` + CSS in tokens.css.
 */

export const EMBOLDEN_STORAGE_KEY = 'singtags.embolden.v1'

export function readStoredEmbolden(): boolean | null {
  if (typeof localStorage === 'undefined') return null
  try {
    const raw = localStorage.getItem(EMBOLDEN_STORAGE_KEY)
    if (raw == null || raw === '') return null
    return raw === '1'
  } catch {
    return null
  }
}

export function writeStoredEmbolden(on: boolean): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(EMBOLDEN_STORAGE_KEY, on ? '1' : '0')
  } catch {
    /* ignore */
  }
}

export function resolveInitialEmbolden(): boolean {
  return readStoredEmbolden() ?? false
}

/** Apply embolden flag before first paint (and whenever the pref changes). */
export function applyEmbolden(on: boolean): void {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  if (on) root.setAttribute('data-embolden', '1')
  else root.removeAttribute('data-embolden')
}
