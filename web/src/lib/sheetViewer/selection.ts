import type { SheetDisplayMode } from './types'
import type { SheetImageSet, SheetPdfFile } from '../sheetAssets'

export function syncSheetSelection(input: {
  imageSetId: string
  pdfId: string
  mode: SheetDisplayMode
  resetMode: boolean
  imageSets: SheetImageSet[]
  pdfs: SheetPdfFile[]
}): { imageSetId: string; pdfId: string; mode: SheetDisplayMode } {
  const { imageSets, pdfs, resetMode } = input
  let imageSetId = input.imageSetId
  let pdfId = input.pdfId
  let mode = input.mode

  if (!imageSets.some((s) => s.id === imageSetId)) {
    imageSetId = imageSets[0]?.id ?? ''
  }
  if (!pdfs.some((p) => p.id === pdfId)) {
    pdfId = pdfs[0]?.id ?? ''
  }

  const hasImages = imageSets.length > 0
  const hasPdf = pdfs.length > 0

  if (resetMode) {
    // Inline view prefers WebP; PDF is rasterized for fullscreen (or manual toggle).
    if (hasImages) mode = 'images'
    else if (hasPdf) mode = 'pdf'
  } else if (mode === 'images' && !hasImages && hasPdf) {
    mode = 'pdf'
  } else if (mode === 'pdf' && !hasPdf && hasImages) {
    mode = 'images'
  }

  return { imageSetId, pdfId, mode }
}
