import { renderPdfToPageUrls } from '../pdfRender'
import { loadPdfRasterObjectUrls, pdfRasterMemoryHit, putPdfRasterFromObjectUrls } from '../../offline/pdfRasterCache'
import { cacheKeyForPdf, canRasterizePdfUrl, resolveSheetSrc } from './urls'
import type { SheetPdfFile } from '../sheetAssets'

export type PdfRasterUpgradeInput = {
  pdf: SheetPdfFile
  baseUrl: string | undefined
  cropToContent: boolean
  offline: boolean
  signal: AbortSignal
  isStale: () => boolean
}

/** Load HQ PDF rasters from memory, IDB, or online render. */
export async function loadHqPdfRasterUrls(
  input: PdfRasterUpgradeInput,
): Promise<string[] | null | 'aborted'> {
  const pdfUrl = resolveSheetSrc(input.pdf.path, input.baseUrl)
  const cacheKey = cacheKeyForPdf(input.pdf, pdfUrl, input.cropToContent)

  const memHit = pdfRasterMemoryHit(cacheKey)
  if (memHit) return memHit

  try {
    const idbHit = await loadPdfRasterObjectUrls(cacheKey)
    if (input.isStale()) {
      if (idbHit) {
        for (const u of idbHit) URL.revokeObjectURL(u)
      }
      return 'aborted'
    }
    if (idbHit) return idbHit
  } catch {
    /* best-effort cache read */
  }

  if (!canRasterizePdfUrl(pdfUrl, input.offline)) return null

  try {
    const urls = await renderPdfToPageUrls(pdfUrl, {
      crop: input.cropToContent,
      signal: input.signal,
    })
    if (input.isStale()) {
      for (const u of urls) URL.revokeObjectURL(u)
      return 'aborted'
    }
    void putPdfRasterFromObjectUrls(cacheKey, urls)
    return urls
  } catch (e) {
    if (input.isStale()) return 'aborted'
    if (e instanceof DOMException && e.name === 'AbortError') return 'aborted'
    return null
  }
}
