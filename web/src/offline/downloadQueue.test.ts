import { describe, expect, it, vi, beforeEach } from 'vitest'
import { DownloadQueue } from './downloadQueue'
import type { OfflinePackStore } from './libraryPack'

function memoryStore(): OfflinePackStore & { map: Map<string, ArrayBuffer> } {
  const map = new Map<string, ArrayBuffer>()
  return {
    kind: 'sheets',
    map,
    async has(url) {
      return map.has(url)
    },
    async get(url) {
      const buf = map.get(url)
      return buf ? new Response(buf) : null
    },
    async put(url, response) {
      map.set(url, await response.arrayBuffer())
    },
    async delete(url) {
      return map.delete(url)
    },
    async clear() {
      map.clear()
    },
    async count() {
      return map.size
    },
  }
}

describe('DownloadQueue', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('rejects HTML and JSON bodies as implausible media', async () => {
    const { isPlausibleMediaBody, isPlausibleDownloadBody, isCatalogJsonPath } =
      await import('./downloadQueue')
    const html = new TextEncoder().encode('<!DOCTYPE html><html><body>x</body></html>').buffer
    const json = new TextEncoder().encode('{"ok":true,"n":1}').buffer
    const ok = new Uint8Array(96).fill(0xff).buffer
    expect(isPlausibleMediaBody(html)).toBe(false)
    expect(isPlausibleMediaBody(json)).toBe(false)
    expect(isPlausibleMediaBody(ok, 'application/json')).toBe(false)
    expect(isPlausibleMediaBody(ok, 'image/webp')).toBe(true)

    expect(isCatalogJsonPath('/tags/1/metadata.json')).toBe(true)
    expect(isCatalogJsonPath('tags/1/metadata.json')).toBe(true)
    expect(isCatalogJsonPath('sheets/1/page.webp')).toBe(false)
    expect(isPlausibleDownloadBody(json, 'application/json', '/tags/1/metadata.json')).toBe(true)
    expect(isPlausibleDownloadBody(html, 'text/html', '/tags/1/metadata.json')).toBe(false)
    expect(isPlausibleDownloadBody(json, 'application/json', 'sheets/1/page.webp')).toBe(false)
  })

  it('stores sheet-pack metadata.json (application/json) without treating it as poison', async () => {
    const store = memoryStore()
    const meta = new TextEncoder().encode(JSON.stringify({ tag_id: 1, title: 'Test' }))
    const fetchMock = vi.fn(async () => {
      return new Response(meta, {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    })
    vi.stubGlobal('fetch', fetchMock)

    const q = new DownloadQueue(store, { concurrency: 1 })
    q.setItems([
      {
        url: 'https://x/tags/1/metadata.json',
        path: '/tags/1/metadata.json',
        bytes: meta.byteLength,
      },
    ])
    await q.start()
    expect(q.getStatus()).toBe('done')
    expect(store.map.size).toBe(1)
    expect(fetchMock).toHaveBeenCalledTimes(1)

    // Re-queue from the start — cached catalog JSON must skip without re-fetch.
    q.setItems([
      {
        url: 'https://x/tags/1/metadata.json',
        path: '/tags/1/metadata.json',
        bytes: meta.byteLength,
      },
    ])
    await q.start()
    expect(q.getStatus()).toBe('done')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('downloads missing items and skips existing', async () => {
    const store = memoryStore()
    const blobA = new Uint8Array(96).fill(1)
    const blobB = new Uint8Array(96).fill(2)
    await store.put('https://x/a.webp', new Response(blobA))
    const fetchMock = vi.fn(async (url: string) => {
      expect(url).toBe('https://x/b.webp')
      return new Response(blobB, {
        status: 200,
        headers: { 'Content-Type': 'image/webp' },
      })
    })
    vi.stubGlobal('fetch', fetchMock)

    const statuses: string[] = []
    const q = new DownloadQueue(store, {
      concurrency: 2,
      onStatus: (s) => statuses.push(s),
    })
    q.setItems([
      { url: 'https://x/a.webp', path: 'a.webp', bytes: 96 },
      { url: 'https://x/b.webp', path: 'b.webp', bytes: 96 },
    ])
    await q.start()
    expect(q.getStatus()).toBe('done')
    expect(store.map.size).toBe(2)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(statuses).toContain('running')
    expect(statuses).toContain('done')
  })

  it('pauses while a fetch is in flight', async () => {
    const store = memoryStore()
    let release!: (r: Response) => void
    const gate = new Promise<Response>((r) => {
      release = r
    })
    vi.stubGlobal(
      'fetch',
      vi.fn(() => gate),
    )
    const q = new DownloadQueue(store, { concurrency: 1 })
    q.setItems([{ url: 'https://x/1', path: '1', bytes: 1 }])
    const startP = q.start()
    // Let worker enter fetch
    await Promise.resolve()
    await Promise.resolve()
    q.pause()
    release(new Response(new Uint8Array(96).fill(9), { status: 200, headers: { 'Content-Type': 'image/webp' } }))
    await startP
    expect(['paused', 'done', 'error']).toContain(q.getStatus())
  })

  it('pipelines fetches while transformConcurrency limits re-encodes', async () => {
    const store = memoryStore()
    let liveTransforms = 0
    let peakTransforms = 0
    const fetchMock = vi.fn(async (url: string) => {
      const n = Number(String(url).split('/').pop())
      return new Response(new Uint8Array(96).fill(n), {
        status: 200,
        headers: { 'Content-Type': 'audio/mp4' },
      })
    })
    vi.stubGlobal('fetch', fetchMock)

    const q = new DownloadQueue(store, {
      concurrency: 4,
      transformConcurrency: 1,
      needsTransform: (item) => item.path.startsWith('enc/'),
      transformResponse: async (item, res) => {
        liveTransforms++
        peakTransforms = Math.max(peakTransforms, liveTransforms)
        await new Promise((r) => setTimeout(r, 40))
        liveTransforms--
        const buf = await res.arrayBuffer()
        return new Response(buf, {
          status: 200,
          headers: { 'Content-Type': 'audio/ogg' },
        })
      },
    })
    q.setItems([
      { url: 'https://x/1', path: 'enc/1', bytes: 96 },
      { url: 'https://x/2', path: 'plain/2', bytes: 96 },
      { url: 'https://x/3', path: 'enc/3', bytes: 96 },
      { url: 'https://x/4', path: 'plain/4', bytes: 96 },
    ])
    await q.start()
    expect(q.getStatus()).toBe('done')
    expect(fetchMock).toHaveBeenCalledTimes(4)
    expect(peakTransforms).toBe(1)
    expect(store.map.size).toBe(4)
  })

  it('respects a shared inflight gate across fetches', async () => {
    const { InflightLimiter } = await import('./downloadConcurrency')
    const store = memoryStore()
    const inflight = new InflightLimiter(1)
    let liveFetches = 0
    let peakFetches = 0
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        liveFetches++
        peakFetches = Math.max(peakFetches, liveFetches)
        await new Promise((r) => setTimeout(r, 25))
        liveFetches--
        return new Response(new Uint8Array(96).fill(7), {
          status: 200,
          headers: { 'Content-Type': 'image/webp' },
        })
      }),
    )
    const q = new DownloadQueue(store, { concurrency: 4, inflight })
    q.setItems([
      { url: 'https://x/a', path: 'a', bytes: 96 },
      { url: 'https://x/b', path: 'b', bytes: 96 },
      { url: 'https://x/c', path: 'c', bytes: 96 },
    ])
    await q.start()
    expect(q.getStatus()).toBe('done')
    expect(peakFetches).toBe(1)
  })

  it('treats AbortError without Pause as paused, not done', async () => {
    const store = memoryStore()
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new DOMException('The operation was aborted.', 'AbortError')
      }),
    )
    const q = new DownloadQueue(store, { concurrency: 2 })
    q.setItems([
      { url: 'https://x/a', path: 'a', bytes: 96 },
      { url: 'https://x/b', path: 'b', bytes: 96 },
      { url: 'https://x/c', path: 'c', bytes: 96 },
    ])
    await q.start()
    expect(q.getStatus()).toBe('paused')
    expect(store.map.size).toBe(0)
  })
})

describe('storageEstimate formatBytes', () => {
  it('formats sizes', async () => {
    const { formatBytes } = await import('./storageEstimate')
    expect(formatBytes(500)).toMatch(/B/)
    expect(formatBytes(2048)).toMatch(/KB/)
    expect(formatBytes(3 * 1024 * 1024)).toMatch(/MB/)
  })
})
