/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it, vi } from 'vitest'
import { preloadImageUrls, prefersReducedMotion } from './media'

describe('sheetViewer/media', () => {
  it('prefersReducedMotion reads matchMedia when available', () => {
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true })))
    expect(prefersReducedMotion()).toBe(true)
    vi.unstubAllGlobals()
  })

  it('preloadImageUrls resolves quickly even with no Image', async () => {
    const prev = globalThis.Image
    // @ts-expect-error test shim
    delete globalThis.Image
    await expect(preloadImageUrls(['a', 'b'])).resolves.toBeUndefined()
    globalThis.Image = prev
  })
})
