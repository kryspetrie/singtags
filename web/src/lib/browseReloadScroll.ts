/**
 * Persist Browse window.scrollY across a full page reload (same path).
 * Not used for in-app navigations — those use tag-return / history savedPosition.
 */

export const BROWSE_RELOAD_SCROLL_KEY = 'singtags.browseReload.scroll.v1'

type BrowseReloadScroll = {
  path: string
  scrollY: number
  at: number
}

function viteBase(): string {
  const raw =
    typeof import.meta !== 'undefined' && import.meta.env?.BASE_URL
      ? String(import.meta.env.BASE_URL)
      : '/'
  return raw.replace(/\/$/, '')
}

/** Strip Vite BASE_URL so `/singtags/` and `/` both count as Browse home. */
export function appPathname(pathname: string, baseUrl = viteBase()): string {
  const base = baseUrl.replace(/\/$/, '')
  let path = pathname || '/'
  if (base && (path === base || path.startsWith(`${base}/`))) {
    path = path.slice(base.length) || '/'
  }
  if (!path.startsWith('/')) path = `/${path}`
  return path
}

export function isBrowseHomePath(pathname: string, baseUrl = viteBase()): boolean {
  const path = appPathname(pathname, baseUrl)
  if (path.startsWith('/tag')) return false
  return path === '/' || path === ''
}

function currentPath(): string {
  if (typeof location === 'undefined') return ''
  return `${location.pathname}${location.search}${location.hash}`
}

function isReloadNavigation(): boolean {
  if (typeof performance === 'undefined') return false
  try {
    const nav = performance.getEntriesByType('navigation')[0] as
      | PerformanceNavigationTiming
      | undefined
    if (nav?.type === 'reload') return true
  } catch {
    /* ignore */
  }
  // Legacy fallback
  const legacy = (performance as unknown as { navigation?: { type?: number } }).navigation
  return legacy?.type === 1
}

/** Call from pagehide/beforeunload while Browse is showing. */
export function saveBrowseReloadScroll(scrollY = typeof window !== 'undefined' ? window.scrollY : 0): void {
  if (typeof sessionStorage === 'undefined') return
  if (typeof location === 'undefined') return
  if (!isBrowseHomePath(location.pathname)) return
  const snap: BrowseReloadScroll = {
    path: currentPath(),
    scrollY: Math.max(0, Math.round(scrollY || 0)),
    at: Date.now(),
  }
  try {
    sessionStorage.setItem(BROWSE_RELOAD_SCROLL_KEY, JSON.stringify(snap))
  } catch {
    /* quota */
  }
}

/**
 * If this document load is a reload of Browse, return the saved Y and clear it.
 * Returns null for typed navigations, in-app opens, and stale/mismatched paths.
 */
export function consumeBrowseReloadScroll(): number | null {
  if (typeof sessionStorage === 'undefined') return null
  if (!isReloadNavigation()) return null
  let raw: string | null
  try {
    raw = sessionStorage.getItem(BROWSE_RELOAD_SCROLL_KEY)
    if (raw) sessionStorage.removeItem(BROWSE_RELOAD_SCROLL_KEY)
  } catch {
    return null
  }
  if (!raw) return null
  let snap: BrowseReloadScroll
  try {
    snap = JSON.parse(raw) as BrowseReloadScroll
  } catch {
    return null
  }
  if (!snap || typeof snap.scrollY !== 'number') return null
  if (snap.path !== currentPath()) return null
  if (Date.now() - (snap.at || 0) > 30 * 60_000) return null
  const y = Math.max(0, Math.round(snap.scrollY))
  // Tiny offsets still count as search-top (don't restore into the first section).
  return y <= 24 ? 0 : y
}
