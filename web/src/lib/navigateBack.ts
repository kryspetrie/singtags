/**
 * Router back navigation with deep-link fallback.
 * Prefers `history.back()` so scroll restoration applies; uses `fallback` when there is no in-app history.
 */

import type { RouteLocationRaw, Router } from 'vue-router'

export function navigateBack(router: Router, fallback: RouteLocationRaw): void {
  const state = window.history.state as { back?: unknown } | null
  if (state != null && state.back != null) {
    router.back()
    return
  }
  void router.push(fallback)
}
