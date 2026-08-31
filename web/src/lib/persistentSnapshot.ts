/** Mirror JSON snapshots in sessionStorage + localStorage for offline refresh. */

/** Return localStorage and sessionStorage when available (private mode may omit one). */
function storageStores(): Storage[] {
  const out: Storage[] = []
  try {
    if (typeof localStorage !== 'undefined') out.push(localStorage)
  } catch {
    /* ignore */
  }
  try {
    if (typeof sessionStorage !== 'undefined') out.push(sessionStorage)
  } catch {
    /* ignore */
  }
  return out
}

/** Write JSON to every available browser storage mirror. */
export function savePersistentSnapshot(key: string, data: unknown): void {
  const json = JSON.stringify(data)
  for (const store of storageStores()) {
    try {
      store.setItem(key, json)
    } catch {
      /* quota or private mode */
    }
  }
}

/**
 * Read and validate a mirrored JSON snapshot from session or local storage.
 * @param validate Type guard; invalid payloads are skipped.
 */
export function loadPersistentSnapshot<T>(
  key: string,
  validate: (data: unknown) => data is T,
): T | null {
  for (const store of storageStores()) {
    try {
      const raw = store.getItem(key)
      if (!raw) continue
      const data: unknown = JSON.parse(raw)
      if (validate(data)) return data
    } catch {
      /* ignore */
    }
  }
  return null
}

/** Remove a snapshot key from all storage mirrors. */
export function clearPersistentSnapshot(key: string): void {
  for (const store of storageStores()) {
    try {
      store.removeItem(key)
    } catch {
      /* ignore */
    }
  }
}
