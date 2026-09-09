import type { RouteLocationNormalizedLoaded } from 'vue-router'
import type { Router } from 'vue-router'
import { encodeLocalTransferAssetQuery } from '../../types/localLibrary'
import { FULLSCREEN_QUERY_FLAG, hasFullscreenQuery } from '../fullscreenQuery'

export const OPTICAL_TX_PATH = '/tx'
export const OPTICAL_RX_PATH = '/rx'

export type OpticalTransferNavOptions = {
  tagIds?: number[]
  name?: string
  collectionId?: string
  /** Local Library entry ids to pack into the optical send queue. */
  localDocIds?: string[]
  /**
   * Optional per-entry asset ids to include.
   * When omitted, each entry uses {@link defaultOpticalTransferAssets} (primary sheet only).
   */
  localAssetIdsByEntry?: Record<string, string[]>
  /** When packing local docs, ask receivers to open immediately. */
  openNow?: boolean
}

/** Open optical transfer send for selected tags, a collection, or local docs. */
export function navigateToOpticalTransfer(
  router: Router,
  opts: OpticalTransferNavOptions,
): ReturnType<Router['push']> | undefined {
  if (opts.localDocIds?.length) {
    const query: Record<string, string> = {
      localDocs: opts.localDocIds.join(','),
    }
    if (opts.openNow) query.openNow = '1'
    if (opts.localAssetIdsByEntry && Object.keys(opts.localAssetIdsByEntry).length) {
      const encoded = encodeLocalTransferAssetQuery(opts.localAssetIdsByEntry)
      if (encoded) query.localAssets = encoded
    }
    return router.push({ name: 'tx', query })
  }
  if (opts.collectionId) {
    return router.push({ name: 'tx', query: { collection: opts.collectionId } })
  }
  const tagIds = opts.tagIds?.filter((id) => Number.isFinite(id)) ?? []
  if (!tagIds.length) return undefined
  return router.push({
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

/** Query that opens the receive camera overlay immediately (invite / deep link). */
export const OPTICAL_RECEIVE_FULLSCREEN_QUERY = {
  fullscreen: FULLSCREEN_QUERY_FLAG,
} as const

/** True when the route should open the Receive tab. */
export function isOpticalReceiveRoute(route: Pick<RouteLocationNormalizedLoaded, 'name' | 'path' | 'query'>): boolean {
  if (route.name === 'rx') return true
  if (route.path === OPTICAL_RX_PATH || route.path.startsWith(`${OPTICAL_RX_PATH}/`)) return true
  return route.query.mode === 'receive'
}

/**
 * True when `/rx` should auto-enter the fullscreen camera overlay.
 * Canonical form is bare `?fullscreen`; legacy `=1` / `true` still work.
 */
export function isOpticalReceiveFullscreenQuery(
  query: RouteLocationNormalizedLoaded['query'] | Record<string, unknown>,
): boolean {
  return hasFullscreenQuery(query)
}

/** Absolute URL for the send-page invite: `/rx?fullscreen` opens the camera overlay. */
export function opticalReceiveAbsoluteHref(router: Router): string {
  const resolved = router.resolve({
    path: OPTICAL_RX_PATH,
    query: { ...OPTICAL_RECEIVE_FULLSCREEN_QUERY },
  })
  if (typeof window !== 'undefined') {
    return new URL(resolved.href, window.location.origin).href
  }
  return resolved.href
}
