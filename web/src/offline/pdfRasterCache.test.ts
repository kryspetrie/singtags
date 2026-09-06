/**
 * @vitest-environment happy-dom
 */
import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  clearPdfRasterCache,
  hasPdfRasterCached,
  loadPdfRasterObjectUrls,
  pdfRasterCacheBytes,
  pdfRasterCacheKey,
  pdfRasterMemoryHit,
  pdfRasterMemorySizeForTests,
  putPdfRasterBlobs,
  setPdfRasterCacheMaxMbForTests,
  wipePdfRasterMemoryForTests,
} from './pdfRasterCache'

describe('pdfRasterCache', () => {
  beforeEach(async () => {
    setPdfRasterCacheMaxMbForTests(256)
    await clearPdfRasterCache()
  })

  it('keys by identity, dpi, and crop', () => {
    const a = pdfRasterCacheKey('https://x/a.pdf', { crop: true })
    const b = pdfRasterCacheKey('https://x/a.pdf', { crop: false })
    const c = pdfRasterCacheKey('https://x/a.pdf', { dpi: 150, crop: true })
    const local = pdfRasterCacheKey('local-asset:abc', { crop: true })
    expect(a).not.toBe(b)
    expect(a).not.toBe(c)
    expect(a).toContain('dpi=300')
    expect(local).toContain('local-asset:abc')
  })

  it('serves memory hits as object URLs', async () => {
    const key = pdfRasterCacheKey('https://x/sheet.pdf', { crop: true })
    await putPdfRasterBlobs(key, [new Blob(['page1'], { type: 'image/webp' })])
    expect(pdfRasterMemorySizeForTests()).toBe(1)

    const urls = pdfRasterMemoryHit(key)
    expect(urls).toHaveLength(1)
    expect(urls![0]).toMatch(/^blob:/)
    for (const u of urls!) URL.revokeObjectURL(u)
  })

  it('rehydrates from IndexedDB after memory is cleared', async () => {
    const key = pdfRasterCacheKey('https://x/persist.pdf', { crop: true })
    await putPdfRasterBlobs(key, [
      new Blob(['a'], { type: 'image/webp' }),
      new Blob(['b'], { type: 'image/webp' }),
    ])

    wipePdfRasterMemoryForTests()
    expect(pdfRasterMemorySizeForTests()).toBe(0)

    const urls = await loadPdfRasterObjectUrls(key)
    expect(urls).toHaveLength(2)
    expect(pdfRasterMemorySizeForTests()).toBe(1)
    for (const u of urls!) URL.revokeObjectURL(u)
  })

  it('evicts oldest insertions first when over the byte budget (FIFO)', async () => {
    // ~1 KiB budget; each blob is ~900 bytes so the third insert should drop the first.
    setPdfRasterCacheMaxMbForTests(null)
    // Override via tiny budget: use MB=0 would disable IDB; instead put small max via
    // reading bytes — we approximate with many large blobs against a 1MB cap.
    setPdfRasterCacheMaxMbForTests(1)

    const mk = (i: number, size: number) =>
      putPdfRasterBlobs(pdfRasterCacheKey(`https://x/${i}.pdf`, { crop: true }), [
        new Blob([new Uint8Array(size)], { type: 'image/webp' }),
      ])

    await mk(0, 400_000)
    await mk(1, 400_000)
    await mk(2, 400_000)

    expect(await hasPdfRasterCached(pdfRasterCacheKey('https://x/0.pdf', { crop: true }))).toBe(
      false,
    )
    expect(await hasPdfRasterCached(pdfRasterCacheKey('https://x/2.pdf', { crop: true }))).toBe(
      true,
    )
    const used = await pdfRasterCacheBytes()
    expect(used).toBeLessThanOrEqual(1 * 1024 * 1024)
  })

  it('reports hasPdfRasterCached from memory and IDB', async () => {
    const key = pdfRasterCacheKey('https://x/has.pdf', { crop: true })
    expect(await hasPdfRasterCached(key)).toBe(false)
    await putPdfRasterBlobs(key, [new Blob(['p'], { type: 'image/webp' })])
    expect(await hasPdfRasterCached(key)).toBe(true)
    wipePdfRasterMemoryForTests()
    expect(await hasPdfRasterCached(key)).toBe(true)
  })
})
