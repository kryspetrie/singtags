/**
 * Remember which list page opened a tag so Back skips prev/next tag history.
 *
 * Capture runs when entering `/tag/:id` from a non-tag route. Tag→tag prev/next
 * should use `router.replace` so the stack stays list → current tag.
 */

import type { RouteLocationNormalized, RouteLocationRaw, Router } from 'vue-router'
import { useRecentStore } from '../stores/recent'
import { navigateBack } from './navigateBack'

/** Snapshot of the list page that led into a tag detail. */
export type TagReturnOrigin = {
  /** Vue route name when known (`home`, `favorites`, …). */
  name: string | null | undefined
  /** Full path including query (filters / collection). */
  fullPath: string
  /** Short label for the back button (“Browse”, “Favorites”, …). */
  label: string
  /** `window.scrollY` when leaving the list (fallback if history scroll is missing). */
  scrollY: number
}

let origin: TagReturnOrigin | null = null

/** Route name → back-button noun. */
export function labelForListRoute(route: Pick<RouteLocationNormalized, 'name' | 'path'>): string {
  const name = typeof route.name === 'string' ? route.name : ''
  switch (name) {
    case 'home':
      return 'Browse'
    case 'favorites':
      return 'Favorites'
    case 'recent':
      return 'Recent'
    case 'queue':
      return 'Queue'
    case 'settings':
      return 'Offline'
    case 'pitch-pipe':
      return 'Pitch Pipe'
    default:
      if (route.path === '/' || route.path === '') return 'Browse'
      if (route.path.startsWith('/favorites')) return 'Favorites'
      if (route.path.startsWith('/recent')) return 'Recent'
      if (route.path.startsWith('/queue')) return 'Queue'
      if (route.path.startsWith('/settings')) return 'Offline'
      if (route.path.startsWith('/pitch-pipe')) return 'Pitch Pipe'
      return 'Browse'
  }
}

/**
 * Remember the current list page when navigating into a tag.
 * No-op for tag→tag (prev/next) so the original list stays the return target.
 */
export function captureTagReturnOrigin(from: RouteLocationNormalized): void {
  if (typeof window === 'undefined') return
  if (from.name === 'tag') return
  // Ignore empty initial navigations (no real list to return to).
  if (!from.name && (from.path === '/' || from.fullPath === '/')) {
    // Still valid: user may land on browse then open a tag; name is `home`.
  }
  if (from.matched.length === 0) return
  origin = {
    name: typeof from.name === 'string' ? from.name : null,
    fullPath: from.fullPath || from.path || '/',
    label: labelForListRoute(from),
    scrollY: window.scrollY || 0,
  }
}

/** Current return origin, if any. */
export function peekTagReturnOrigin(): TagReturnOrigin | null {
  return origin
}

/** Test helper — clear captured origin. */
export function clearTagReturnOrigin(): void {
  origin = null
}

/** Test helper — set origin without a navigation. */
export function setTagReturnOriginForTests(next: TagReturnOrigin | null): void {
  origin = next
}

/**
 * Back control label on tag pages.
 * Practice set always exits to Favorites; otherwise use the captured list name.
 */
export function tagBackLabel(route: { query: Record<string, unknown> }): string {
  if (route.query.set === 'practice') return '← Practice set'
  const o = origin
  return o ? `← ${o.label}` : '← Browse'
}

/**
 * Leave the tag page for the originating list (skipping intermediate tags).
 *
 * Prefers `history.back()` when the previous entry is not another tag (so Vue Router
 * scroll restoration applies). Otherwise pushes the captured list `fullPath` and
 * restores {@link TagReturnOrigin.scrollY}.
 */
export function goTagBack(router: Router, route: { query: Record<string, unknown> }): void {
  if (route.query.set === 'practice') {
    void router.push('/favorites')
    return
  }
  const o = origin
  const back = (window.history.state as { back?: unknown } | null)?.back
  const backPath = typeof back === 'string' ? back : null
  const backIsTag = backPath != null && /(^|\/)tag\//.test(backPath)
  if (backPath != null && !backIsTag) {
    router.back()
    return
  }
  const fallback: RouteLocationRaw = o?.fullPath || '/'
  void router.push(fallback).then(() => {
    const y = o?.scrollY ?? 0
    requestAnimationFrame(() => {
      window.scrollTo({ top: y, left: 0, behavior: 'auto' })
    })
  })
}

/**
 * Call from the router before each navigation:
 * - Capture list origin when entering a tag from elsewhere.
 * - Freeze Recent list order when leaving Recent for a tag (so Back + scroll match).
 * - Clear that freeze when opening Recent from a non-tag route (fresh visit).
 */
export function onTagReturnBeforeEach(
  to: RouteLocationNormalized,
  from: RouteLocationNormalized,
): void {
  if (to.name === 'recent' && from.name !== 'tag') {
    useRecentStore().clearListFreeze()
  }
  if (to.name !== 'tag') return
  if (from.name === 'tag') return
  if (from.name === 'recent') {
    useRecentStore().freezeListForReturn()
  }
  captureTagReturnOrigin(from)
}

/** @deprecated Prefer {@link goTagBack}; kept for callers that only need navigateBack. */
export { navigateBack }
