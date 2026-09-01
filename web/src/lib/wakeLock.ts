/**
 * Screen Wake Lock helper — keep the display on during sheet fullscreen / playback.
 * Holders are refcounted by id so sheet + audio can share one sentinel.
 * No-ops when the API is missing or the document is hidden.
 */

export type WakeLockHolder = 'sheet' | 'audio'

type WakeLockSentinelLike = {
  released: boolean
  release: () => Promise<void>
  addEventListener?: (type: 'release', listener: () => void) => void
}

type WakeLockNavigator = Navigator & {
  wakeLock?: {
    request: (type: 'screen') => Promise<WakeLockSentinelLike>
  }
}

let sentinel: WakeLockSentinelLike | null = null
const holders = new Set<WakeLockHolder>()
let visibilityBound = false

function wakeLockApi(): WakeLockNavigator['wakeLock'] | undefined {
  if (typeof navigator === 'undefined') return undefined
  return (navigator as WakeLockNavigator).wakeLock
}

function wantsLock(): boolean {
  return holders.size > 0
}

async function acquire(): Promise<void> {
  if (!wantsLock()) return
  if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return
  const api = wakeLockApi()
  if (!api) return
  if (sentinel && !sentinel.released) return
  sentinel = null
  try {
    sentinel = await api.request('screen')
    sentinel.addEventListener?.('release', () => {
      sentinel = null
    })
  } catch {
    sentinel = null
  }
}

async function releaseInternal(): Promise<void> {
  const cur = sentinel
  sentinel = null
  if (!cur || cur.released) return
  try {
    await cur.release()
  } catch {
    /* ignore */
  }
}

function onVisibilityChange(): void {
  if (typeof document === 'undefined') return
  if (document.visibilityState !== 'visible') {
    // Browser releases the lock while hidden; drop our handle so we re-request.
    sentinel = null
    return
  }
  if (wantsLock()) void acquire()
}

function ensureVisibilityListener(): void {
  if (visibilityBound || typeof document === 'undefined') return
  document.addEventListener('visibilitychange', onVisibilityChange)
  visibilityBound = true
}

/** Acquire (or keep) a screen wake lock for a named holder. Safe to call repeatedly. */
export async function acquireWakeLock(holder: WakeLockHolder): Promise<void> {
  holders.add(holder)
  ensureVisibilityListener()
  await acquire()
}

/** Drop one holder; releases the sentinel when no holders remain. */
export async function releaseWakeLock(holder: WakeLockHolder): Promise<void> {
  holders.delete(holder)
  if (!wantsLock()) await releaseInternal()
}

/**
 * @deprecated Prefer {@link acquireWakeLock} with a holder id.
 * Kept for call sites that mean “audio or generic” — uses `audio`.
 */
export async function requestWakeLock(): Promise<void> {
  await acquireWakeLock('audio')
}

/** True when a wake lock is currently held (best-effort). */
export function isWakeLockHeld(): boolean {
  return !!sentinel && !sentinel.released
}

/** Test helper — which holders currently want the lock. */
export function wakeLockHoldersForTests(): WakeLockHolder[] {
  return [...holders]
}

/** Test helper — reset module state. */
export function resetWakeLockForTests(): void {
  sentinel = null
  holders.clear()
  if (visibilityBound && typeof document !== 'undefined') {
    document.removeEventListener('visibilitychange', onVisibilityChange)
  }
  visibilityBound = false
}
