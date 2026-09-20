import type { SheetImageSet, SheetPdfFile } from '../sheetAssets'

export function resolveImageSets(
  imageSets: SheetImageSet[],
  pages: string[],
): SheetImageSet[] {
  if (imageSets.length) return imageSets
  if (pages.length) {
    return [
      {
        id: 'pages',
        label: pages.length > 1 ? `Pages (${pages.length})` : 'Pages',
        paths: pages,
      },
    ]
  }
  return []
}

export function resolvePdfs(pdfs: SheetPdfFile[], pdf: string | null): SheetPdfFile[] {
  if (pdfs.length) return pdfs
  if (pdf) {
    return [{ id: 'pdf', label: 'PDF', path: pdf }]
  }
  return []
}
