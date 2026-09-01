/**
 * Browser storage quota helpers for offline download UX.
 *
 * Wraps `navigator.storage` estimate/persist APIs and formats byte counts for display.
 */

/** Snapshot of origin storage usage from {@link getStorageEstimate}. */
export interface StorageEstimateInfo {
  /** Bytes currently used by the origin (best-effort). */
  usage: number
  /** Storage quota in bytes (best-effort). */
  quota: number
  /** {@link usage} / {@link quota}, or `0` when quota is unknown/zero. */
  usageRatio: number
  /** Whether the origin has been granted persistent storage. */
  persisted: boolean
}

/** `true` when this browser exposes `navigator.storage.persist`. */
export function isPersistentStorageAvailable(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.storage?.persist === 'function'
}

/**
 * Request persistent storage so offline caches are less likely to be evicted.
 *
 * @returns `true` when persistence was granted.
 */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (!isPersistentStorageAvailable()) return false
    return await navigator.storage.persist()
  } catch {
    return false
  }
}

/**
 * Read current storage usage and persistence state.
 *
 * @returns Estimate info, or `null` when `navigator.storage.estimate` is unavailable.
 */
export async function getStorageEstimate(): Promise<StorageEstimateInfo | null> {
  try {
    if (!navigator.storage?.estimate) return null
    const est = await navigator.storage.estimate()
    const usage = est.usage ?? 0
    const quota = est.quota ?? 0
    let persisted = false
    try {
      persisted = (await navigator.storage.persisted?.()) ?? false
    } catch {
      /* ignore */
    }
    return {
      usage,
      quota,
      usageRatio: quota > 0 ? usage / quota : 0,
      persisted,
    }
  } catch {
    return null
  }
}

/**
 * Human-readable byte size for UI labels.
 *
 * @param n Byte count (non-finite or negative values render as `"—"`).
 */
export function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n < 0) return '—'
  if (n < 1024) return `${Math.round(n)} B`
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`
  return `${(n / 1024 ** 3).toFixed(2)} GB`
}

/**
 * Best-effort: `true` when the Network Information API suggests a metered connection.
 *
 * Used to warn before large offline downloads on cellular or save-data mode.
 */
export function isLikelyMeteredConnection(): boolean {
  const conn = (navigator as Navigator & { connection?: { saveData?: boolean; type?: string; effectiveType?: string } })
    .connection
  if (!conn) return false
  if (conn.saveData) return true
  if (conn.type === 'cellular') return true
  return false
}
