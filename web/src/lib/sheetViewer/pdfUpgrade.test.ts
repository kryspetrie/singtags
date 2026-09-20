/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { loadHqPdfRasterUrls } from './pdfUpgrade'

vi.mock('../pdfRender', () => ({
  renderPdfToPageUrls: vi.fn(async () => ['blob:rendered']),
}))

vi.mock('../../offline/pdfRasterCache', () => ({
  pdfRasterMemoryHit: vi.fn(() => null),
  loadPdfRasterObjectUrls: vi.fn(async () => null),
  putPdfRasterFromObjectUrls: vi.fn(),
  pdfRasterCacheKey: vi.fn(() => 'mock-key'),
}))

describe('sheetViewer/pdfUpgrade', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns memory hit without rendering', async () => {
    const { pdfRasterMemoryHit } = await import('../../offline/pdfRasterCache')
    vi.mocked(pdfRasterMemoryHit).mockReturnValueOnce(['blob:mem'])
    const urls = await loadHqPdfRasterUrls({
      pdf: { id: 'p', label: 'P', path: 'a.pdf' },
      baseUrl: '/library/',
      cropToContent: false,
      offline: false,
      signal: new AbortController().signal,
      isStale: () => false,
    })
    expect(urls).toEqual(['blob:mem'])
  })

  it('returns null when offline and remote PDF cannot rasterize', async () => {
    const urls = await loadHqPdfRasterUrls({
      pdf: { id: 'p', label: 'P', path: 'remote.pdf' },
      baseUrl: 'https://cdn.example/lib/',
      cropToContent: false,
      offline: true,
      signal: new AbortController().signal,
      isStale: () => false,
    })
    expect(urls).toBeNull()
  })
})
