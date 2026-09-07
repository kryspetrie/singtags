/**
 * @vitest-environment happy-dom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPackStore, resetOpenCacheMemoForTests } from './libraryPack'

/** Cache whose entries survive `caches.delete` if a handle is still held (zombie). */
function installZombieProneCaches(): void {
  class MockCache {
    store = new Map<string, Response>()
    async keys(): Promise<Request[]> {
      return [...this.store.keys()].map((url) => new Request(url))
    }
    async put(req: RequestInfo, res: Response): Promise<void> {
      const url = typeof req === 'string' ? req : req.url
      this.store.set(url, res.clone())
    }
    async match(req: RequestInfo): Promise<Response | undefined> {
      const url = typeof req === 'string' ? req : req.url
      return this.store.get(url)?.clone()
    }
    async delete(req: RequestInfo): Promise<boolean> {
      const url = typeof req === 'string' ? req : req.url
      return this.store.delete(url)
    }
  }

  const alive = new Map<string, MockCache>()
  const orphans = new Set<MockCache>()

  vi.stubGlobal('caches', {
    async open(name: string): Promise<Cache> {
      let c = alive.get(name)
      if (!c) {
        c = new MockCache()
        alive.set(name, c)
      }
      return c as unknown as Cache
    },
    async delete(name: string): Promise<boolean> {
      const c = alive.get(name)
      if (!c) return false
      alive.delete(name)
      orphans.add(c)
      // Intentionally do not clear `c.store` — mimics a deleted Cache still held by JS.
      return true
    },
  })
}

describe('libraryPack pathname index', () => {
  beforeEach(() => {
    resetOpenCacheMemoForTests()
    vi.stubGlobal('caches', undefined)
  })

  it('resolves relative lookup after absolute put without rescanning', async () => {
    const pack = createPackStore('audio')
    await pack.clear()
    const absolute = 'http://127.0.0.1:5173/library/media/1/lead.solo.opus'
    const relative = '/library/media/1/lead.solo.opus'
    const body = new Uint8Array([1, 2, 3, 4])
    await pack.put(
      absolute,
      new Response(body, { headers: { 'Content-Type': 'audio/ogg' } }),
    )

    const listSpy = vi.spyOn(pack, 'listUrls')
    const hit = await pack.get(relative)
    expect(hit).not.toBeNull()
    expect(new Uint8Array(await hit!.arrayBuffer())).toEqual(body)
    // Pathname index must answer misses without calling listUrls on the hot path.
    expect(listSpy).not.toHaveBeenCalled()
    listSpy.mockRestore()
    await pack.clear()
  })
})

describe('libraryPack clear', () => {
  beforeEach(() => {
    resetOpenCacheMemoForTests()
    installZombieProneCaches()
  })

  it('clear zeros count even when caches.delete leaves a zombie handle', async () => {
    const pack = createPackStore('audio')
    const url = 'http://127.0.0.1:5173/library/media/1/lead.solo.opus'
    await pack.put(url, new Response(new Uint8Array([9, 9, 9]), { status: 200 }))
    expect(await pack.count()).toBe(1)
    expect(await pack.totalBytes()).toBe(3)

    await pack.clear()

    expect(await pack.count()).toBe(0)
    expect(await pack.totalBytes()).toBe(0)
    expect(await pack.listUrls()).toEqual([])
  })

  it('put after clear lands in a fresh cache', async () => {
    const pack = createPackStore('audio')
    const url = 'http://127.0.0.1:5173/library/media/2/bass.solo.opus'
    await pack.put(url, new Response(new Uint8Array([1]), { status: 200 }))
    await pack.clear()
    await pack.put(url, new Response(new Uint8Array([2, 2]), { status: 200 }))
    expect(await pack.count()).toBe(1)
    expect(await pack.totalBytes()).toBe(2)
    await pack.clear()
  })
})
