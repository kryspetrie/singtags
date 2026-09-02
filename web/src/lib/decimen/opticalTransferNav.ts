import type { RouteLocationNormalizedLoaded } from 'vue-router'
import type { Router } from 'vue-router'

export const OPTICAL_TX_PATH = '/tx'
export const OPTICAL_RX_PATH = '/rx'

export type OpticalTransferNavOptions = {
  tagIds?: number[]
  name?: string
  collectionId?: string
}

/** Open optical transfer send for selected tags or a saved collection. */
export function navigateToOpticalTransfer(router: Router, opts: OpticalTransferNavOptions): void {
  if (opts.collectionId) {
    void router.push({ name: 'tx', query: { collection: opts.collectionId } })
    return
  }
  const tagIds = opts.tagIds?.filter((id) => Number.isFinite(id)) ?? []
  if (!tagIds.length) return
  void router.push({
    name: 'tx',
    query: {
      tags: tagIds.join(','),
      name: opts.name?.trim() || 'Selection',
    },
  })
}

/** Route location for receive-first optical transfer (works fully offline). */
export const opticalReceiveRoute = {
  name: 'rx' as const,
}

/** True when the route should open the Receive tab. */
export function isOpticalReceiveRoute(route: Pick<RouteLocationNormalizedLoaded, 'name' | 'path' | 'query'>): boolean {
  if (route.name === 'rx') return true
  if (route.path === OPTICAL_RX_PATH || route.path.startsWith(`${OPTICAL_RX_PATH}/`)) return true
  return route.query.mode === 'receive'
}

/** Absolute URL to open optical transfer in receive mode (for sharing with the receiver). */
export function opticalReceiveAbsoluteHref(router: Router): string {
  const resolved = router.resolve({ path: OPTICAL_RX_PATH })
  if (typeof window !== 'undefined') {
    return new URL(resolved.href, window.location.origin).href
  }
  return resolved.href
}
