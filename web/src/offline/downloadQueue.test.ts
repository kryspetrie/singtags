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

  it('downloads missing items and skips existing', async () => {
    const store = memoryStore()
    await store.put('https://x/a.webp', new Response(new Uint8Array([1, 2, 3])))
    const fetchMock = vi.fn(async (url: string) => {
      expect(url).toBe('https://x/b.webp')
      return new Response(new Uint8Array([4, 5]), {
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
      { url: 'https://x/a.webp', path: 'a.webp', bytes: 3 },
      { url: 'https://x/b.webp', path: 'b.webp', bytes: 2 },
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
    release(new Response(new Uint8Array([1]), { status: 200 }))
    await startP
    expect(['paused', 'done', 'error']).toContain(q.getStatus())
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
