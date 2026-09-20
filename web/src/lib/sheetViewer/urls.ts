import { mediaUrl } from '../mediaUrl'
import { pdfRasterCacheKey } from '../../offline/pdfRasterCache'
import type { SheetPdfFile } from '../sheetAssets'

/** Resolve a sheet asset path to a fetchable URL. */
export function resolveSheetSrc(path: string, base?: string): string {
  if (
    path.startsWith('/') ||
    path.startsWith('blob:') ||
    path.startsWith('http://') ||
    path.startsWith('https://') ||
    path.startsWith('data:')
  ) {
    return path
  }
  if (base) return `${base.endsWith('/') ? base : base + '/'}${path}`
  return mediaUrl(path)
}

/** Offline mode still allows pdf.js when the PDF bytes are already local. */
export function canRasterizePdfUrl(pdfUrl: string, offline: boolean): boolean {
  if (!offline) return true
  return pdfUrl.startsWith('blob:') || pdfUrl.startsWith('data:')
}

export function pdfRasterIdentity(pdf: SheetPdfFile, pdfUrl: string): string {
  const stable = pdf.cacheKey?.trim()
  return stable || pdfUrl
}

export function cacheKeyForPdf(
  pdf: SheetPdfFile,
  pdfUrl: string,
  cropToContent: boolean,
): string {
  return pdfRasterCacheKey(pdfRasterIdentity(pdf, pdfUrl), { crop: cropToContent })
}
