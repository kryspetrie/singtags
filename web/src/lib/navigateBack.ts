import type { RouteLocationRaw, Router } from 'vue-router'

/**
 * Prefer history back (preserves scroll via router scrollBehavior + savedPosition).
 * Fall back to an absolute route when there is no in-app history entry (deep link).
 */
export function navigateBack(router: Router, fallback: RouteLocationRaw): void {
  const state = window.history.state as { back?: unknown } | null
  if (state != null && state.back != null) {
    router.back()
    return
  }
  void router.push(fallback)
}
