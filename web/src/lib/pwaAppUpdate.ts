/**
 * In-app PWA shell update: check for a waiting service worker, apply it, or
 * hard-reset only the Workbox precache (not song/offline media caches).
 */

import { BROWSE_RELOAD_SCROLL_KEY } from './browseReloadScroll'
import { armDeferredPwaUpdate, PWA_RELOAD_SCROLL_KEY } from './deferredPwaUpdate'

type UpdateFn = (reloadPage?: boolean) => Promise<void>

let updateFn: UpdateFn | null = null
let needRefresh = false
let checking = false

/** True while {@link checkForAppUpdate} is in flight. */
export function isPwaAppUpdateChecking(): boolean {
  return checking
}

/** Whether the register hook has reported a waiting worker. */
export function isPwaAppUpdatePending(): boolean {
  return needRefresh
}

/**
 * Wire `useRegisterSW` into this module. Call once from the app shell.
 * Arms silent deferred apply and returns a handler for `onNeedRefresh`.
 */
export function bindPwaAppUpdate(updateServiceWorker: UpdateFn): {
  onNeedRefresh: () => void
} {
  updateFn = updateServiceWorker
  return {
    onNeedRefresh() {
      needRefresh = true
      armDeferredPwaUpdate((reload) => updateServiceWorker(reload))
    },
  }
}

/** Activate the waiting worker and reload (user-initiated). */
export async function applyWaitingPwaUpdate(): Promise<void> {
  if (!updateFn) {
    if (typeof window !== 'undefined') window.location.reload()
    return
  }
  needRefresh = false
  await updateFn(true)
  window.setTimeout(() => {
    if (typeof window !== 'undefined') window.location.reload()
  }, 1200)
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** Ask every registered SW to check for updates. */
async function pingServiceWorkerUpdates(): Promise<void> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return
  const regs = await navigator.serviceWorker.getRegistrations()
  await Promise.all(regs.map((r) => r.update().catch(() => undefined)))
}

/**
 * Workbox SPA shell caches only — never song packs (`singtags-sheets-v1` /
 * `singtags-audio-v1`) or catalog runtime caches.
 */
export function isAppShellCacheName(name: string): boolean {
  if (/^workbox-precache/i.test(name)) return true
  if (/^workbox-runtime/i.test(name)) return true
  return false
}

/** Drop SPA shell caches and unregister service workers, then reload at search top. */
export async function hardResetAppShell(): Promise<void> {
  if (typeof window === 'undefined') return
  needRefresh = false
  try {
    if ('caches' in window) {
      const keys = await caches.keys()
      await Promise.all(
        keys.filter(isAppShellCacheName).map((k) => caches.delete(k).catch(() => false)),
      )
    }
  } catch {
    /* ignore */
  }
  try {
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations()
      await Promise.all(regs.map((r) => r.unregister().catch(() => false)))
    }
  } catch {
    /* ignore */
  }
  // Force refresh should not restore a stuck mid-list Browse position.
  try {
    sessionStorage.removeItem(PWA_RELOAD_SCROLL_KEY)
    sessionStorage.removeItem(BROWSE_RELOAD_SCROLL_KEY)
  } catch {
    /* ignore */
  }
  try {
    const u = new URL(window.location.href)
    if (u.searchParams.has('at')) {
      u.searchParams.delete('at')
      window.history.replaceState(null, '', `${u.pathname}${u.search}${u.hash}`)
    }
    window.scrollTo(0, 0)
  } catch {
    /* ignore */
  }
  window.location.reload()
}

export type AppUpdateCheckResult =
  | { status: 'reloading'; detail: 'waiting' | 'hard-reset' }
  | { status: 'current' }
  | { status: 'offline' }
  | { status: 'unsupported' }

/**
 * Check for a newer app shell. Prefer activating a waiting SW; if none appears
 * after update(), optionally hard-reset the shell cache (`forceReset`).
 */
export async function checkForAppUpdate(opts?: {
  forceReset?: boolean
}): Promise<AppUpdateCheckResult> {
  if (typeof window === 'undefined') return { status: 'unsupported' }
  if (typeof navigator.onLine === 'boolean' && !navigator.onLine) {
    return { status: 'offline' }
  }
  if (!('serviceWorker' in navigator)) {
    window.location.reload()
    return { status: 'reloading', detail: 'hard-reset' }
  }
  if (checking) return { status: 'current' }
  checking = true
  try {
    if (needRefresh && updateFn) {
      await applyWaitingPwaUpdate()
      return { status: 'reloading', detail: 'waiting' }
    }
    await pingServiceWorkerUpdates()
    // Give the register hook a moment to flip needRefresh / install waiting SW.
    await sleep(900)
    if (needRefresh && updateFn) {
      await applyWaitingPwaUpdate()
      return { status: 'reloading', detail: 'waiting' }
    }
    const regs = await navigator.serviceWorker.getRegistrations()
    const waiting = regs.some((r) => !!r.waiting)
    if (waiting && updateFn) {
      needRefresh = true
      await applyWaitingPwaUpdate()
      return { status: 'reloading', detail: 'waiting' }
    }
    if (opts?.forceReset) {
      await hardResetAppShell()
      return { status: 'reloading', detail: 'hard-reset' }
    }
    return { status: 'current' }
  } finally {
    checking = false
  }
}

/** @internal tests */
export function resetPwaAppUpdateForTests(): void {
  updateFn = null
  needRefresh = false
  checking = false
}
