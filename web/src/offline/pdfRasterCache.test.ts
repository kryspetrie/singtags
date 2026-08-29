/**
 * @vitest-environment happy-dom
 */
import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  clearPdfRasterCache,
  loadPdfRasterObjectUrls,
  MAX_PDF_RASTER_ENTRIES,
  pdfRasterCacheKey,
  pdfRasterMemoryHit,
  pdfRasterMemorySizeForTests,
  putPdfRasterBlobs,
  wipePdfRasterMemoryForTests,
} from './pdfRasterCache'

describe('pdfRasterCache', () => {
  beforeEach(async () => {
    await clearPdfRasterCache()
  })

  it('keys by url, dpi, and crop', () => {
    const a = pdfRasterCacheKey('https://x/a.pdf', { crop: true })
    const b = pdfRasterCacheKey('https://x/a.pdf', { crop: false })
    const c = pdfRasterCacheKey('https://x/a.pdf', { dpi: 150, crop: true })
    expect(a).not.toBe(b)
    expect(a).not.toBe(c)
    expect(a).toContain('dpi=300')
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

  it('evicts LRU entries beyond the cap', async () => {
    for (let i = 0; i < MAX_PDF_RASTER_ENTRIES + 3; i++) {
      const key = pdfRasterCacheKey(`https://x/${i}.pdf`, { crop: true })
      await putPdfRasterBlobs(key, [new Blob([`p${i}`], { type: 'image/webp' })])
    }
    expect(pdfRasterMemorySizeForTests()).toBeLessThanOrEqual(MAX_PDF_RASTER_ENTRIES)

    const oldest = pdfRasterCacheKey('https://x/0.pdf', { crop: true })
    expect(pdfRasterMemoryHit(oldest)).toBeNull()
    const newest = pdfRasterCacheKey(`https://x/${MAX_PDF_RASTER_ENTRIES + 2}.pdf`, {
      crop: true,
    })
    const hit = pdfRasterMemoryHit(newest)
    expect(hit).not.toBeNull()
    for (const u of hit!) URL.revokeObjectURL(u)
  })
})
