/**
 * Periodic Drive sync when signed in (app state + optional song cache).
 * Interval is Settings-configurable; 0 disables polling.
 */

import { isSingTagsOffline } from '../appOffline'
import { ensureDriveHydrate } from './driveAppStateSync'
import { ensureDriveCacheSync, isDriveCacheSyncEnabled } from './driveCacheSync'
import {
  googleAuthState,
  hasUsableAccessToken,
  isDriveSyncEnabled,
  restoreGoogleConnection,
} from './googleAuth'

export const DRIVE_SYNC_POLL_MINUTES_KEY = 'singtags.drive.sync.pollMinutes.v1'

/** Preset intervals (minutes). `0` = off. */
export const DRIVE_SYNC_POLL_OPTIONS = [0, 1, 5, 15, 30, 60] as const

/** Default: every 5 minutes (gentle on battery / Drive quota). */
export const DRIVE_SYNC_POLL_DEFAULT_MINUTES = 5

let pollTimer: ReturnType<typeof setInterval> | null = null
let tickInFlight: Promise<void> | null = null

function readStoredMinutes(): number | null {
  try {
    const raw = localStorage.getItem(DRIVE_SYNC_POLL_MINUTES_KEY)
    if (raw == null || raw === '') return null
    const n = Number(raw)
    if (!Number.isFinite(n)) return null
    return Math.max(0, Math.floor(n))
  } catch {
    return null
  }
}

export function normalizeDriveSyncPollMinutes(n: unknown): number {
  const v = typeof n === 'number' ? n : Number(n)
  if (!Number.isFinite(v) || v <= 0) return 0
  const mins = Math.floor(v)
  // Snap to a known preset when close; otherwise allow custom ≥ 1.
  if ((DRIVE_SYNC_POLL_OPTIONS as readonly number[]).includes(mins)) return mins
  return Math.min(24 * 60, Math.max(1, mins))
}

export function getDriveSyncPollMinutes(): number {
  const stored = readStoredMinutes()
  if (stored == null) return DRIVE_SYNC_POLL_DEFAULT_MINUTES
  return normalizeDriveSyncPollMinutes(stored)
}

export function setDriveSyncPollMinutes(minutes: number): void {
  const next = normalizeDriveSyncPollMinutes(minutes)
  try {
    localStorage.setItem(DRIVE_SYNC_POLL_MINUTES_KEY, String(next))
  } catch {
    /* ignore */
  }
  restartDriveSyncPolling()
}

export function driveSyncPollLabel(minutes: number): string {
  const m = normalizeDriveSyncPollMinutes(minutes)
  if (m <= 0) return 'Off'
  if (m === 1) return 'Every minute'
  return `Every ${m} minutes`
}

async function pollTick(): Promise<void> {
  if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return
  if (isSingTagsOffline()) return
  restoreGoogleConnection()
  if (!isDriveSyncEnabled() || !googleAuthState.connected) return
  if (!hasUsableAccessToken()) return

  if (tickInFlight) return tickInFlight
  tickInFlight = (async () => {
    try {
      await ensureDriveHydrate({ allowTokenPrompt: false })
      if (isDriveCacheSyncEnabled()) {
        await ensureDriveCacheSync({ allowTokenPrompt: false })
      }
    } catch {
      /* status surfaces on driveSyncState / driveCacheSyncState */
    } finally {
      tickInFlight = null
    }
  })()
  return tickInFlight
}

/** Start or restart the interval from the current Settings value. */
export function startDriveSyncPolling(): void {
  stopDriveSyncPolling()
  const minutes = getDriveSyncPollMinutes()
  if (minutes <= 0) return
  if (typeof window === 'undefined') return

  const ms = minutes * 60_000
  pollTimer = setInterval(() => {
    void pollTick()
  }, ms)

  // One quiet catch-up when the tab becomes visible again.
  document.addEventListener('visibilitychange', onVisibility)
}

function onVisibility(): void {
  if (document.visibilityState !== 'visible') return
  if (getDriveSyncPollMinutes() <= 0) return
  void pollTick()
}

export function stopDriveSyncPolling(): void {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
  if (typeof document !== 'undefined') {
    document.removeEventListener('visibilitychange', onVisibility)
  }
}

export function restartDriveSyncPolling(): void {
  startDriveSyncPolling()
}

/** Test helper. */
export function __resetDriveSyncPollForTests(): void {
  stopDriveSyncPolling()
  tickInFlight = null
}
