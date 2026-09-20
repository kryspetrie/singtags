import type { SheetImageSet, SheetPdfFile } from '../sheetAssets'
import type { SheetDisplayMode } from './types'

export function sheetHasImages(imageSets: SheetImageSet[]): boolean {
  return imageSets.length > 0
}

export function sheetHasPdf(pdfs: SheetPdfFile[]): boolean {
  return pdfs.length > 0
}

export function sheetShowFormatToggle(
  canChooseFormat: boolean,
  hasImages: boolean,
  hasPdf: boolean,
): boolean {
  return canChooseFormat && hasImages && hasPdf
}

export function sheetCanChooseImageSet(mode: SheetDisplayMode, imageSets: SheetImageSet[]): boolean {
  return mode === 'images' && imageSets.length > 1
}

export function sheetCanChoosePdf(mode: SheetDisplayMode, pdfs: SheetPdfFile[]): boolean {
  return mode === 'pdf' && pdfs.length > 1
}

export function sheetShowPickers(
  showFormatToggle: boolean,
  canChooseImageSet: boolean,
  canChoosePdf: boolean,
): boolean {
  return showFormatToggle || canChooseImageSet || canChoosePdf
}

export function pickActiveImageSet(
  imageSets: SheetImageSet[],
  imageSetId: string,
): SheetImageSet | null {
  return imageSets.find((s) => s.id === imageSetId) ?? imageSets[0] ?? null
}

export function pickActivePdf(pdfs: SheetPdfFile[], pdfId: string): SheetPdfFile | null {
  return pdfs.find((p) => p.id === pdfId) ?? pdfs[0] ?? null
}

export function isShowingPdf(mode: SheetDisplayMode, hasPdf: boolean): boolean {
  return mode === 'pdf' && hasPdf
}

export function pageDisplaySrc(
  needsFx: boolean,
  baked: string[] | null | undefined,
  index: number,
  fallback: string,
): string {
  if (needsFx) return baked?.[index] ?? ''
  return fallback
}
