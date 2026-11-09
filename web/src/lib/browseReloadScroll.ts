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

/** Compare Browse URLs ignoring list-position keys (`at` / legacy scroll). */
export function browsePathIgnoringScrollParams(pathWithSearch: string): string {
  try {
    const url = new URL(pathWithSearch, 'http://local.invalid')
    for (const key of ['at', 'sec', 'scroll', 'sy'] as const) {
      url.searchParams.delete(key)
    }
    return `${url.pathname}${url.search}${url.hash}`
  } catch {
    return pathWithSearch
  }
}

function readBrowseReloadSnap(): BrowseReloadScroll | null {
  if (typeof sessionStorage === 'undefined') return null
  let raw: string | null
  try {
    raw = sessionStorage.getItem(BROWSE_RELOAD_SCROLL_KEY)
  } catch {
    return null
  }
  if (!raw) return null
  try {
    const snap = JSON.parse(raw) as BrowseReloadScroll
    if (!snap || typeof snap.scrollY !== 'number') return null
    return snap
  } catch {
    return null
  }
}

/** True when pagehide left a near-zero Y (search chrome was showing). */
export function browseReloadSnapIsSearchTop(maxAgeMs = 60_000): boolean {
  const snap = readBrowseReloadSnap()
  if (!snap) return false
  if (Date.now() - (snap.at || 0) > maxAgeMs) return false
  if (Math.max(0, Math.round(snap.scrollY || 0)) > 24) return false
  if (typeof location === 'undefined') return true
  return (
    browsePathIgnoringScrollParams(snap.path) ===
    browsePathIgnoringScrollParams(currentPath())
  )
}

/**
 * If this document load is a Browse reload, return the saved Y and clear it.
 * Search-top snaps (Y≈0) are also honored for a short window when the browser
 * reports pull-to-refresh as `navigate` instead of `reload`, so a stale `?at=`
 * does not win.
 */
export function consumeBrowseReloadScroll(): number | null {
  if (typeof sessionStorage === 'undefined') return null
  const snap = readBrowseReloadSnap()
  if (!snap) return null
  const age = Date.now() - (snap.at || 0)
  if (age > 30 * 60_000) return null
  if (
    browsePathIgnoringScrollParams(snap.path) !==
    browsePathIgnoringScrollParams(currentPath())
  ) {
    return null
  }
  const y = Math.max(0, Math.round(snap.scrollY || 0))
  const searchTop = y <= 24
  // Mid-list Y only on real reloads. Search-top also accepts fresh PTR "navigate".
  if (!isReloadNavigation() && !(searchTop && age <= 15_000)) return null
  try {
    sessionStorage.removeItem(BROWSE_RELOAD_SCROLL_KEY)
  } catch {
    /* ignore */
  }
  return searchTop ? 0 : y
}
