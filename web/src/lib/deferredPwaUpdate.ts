/**
 * Silent deferred PWA update: apply the waiting service worker only when the
 * session is idle (not playing / not fullscreen), after saving scroll for restore.
 */

import {
  isSessionBusy,
  onSessionBusyChange,
} from './sessionActivity'

export const PWA_RELOAD_SCROLL_KEY = 'singtags.pwaReload.scroll.v1'

type ScrollSnapshot = {
  path: string
  scrollY: number
  at: number
}

type UpdateFn = (reloadPage?: boolean) => Promise<void>

let pending = false
let applying = false
let updateFn: UpdateFn | null = null
let pollTimer: ReturnType<typeof setInterval> | null = null
let unsubBusy: (() => void) | null = null

function currentPath(): string {
  if (typeof location === 'undefined') return ''
  return `${location.pathname}${location.search}${location.hash}`
}

/** Soft fullscreen via `?fullscreen=1` counts as busy even if chrome is soft. */
export function routeLooksFullscreen(): boolean {
  if (typeof location === 'undefined') return false
  try {
    return new URLSearchParams(location.search).get('fullscreen') === '1'
  } catch {
    return false
  }
}

export function canApplyPwaUpdateNow(): boolean {
  if (isSessionBusy()) return false
  if (routeLooksFullscreen()) return false
  return true
}

export function saveScrollForPwaReload(): void {
  if (typeof sessionStorage === 'undefined' || typeof window === 'undefined') return
  const snap: ScrollSnapshot = {
    path: currentPath(),
    scrollY: window.scrollY || 0,
    at: Date.now(),
  }
  try {
    sessionStorage.setItem(PWA_RELOAD_SCROLL_KEY, JSON.stringify(snap))
  } catch {
    /* ignore quota */
  }
}

/**
 * Restore window scroll after a deferred PWA reload (same path, fresh snapshot).
 * Retries a few frames so list layout can settle.
 */
export function restoreScrollAfterPwaReload(): void {
  if (typeof sessionStorage === 'undefined' || typeof window === 'undefined') return
  let raw: string | null
  try {
    raw = sessionStorage.getItem(PWA_RELOAD_SCROLL_KEY)
    if (raw) sessionStorage.removeItem(PWA_RELOAD_SCROLL_KEY)
  } catch {
    return
  }
  if (!raw) return
  let snap: ScrollSnapshot
  try {
    snap = JSON.parse(raw) as ScrollSnapshot
  } catch {
    return
  }
  if (!snap || typeof snap.scrollY !== 'number') return
  if (snap.path !== currentPath()) return
  if (Date.now() - (snap.at || 0) > 90_000) return

  const y = Math.max(0, snap.scrollY)
  const apply = () => window.scrollTo(0, y)
  apply()
  requestAnimationFrame(() => {
    apply()
    window.setTimeout(apply, 50)
    window.setTimeout(apply, 250)
    window.setTimeout(apply, 800)
  })
}

function stopWatchers(): void {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
  if (unsubBusy) {
    unsubBusy()
    unsubBusy = null
  }
  if (typeof document !== 'undefined') {
    document.removeEventListener('visibilitychange', onVisibility)
  }
}

async function tryApply(): Promise<void> {
  if (!pending || applying || !updateFn) return
  if (!canApplyPwaUpdateNow()) return
  applying = true
  pending = false
  stopWatchers()
  saveScrollForPwaReload()
  try {
    await updateFn(true)
  } catch {
    // If activate fails, re-arm so a later idle pass can retry.
    pending = true
    applying = false
    startWatchers()
    return
  }
  // updateServiceWorker normally reloads; if it doesn't, force one.
  window.setTimeout(() => {
    if (typeof window !== 'undefined') window.location.reload()
  }, 1200)
}

function startWatchers(): void {
  if (pollTimer || typeof window === 'undefined') return
  unsubBusy = onSessionBusyChange(() => {
    void tryApply()
  })
  pollTimer = setInterval(() => {
    void tryApply()
  }, 2000)
  document.addEventListener('visibilitychange', onVisibility)
}

function onVisibility(): void {
  if (document.visibilityState === 'visible') void tryApply()
}

/**
 * Arm a silent update. `updateServiceWorker` comes from `useRegisterSW`.
 * No UI — applies when {@link canApplyPwaUpdateNow} is true.
 */
export function armDeferredPwaUpdate(updateServiceWorker: UpdateFn): void {
  updateFn = updateServiceWorker
  pending = true
  applying = false
  startWatchers()
  void tryApply()
}

/** @internal tests */
export function resetDeferredPwaUpdateForTests(): void {
  pending = false
  applying = false
  updateFn = null
  stopWatchers()
  if (typeof document !== 'undefined') {
    document.removeEventListener('visibilitychange', onVisibility)
  }
}

/** @internal tests */
export function isDeferredPwaUpdatePending(): boolean {
  return pending
}
