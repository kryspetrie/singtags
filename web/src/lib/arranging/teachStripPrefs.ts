/**
 * Persist Coach teach-strip expand/collapse.
 */
const COLLAPSED_KEY = 'singtags.labs.arranging.teachStripCollapsed.v1'

export function loadTeachStripCollapsed(fallback = false): boolean {
  try {
    const raw = localStorage.getItem(COLLAPSED_KEY)
    if (raw == null) return fallback
    return raw === '1' || raw === 'true'
  } catch {
    return fallback
  }
}

export function saveTeachStripCollapsed(on: boolean): void {
  try {
    localStorage.setItem(COLLAPSED_KEY, on ? '1' : '0')
  } catch {
    /* ignore */
  }
}
