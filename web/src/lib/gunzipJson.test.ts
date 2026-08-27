import { describe, expect, it, vi, afterEach } from 'vitest'
import { parseGzipJsonBuffer, fetchGzipJson } from './gunzipJson'

describe('gunzipJson', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('parses plain JSON bytes', async () => {
    const buf = new TextEncoder().encode('{"ok":true}').buffer
    await expect(parseGzipJsonBuffer<{ ok: boolean }>(buf)).resolves.toEqual({ ok: true })
  })

  it('falls back to Cache API for fetchGzipJsonCached', async () => {
    const payload = { ok: true }
    const body = new TextEncoder().encode(JSON.stringify(payload)).buffer
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Offline mode — not cached')
      }),
    )
    vi.stubGlobal('caches', {
      open: vi.fn(async () => ({
        match: vi.fn(async () => new Response(body, { status: 200 })),
      })),
      keys: vi.fn(async () => ['singtags-indexes']),
    })
    const { fetchGzipJsonCached } = await import('./gunzipJson')
    await expect(fetchGzipJsonCached('/indexes/core.json.gz')).resolves.toEqual(payload)
  })
})
