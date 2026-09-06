/**
 * Shared PWA navigation-fallback rules (vite.config + tests).
 *
 * Catalog media lives under `/library/…/file.ext`, but Local Library SPA routes
 * are also `/library/:id` and `/library/playlists/:id`. The SW must only deny
 * media *files*, or Ctrl-R on a library song serves plain “Not found” and the
 * installed PWA is stuck until closed.
 */

/** Deny SPA shell for real library media files (not `/library/:id` routes). */
export const LIBRARY_MEDIA_NAV_DENY =
  /^\/library\/.+\.(opus|ogg|mp3|m4a|wav|webp|png|jpe?g|gif|pdf|json|jsonl|bin)(\?.*)?$/i

/** Paths that should receive `index.html` from the service worker. */
export function pwaNavigationGetsSpaShell(pathname: string): boolean {
  if (LIBRARY_MEDIA_NAV_DENY.test(pathname)) return false
  if (/^\/api\//.test(pathname)) return false
  return true
}
