/**
 * Canonical deep-link flag for sheet / optical / local fullscreen entry.
 *
 * Writers use {@link FULLSCREEN_QUERY_FLAG} (`null`) so Vue Router emits bare
 * `?fullscreen` (no `=`). Readers still accept legacy `?fullscreen=1` / `true`.
 */

/** Vue Router serializes `null` as a flag-only query key (`?fullscreen`). */
export const FULLSCREEN_QUERY_FLAG = null

/** True when a single query value means fullscreen-on. */
export function isFullscreenQueryFlag(value: unknown): boolean {
  if (value === undefined) return false
  if (Array.isArray(value)) return value.some(isFullscreenQueryFlag)
  // Bare `?fullscreen` → null (router) or '' (URLSearchParams).
  if (value === null || value === '' || value === true) return true
  if (value === '1' || value === 'true') return true
  return false
}

/** True when a route query asks for fullscreen entry. */
export function hasFullscreenQuery(
  query: Record<string, unknown> | { fullscreen?: unknown },
): boolean {
  return isFullscreenQueryFlag(query.fullscreen)
}

/** Spread into a location query when fullscreen should be on. */
export function fullscreenQuery(
  on: boolean,
): { fullscreen: null } | Record<string, never> {
  return on ? { fullscreen: FULLSCREEN_QUERY_FLAG } : {}
}

/** URLSearchParams / location.search: bare `?fullscreen` or legacy values. */
export function searchParamsHaveFullscreen(search: string | URLSearchParams): boolean {
  try {
    const params = typeof search === 'string' ? new URLSearchParams(search) : search
    if (!params.has('fullscreen')) return false
    return isFullscreenQueryFlag(params.get('fullscreen'))
  } catch {
    return false
  }
}
