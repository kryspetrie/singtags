/** Browser storage estimate + persistent storage request. */

export interface StorageEstimateInfo {
  usage: number
  quota: number
  usageRatio: number
  persisted: boolean
}

export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (!navigator.storage?.persist) return false
    return await navigator.storage.persist()
  } catch {
    return false
  }
}

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

export function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n < 0) return '—'
  if (n < 1024) return `${Math.round(n)} B`
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`
  return `${(n / 1024 ** 3).toFixed(2)} GB`
}

/** Best-effort: true when on a metered / cellular connection. */
export function isLikelyMeteredConnection(): boolean {
  const conn = (navigator as Navigator & { connection?: { saveData?: boolean; type?: string; effectiveType?: string } })
    .connection
  if (!conn) return false
  if (conn.saveData) return true
  if (conn.type === 'cellular') return true
  return false
}
