/**
 * Shared navigation helpers for Labs wireless transfer.
 * Mirrors optical `/tx` ↔ `/rx` + `?fullscreen`.
 */
import type { LocationQueryRaw, RouteLocationNormalizedLoaded, Router } from 'vue-router'
import { FULLSCREEN_QUERY_FLAG, hasFullscreenQuery } from './fullscreenQuery'

export const WIRELESS_TX_PATH = '/wireless'
export const WIRELESS_RX_PATH = '/wireless/rx'

export const LABS_RECEIVE_FULLSCREEN_QUERY = {
  fullscreen: FULLSCREEN_QUERY_FLAG,
} as const

export function isLabsReceiveFullscreenQuery(
  query: RouteLocationNormalizedLoaded['query'] | Record<string, unknown>,
): boolean {
  return hasFullscreenQuery(query)
}

export function isWirelessReceiveRoute(
  route: Pick<RouteLocationNormalizedLoaded, 'name' | 'path' | 'query'>,
): boolean {
  if (route.name === 'wireless-rx') return true
  if (route.path === WIRELESS_RX_PATH || route.path.startsWith(`${WIRELESS_RX_PATH}/`)) return true
  return route.query.mode === 'receive'
}

function absoluteHref(router: Router, path: string, query: LocationQueryRaw): string {
  const resolved = router.resolve({ path, query })
  if (typeof window !== 'undefined') {
    return new URL(resolved.href, window.location.origin).href
  }
  return resolved.href
}

/** Absolute invite URL that auto-opens wireless fullscreen receive. */
export function wirelessReceiveAbsoluteHref(router: Router): string {
  return absoluteHref(router, WIRELESS_RX_PATH, { ...LABS_RECEIVE_FULLSCREEN_QUERY })
}
