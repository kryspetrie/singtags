/**
 * Shared narrow-viewport media query for long-press select / compact labels.
 * Match before first paint so mobile UI does not flash desktop chrome.
 */

export const NARROW_VIEWPORT_MQ = '(max-width: 639px)'

/** True when the viewport currently matches {@link NARROW_VIEWPORT_MQ}. */
export function readIsNarrowViewport(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false
  }
  try {
    return window.matchMedia(NARROW_VIEWPORT_MQ).matches
  } catch {
    return false
  }
}
