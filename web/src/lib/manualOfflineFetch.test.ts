import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  allowServiceWorkerFetch,
  ensureFetchPatchInstalled,
  isManualOfflineFetchBlocked,
  matchOfflineCache,
  setManualOfflineFetch,
} from './manualOfflineFetch'

describe('manualOfflineFetch', () => {
  afterEach(() => {
    setManualOfflineFetch(false)
    vi.unstubAllGlobals()
  })

  it('blocks fetch when manual offline and nothing is cached', async () => {
    ensureFetchPatchInstalled()
    setManualOfflineFetch(true)
    expect(isManualOfflineFetchBlocked()).toBe(true)
    await expect(fetch('https://example.com/test')).rejects.toThrow(/not cached/)
    setManualOfflineFetch(false)
    expect(isManualOfflineFetchBlocked()).toBe(false)
  })

  it('serves fetch from Cache API when manual offline', async () => {
    const url = 'http://localhost/indexes/core.json.gz'
    const body = '{"tags":[]}'
    const match = vi.fn(async (u: string) =>
      u === url ? new Response(body, { status: 200 }) : null,
    )
    vi.stubGlobal('caches', {
      open: vi.fn(async () => ({ match })),
      keys: vi.fn(async () => ['singtags-indexes']),
    })
    ensureFetchPatchInstalled()
    setManualOfflineFetch(true)
    const res = await fetch(url)
    expect(await res.text()).toBe(body)
    expect(match).toHaveBeenCalled()
  })

  it('matchOfflineCache returns null when caches API missing', async () => {
    vi.stubGlobal('caches', undefined)
    await expect(matchOfflineCache('http://localhost/x')).resolves.toBeNull()
  })

  it('allows fetch of blob URLs when manual offline', async () => {
    const blobFetch = vi.fn(async () => new Response(new Uint8Array([1, 2, 3])))
    vi.stubGlobal('fetch', blobFetch)
    ensureFetchPatchInstalled()
    setManualOfflineFetch(true)
    const blob = URL.createObjectURL(new Blob([1, 2, 3]))
    try {
      const res = await fetch(blob)
      expect(res.ok).toBe(true)
      expect(blobFetch).toHaveBeenCalled()
    } finally {
      URL.revokeObjectURL(blob)
    }
  })

  it('falls through to native fetch for precached app chunks when offline', async () => {
    const chunkUrl = 'http://localhost/assets/TagView-abc123.js'
    const native = vi.fn(async () => new Response('export {}', { status: 200 }))
    vi.stubGlobal('caches', {
      open: vi.fn(async () => ({ match: vi.fn(async () => null) })),
      keys: vi.fn(async () => []),
    })
    vi.stubGlobal('fetch', native)
    ensureFetchPatchInstalled()
    setManualOfflineFetch(true)
    const res = await fetch(chunkUrl)
    expect(res.ok).toBe(true)
    expect(native).toHaveBeenCalledWith(chunkUrl, undefined)
  })

  it('still blocks uncached media when offline', async () => {
    const mediaUrl = 'http://localhost/library/Some%20Tag/lead.m4a'
    const native = vi.fn(async () => new Response('', { status: 200 }))
    vi.stubGlobal('caches', {
      open: vi.fn(async () => ({ match: vi.fn(async () => null) })),
      keys: vi.fn(async () => []),
    })
    vi.stubGlobal('fetch', native)
    ensureFetchPatchInstalled()
    setManualOfflineFetch(true)
    await expect(fetch(mediaUrl)).rejects.toThrow(/not cached/)
    expect(native).not.toHaveBeenCalled()
  })

  it('allowServiceWorkerFetch permits metadata but not sheet images', () => {
    expect(allowServiceWorkerFetch('http://localhost/tags/31/metadata.json')).toBe(true)
    expect(allowServiceWorkerFetch('http://localhost/library/Some%20Tag/Sheet.png')).toBe(false)
  })
})
