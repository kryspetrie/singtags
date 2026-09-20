/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it, vi } from 'vitest'
import { bakeSheetImageUrls, sheetFxNeeded } from './sheetFxBake'

vi.mock('../sheetErode', () => ({
  processSheetImageUrl: vi.fn(async (src: string) => `blob:${src}`),
}))

describe('sheetViewer/sheetFxBake', () => {
  it('sheetFxNeeded is true when invert or params set', () => {
    expect(sheetFxNeeded(null, true)).toBe(true)
    expect(sheetFxNeeded({ radius: 1, amount: 1 } as never, false)).toBe(true)
    expect(sheetFxNeeded(null, false)).toBe(false)
  })

  it('bakeSheetImageUrls processes base and upgrade layers', async () => {
    const result = await bakeSheetImageUrls({
      bases: ['a.webp'],
      upgrades: ['b.webp'],
      params: null,
      invert: true,
      isStale: () => false,
    })
    expect(result).toEqual({
      pages: ['blob:a.webp'],
      upgrades: ['blob:b.webp'],
      owned: ['blob:a.webp', 'blob:b.webp'],
    })
  })

  it('bakeSheetImageUrls aborts when stale', async () => {
    let stale = false
    const result = await bakeSheetImageUrls({
      bases: ['a.webp', 'c.webp'],
      upgrades: null,
      params: null,
      invert: false,
      isStale: () => stale,
    })
    expect(result).not.toBe('stale')
    stale = true
    const aborted = await bakeSheetImageUrls({
      bases: ['a.webp'],
      upgrades: null,
      params: null,
      invert: false,
      isStale: () => true,
    })
    expect(aborted).toBe('stale')
  })
})
