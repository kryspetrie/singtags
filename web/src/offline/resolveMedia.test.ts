import { describe, expect, it, vi, beforeEach } from 'vitest'
import { mediaUrl } from '../lib/mediaUrl'

vi.mock('./starredDb', () => ({
  getStarred: vi.fn(async () => undefined),
  blobUrlFromCached: vi.fn(),
}))

vi.mock('./libraryPack', () => {
  const sheets = new Map<string, ArrayBuffer>()
  return {
    sheetsPack: {
      kind: 'sheets',
      has: async (url: string) => sheets.has(url),
      get: async (url: string) => (sheets.has(url) ? new Response(sheets.get(url)) : null),
      put: async (url: string, res: Response) => {
        sheets.set(url, await res.arrayBuffer())
      },
      delete: async () => true,
      clear: async () => sheets.clear(),
      count: async () => sheets.size,
      __sheets: sheets,
    },
    audioPack: {
      kind: 'audio',
      has: async () => false,
      get: async () => null,
      put: async () => {},
      delete: async () => false,
      clear: async () => {},
      count: async () => 0,
    },
  }
})

describe('resolvePathUrl', () => {
  beforeEach(async () => {
    const { sheetsPack } = await import('./libraryPack')
    await sheetsPack.clear()
  })

  it('returns network URL when nothing cached', async () => {
    const { resolvePathUrl } = await import('./resolveMedia')
    const r = await resolvePathUrl('sheets/1/pages/page-01.webp')
    expect(r?.kind).toBe('network')
    expect(r?.url).toBe(mediaUrl('sheets/1/pages/page-01.webp'))
  })

  it('returns pack blob when cached', async () => {
    const { sheetsPack } = await import('./libraryPack')
    const { resolvePathUrl } = await import('./resolveMedia')
    const url = mediaUrl('sheets/1/pages/page-01.webp')
    await sheetsPack.put(url, new Response(new Uint8Array([1, 2, 3]), {
      headers: { 'Content-Type': 'image/webp' },
    }))
    const r = await resolvePathUrl('sheets/1/pages/page-01.webp', { offlineOnly: true })
    expect(r?.kind).toBe('blob')
    expect(r?.source).toBe('pack')
    if (r?.kind === 'blob') URL.revokeObjectURL(r.url)
  })

  it('returns null offlineOnly when missing', async () => {
    const { resolvePathUrl } = await import('./resolveMedia')
    const r = await resolvePathUrl('sheets/9/pages/page-01.webp', { offlineOnly: true })
    expect(r).toBeNull()
  })
})
