/**
 * Pace Drive song-cache downloads to a megabit budget.
 * 1 megabit = 1,000,000 bits, the same unit an internet plan uses.
 */

export const DRIVE_DOWNLOAD_MBPS_KEY = 'singtags.drive.cache.downloadMbps.v1'
export const DEFAULT_DRIVE_DOWNLOAD_MBPS = 6
export const MIN_DRIVE_DOWNLOAD_MBPS = 0.5
export const MAX_DRIVE_DOWNLOAD_MBPS = 200

export const DOWNLOAD_SLOTS_MIN = 2
export const DOWNLOAD_SLOTS_MAX = 32
export const DOWNLOAD_SLOTS_START = 4

/** Bytes per second for an advertised megabit rate. */
export function megabitsToBytesPerSec(megabitsPerSec: number): number {
  return (megabitsPerSec * 1_000_000) / 8
}

export function clampDriveDownloadMbps(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_DRIVE_DOWNLOAD_MBPS
  return Math.min(MAX_DRIVE_DOWNLOAD_MBPS, Math.max(MIN_DRIVE_DOWNLOAD_MBPS, value))
}

export function readDriveDownloadMbps(): number {
  try {
    const raw = localStorage.getItem(DRIVE_DOWNLOAD_MBPS_KEY)
    if (raw == null || raw === '') return DEFAULT_DRIVE_DOWNLOAD_MBPS
    return clampDriveDownloadMbps(Number(raw))
  } catch {
    return DEFAULT_DRIVE_DOWNLOAD_MBPS
  }
}

export function writeDriveDownloadMbps(megabitsPerSec: number): number {
  const next = clampDriveDownloadMbps(megabitsPerSec)
  try {
    localStorage.setItem(DRIVE_DOWNLOAD_MBPS_KEY, String(next))
  } catch {
    /* ignore */
  }
  return next
}

export type ByteBudget = {
  /** Wait until `bytes` fit in the rate. Resolves with how long this call slept. */
  acquire(bytes: number): Promise<number>
}

/**
 * Token bucket. Starts with one second of credit so the first files leave immediately,
 * then holds the long-run average at `bytesPerSec`.
 */
export function createByteBudget(opts: {
  bytesPerSec: number | (() => number)
  now?: () => number
  sleep?: (ms: number) => Promise<void>
}): ByteBudget {
  const now = opts.now ?? (() => performance.now())
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)))
  const currentRate = (): number => {
    const raw = typeof opts.bytesPerSec === 'function' ? opts.bytesPerSec() : opts.bytesPerSec
    return Math.max(1, raw)
  }
  let tokens = currentRate()
  let last = now()
  let chain: Promise<void> = Promise.resolve()

  const acquire = (bytes: number): Promise<number> => {
    const n = Math.max(0, bytes)
    const run = async () => {
      const rate = currentRate()
      const t = now()
      const elapsedSec = Math.max(0, t - last) / 1000
      last = t
      tokens = Math.min(rate, tokens + elapsedSec * rate)
      if (n === 0 || tokens >= n) {
        tokens -= n
        return 0
      }
      const deficit = n - tokens
      tokens = 0
      const waitMs = (deficit / rate) * 1000
      if (waitMs > 0) {
        await sleep(waitMs)
        last = now()
      }
      return waitMs
    }
    const next = chain.then(run, run)
    chain = next.then(
      () => undefined,
      () => undefined,
    )
    return next
  }

  return { acquire }
}

/**
 * Raise the number of in-flight downloads when they are waiting on the network,
 * and lower it when they are waiting on the speed cap.
 */
export function nextDownloadSlots(opts: {
  slots: number
  waitedRatio: number
  saturated: boolean
}): number {
  const slots = Math.min(DOWNLOAD_SLOTS_MAX, Math.max(DOWNLOAD_SLOTS_MIN, opts.slots))
  if (opts.waitedRatio >= 0.25) return Math.max(DOWNLOAD_SLOTS_MIN, slots - 1)
  if (opts.saturated && opts.waitedRatio < 0.05) return Math.min(DOWNLOAD_SLOTS_MAX, slots + 2)
  return slots
}
