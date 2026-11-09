/** Parse JSON from a gzip or plain UTF-8 buffer. */
export async function parseGzipJsonBuffer<T>(buf: ArrayBuffer): Promise<T> {
  const bytes = new Uint8Array(buf)
  const isGzip = bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b
  let text: string
  if (isGzip) {
    const ds = new DecompressionStream('gzip')
    const stream = new Response(buf).body!.pipeThrough(ds)
    text = await new Response(stream).text()
  } else {
    text = new TextDecoder().decode(bytes)
  }
  return JSON.parse(text) as T
}

/** Fetch a gzip/plain body, falling back to the offline Cache API. */
export async function fetchGzipArrayBuffer(url: string): Promise<ArrayBuffer> {
  try {
    const res = await fetch(url)
    if (!res.ok) throw new Error(`Failed to load ${url} (${res.status})`)
    return await res.arrayBuffer()
  } catch (err) {
    try {
      const { matchOfflineCache } = await import('./manualOfflineFetch')
      const cached = await matchOfflineCache(url)
      if (cached) return await cached.arrayBuffer()
    } catch {
      /* ignore */
    }
    if (err instanceof Error) throw err
    throw new Error(`Failed to load ${url}`)
  }
}

/**
 * SHA-1 of response bytes so a refresh can skip parsing and reindexing
 * when the published file has not changed. Null when SubtleCrypto is missing.
 */
export async function digestSha1Hex(buf: ArrayBuffer): Promise<string | null> {
  try {
    const subtle = globalThis.crypto?.subtle
    if (!subtle) return null
    const digest = await subtle.digest('SHA-1', buf)
    return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
  } catch {
    return null
  }
}

/** Fetch JSON from a URL (gzip or plain UTF-8 body). */
export async function fetchGzipJson<T>(url: string): Promise<T> {
  return parseGzipJsonBuffer<T>(await fetchGzipArrayBuffer(url))
}

/** fetch → Cache API fallback (manual offline / airplane mode). */
export async function fetchGzipJsonCached<T>(url: string): Promise<T> {
  try {
    return await fetchGzipJson<T>(url)
  } catch {
    const { matchOfflineCache } = await import('./manualOfflineFetch')
    const cached = await matchOfflineCache(url)
    if (cached) {
      return parseGzipJsonBuffer<T>(await cached.arrayBuffer())
    }
    throw new Error(`Failed to load ${url}`)
  }
}

/** Plain JSON with Cache API fallback. */
export async function fetchJsonCached<T>(url: string, fallback: T): Promise<T> {
  try {
    const res = await fetch(url)
    if (!res.ok) return fallback
    return (await res.json()) as T
  } catch {
    try {
      const { matchOfflineCache } = await import('./manualOfflineFetch')
      const cached = await matchOfflineCache(url)
      if (cached) return (await cached.json()) as T
    } catch {
      /* ignore */
    }
    return fallback
  }
}
