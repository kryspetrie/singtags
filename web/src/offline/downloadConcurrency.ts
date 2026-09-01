/**
 * Adaptive pack-download concurrency and a shared in-flight gate.
 *
 * Scales fetch/transform workers from device + Network Information hints, and
 * caps concurrent network fetches across sheet + audio queues so dual sync
 * does not overwhelm phones.
 */

/** Snapshot of browser capability / network hints for concurrency picks. */
export interface NetworkHints {
  hardwareConcurrency?: number
  saveData?: boolean
  effectiveType?: string
  connectionType?: string
  downlink?: number
}

/** Pack workload shape used by {@link adaptivePackConcurrency}. */
export type PackDownloadKind = 'sheets' | 'audio-fetch' | 'audio-reencode'

/** Suggested fetch worker count and optional transform slot count. */
export interface PackConcurrency {
  /** Parallel fetch/store workers. */
  fetch: number
  /**
   * Max concurrent `transformResponse` calls when re-encoding.
   * `0` means no separate transform limit (identity / passthrough packs).
   */
  transform: number
}

/** Read Network Information + hardware concurrency (best-effort). */
export function readNetworkHints(
  nav: Navigator | undefined = typeof navigator !== 'undefined' ? navigator : undefined,
): NetworkHints {
  if (!nav) return {}
  const conn = (
    nav as Navigator & {
      connection?: {
        saveData?: boolean
        effectiveType?: string
        type?: string
        downlink?: number
      }
    }
  ).connection
  return {
    hardwareConcurrency: nav.hardwareConcurrency,
    saveData: conn?.saveData,
    effectiveType: conn?.effectiveType,
    connectionType: conn?.type,
    downlink: conn?.downlink,
  }
}

/** True for cellular / save-data / slow effectiveType / very low downlink. */
export function isConstrainedNetwork(hints: NetworkHints): boolean {
  if (hints.saveData) return true
  if (hints.connectionType === 'cellular') return true
  const t = hints.effectiveType
  if (t === 'slow-2g' || t === '2g' || t === '3g') return true
  if (typeof hints.downlink === 'number' && hints.downlink > 0 && hints.downlink < 1.5) return true
  return false
}

/**
 * Pick fetch (+ optional transform) concurrency for a pack download.
 *
 * Audio re-encode keeps transform slots tiny (CPU/memory) while allowing more
 * fetches so published-tier files keep flowing during encodes.
 */
export function adaptivePackConcurrency(
  kind: PackDownloadKind,
  hints: NetworkHints = readNetworkHints(),
): PackConcurrency {
  const cores = hints.hardwareConcurrency ?? 4
  const slow = isConstrainedNetwork(hints)

  if (kind === 'sheets') {
    // Tiny WebPs are latency-bound; higher parallelism is usually safe.
    if (slow) return { fetch: 10, transform: 0 }
    if (cores <= 4) return { fetch: 16, transform: 0 }
    return { fetch: 24, transform: 0 }
  }

  if (kind === 'audio-reencode') {
    const transform = cores <= 2 ? 1 : 2
    // Fetch ahead of encodes; stay modest on constrained links.
    const fetch = slow ? Math.min(4, transform + 2) : Math.min(8, transform + 4)
    return { fetch, transform }
  }

  // Published-tier audio: store as-is (no on-device encode).
  if (slow) return { fetch: 6, transform: 0 }
  if (cores <= 4) return { fetch: 12, transform: 0 }
  return { fetch: 16, transform: 0 }
}

/**
 * Shared ceiling for concurrent network fetches when sheets + audio run together.
 */
export function adaptiveGlobalInflightCap(hints: NetworkHints = readNetworkHints()): number {
  const cores = hints.hardwareConcurrency ?? 4
  if (isConstrainedNetwork(hints)) return 12
  if (cores <= 4) return 16
  return 20
}

/**
 * Counting semaphore for limiting concurrent async work (fetches or transforms).
 */
export class InflightLimiter {
  private active = 0
  private readonly waiters: Array<() => void> = []
  private max: number

  constructor(max: number) {
    this.max = Math.max(1, max)
  }

  /** Current max slots (mutable so callers can refresh from network hints). */
  get limit(): number {
    return this.max
  }

  setLimit(n: number): void {
    this.max = Math.max(1, n)
    this.pump()
  }

  /** Acquire a slot; resolves with a one-shot release function. */
  async acquire(): Promise<() => void> {
    while (this.active >= this.max) {
      await new Promise<void>((resolve) => {
        this.waiters.push(resolve)
      })
    }
    this.active++
    let released = false
    return () => {
      if (released) return
      released = true
      this.active--
      this.pump()
    }
  }

  private pump(): void {
    while (this.active < this.max && this.waiters.length) {
      this.waiters.shift()!()
    }
  }
}

/** Process-wide gate for pack network fetches (sheets + audio share this). */
export const packDownloadInflight = new InflightLimiter(adaptiveGlobalInflightCap())

/** Refresh {@link packDownloadInflight} from current network hints. */
export function refreshPackDownloadInflightCap(hints: NetworkHints = readNetworkHints()): void {
  packDownloadInflight.setLimit(adaptiveGlobalInflightCap(hints))
}
