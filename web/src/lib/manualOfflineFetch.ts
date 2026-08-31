/** When offline (manual or browser), serve cache hits only — block new network use. */

import { audioPack, sheetsPack } from '../offline/libraryPack'

/** Cache names consulted by {@link matchOfflineCache} (indexes, meta, pack v1). */
export const OFFLINE_CACHE_NAMES = [
  'singtags-indexes',
  'singtags-tag-meta',
  'singtags-sheets-v1',
  'singtags-audio-v1',
] as const

let blocked = false
let nativeFetch: typeof fetch | null = null

/** Resolve a fetch URL string from RequestInfo (for the offline fetch patch). */
function resolveRequestUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') {
    const base = typeof window !== 'undefined' ? window.location.href : 'http://localhost/'
    return new URL(input, base).href
  }
  if (input instanceof URL) return input.href
  return input.url
}

/** Learning tracks and sheet pixels must come from packs — never the open network while offline. */
function isOfflineProtectedMediaPath(pathname: string): boolean {
  if (/\/media\//.test(pathname)) return true
  if (/\.(m4a|mp3|ogg|opus|wav|aac|webm)(\?|$)/i.test(pathname)) return true
  if (
    /\/tags\/\d+\//.test(pathname) &&
    !/\/tags\/\d+\/metadata\.json$/.test(pathname)
  ) {
    return true
  }
  return false
}

/**
 * Same-origin app shell + catalog JSON the service worker already precaches or runtime-caches.
 * Lets lazy route chunks load while still blocking uncached media downloads.
 */
export function allowServiceWorkerFetch(url: string): boolean {
  try {
    const base =
      typeof window !== 'undefined' ? window.location.href : 'http://localhost/'
    const u = new URL(url, base)
    const pageOrigin =
      typeof window !== 'undefined' ? window.location.origin : u.origin
    if (u.origin !== pageOrigin) return false
    if (isOfflineProtectedMediaPath(u.pathname)) return false
    const p = u.pathname
    if (/\.(js|css|wasm|woff2?|ico|svg|webmanifest)(\?|$)/i.test(p)) return true
    const appBase = (import.meta.env.BASE_URL || '/').replace(/\/$/, '') || ''
    if (p === appBase || p === `${appBase}/` || p.endsWith('/index.html')) return true
    if (p.includes('/indexes/')) return true
    if (/\/tags\/\d+\/metadata\.json$/.test(p)) return true
    if (p.endsWith('/sw.js') || p.includes('workbox')) return true
    return false
  } catch {
    return false
  }
}

/** Probe Cache API buckets (known names, then other singtags/workbox caches). */
async function matchCacheStorage(url: string): Promise<Response | null> {
  if (typeof caches === 'undefined') return null
  const seen = new Set<string>()
  for (const name of OFFLINE_CACHE_NAMES) {
    if (seen.has(name)) continue
    seen.add(name)
    try {
      const cache = await caches.open(name)
      const hit = await cache.match(url)
      if (hit) return hit
    } catch {
      /* ignore */
    }
  }
  try {
    for (const name of await caches.keys()) {
      if (
        seen.has(name) ||
        (!name.startsWith('singtags') && !name.startsWith('workbox-precache'))
      ) {
        continue
      }
      seen.add(name)
      const cache = await caches.open(name)
      const hit = await cache.match(url)
      if (hit) return hit
    }
  } catch {
    /* ignore */
  }
  return null
}

/** Cache API hit, then offline pack lookup, for a single URL. */
export async function matchOfflineCache(url: string): Promise<Response | null> {
  const fromCaches = await matchCacheStorage(url)
  if (fromCaches) return fromCaches
  for (const pack of [audioPack, sheetsPack]) {
    try {
      const hit = await pack.get(url)
      if (hit) return hit
    } catch {
      /* ignore */
    }
  }
  return null
}

/**
 * Fetch with Cache API + offline pack fallback (for explicit offline-safe reads).
 * When manual-offline is on or the browser reports offline, prefer cache/pack
 * *before* touching the network so tag sheets aren’t stuck on “Preparing…” waiting
 * for a timed-out fetch.
 */
export async function fetchCached(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  ensureFetchPatchInstalled()
  if (!nativeFetch) nativeFetch = globalThis.fetch.bind(globalThis)
  const url = resolveRequestUrl(input)
  if (url.startsWith('blob:') || url.startsWith('data:')) {
    return nativeFetch(input, init)
  }

  const browserOffline =
    typeof navigator !== 'undefined' && navigator.onLine === false
  if (blocked || browserOffline) {
    const cached = await matchOfflineCache(url)
    if (cached) return cached
    throw new TypeError('This file is not cached on your device yet')
  }

  try {
    const res = await nativeFetch(input, init)
    if (res.ok) return res
  } catch {
    /* network failed — fall through to cache */
  }
  const cached = await matchOfflineCache(url)
  if (cached) return cached
  throw new TypeError('This file is not cached on your device yet')
}

/** Install the global fetch interceptor (idempotent). */
export function ensureFetchPatchInstalled(): void {
  if (typeof globalThis.fetch !== 'function') return
  const current = globalThis.fetch as typeof fetch & { __singtagsPatched?: boolean }
  if (current.__singtagsPatched) return
  nativeFetch = globalThis.fetch.bind(globalThis)
  const patched = async (
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> => {
    if (blocked) {
      const url = resolveRequestUrl(input)
      // Blob/data URLs are in-memory — never block (e.g. pack playback).
      if (url.startsWith('blob:') || url.startsWith('data:')) {
        return nativeFetch!(input, init)
      }
      const cached = await matchOfflineCache(url)
      if (cached) return cached
      if (allowServiceWorkerFetch(url)) {
        return nativeFetch!(input, init)
      }
      throw new TypeError('Offline mode — this file is not cached on your device yet')
    }
    return nativeFetch!(input, init)
  }
  ;(patched as typeof fetch & { __singtagsPatched?: boolean }).__singtagsPatched = true
  globalThis.fetch = patched as typeof fetch
}

/** Enable or disable manual offline mode (cache-only media fetches). */
export function setManualOfflineFetch(on: boolean): void {
  ensureFetchPatchInstalled()
  blocked = on
}

/** True when manual offline mode is blocking uncached network fetches. */
export function isManualOfflineFetchBlocked(): boolean {
  return blocked
}
