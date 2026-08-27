import { isImageSheetPath, isPdfPath } from './sheetPath'

export type SheetImageSet = {
  id: string
  label: string
  paths: string[]
}

export type SheetPdfFile = {
  id: string
  label: string
  path: string
}

export type SheetAssets = {
  imageSets: SheetImageSet[]
  pdfs: SheetPdfFile[]
  /**
   * True only when both image uploads and PDF uploads exist.
   * Raster `sheet_pages` of a PDF do not count as a separate image source.
   */
  canChooseFormat: boolean
}

/** Basename for UI labels (`sheets/1/foo.pdf` → `foo.pdf`). */
export function sheetFileLabel(path: string): string {
  const clean = path.split(/[?#]/, 1)[0] ?? path
  const base = clean.split('/').pop() || clean
  try {
    return decodeURIComponent(base)
  } catch {
    return base
  }
}

/**
 * When raster `sheet_pages` exist, skip mirror uploads that duplicate them:
 * primary full sheet, canonical preview, and "… Sheet Preview.webp" siblings.
 */
export function isRedundantWithSheetPages(
  path: string,
  opts: {
    primary: string | null
    pages: string[]
    sheetPreview?: string | null
  },
): boolean {
  const { primary, pages, sheetPreview } = opts
  if (primary && path === primary) return true
  if (pages.includes(path)) return true
  if (sheetPreview && path === sheetPreview) return true
  if (pages.length && / Preview\.(webp|jpe?g|png)(\?|$)/i.test(path)) return true
  return false
}

/**
 * Unique original sheet uploads from legacy `sheet` and/or `sheets[]`.
 * Order: `sheets` entries first, then `sheet` if not already listed.
 */
export function originalSheetPaths(detail: {
  sheet?: string | null
  sheets?: string[] | null
}): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const p of detail.sheets ?? []) {
    if (!p || seen.has(p)) continue
    seen.add(p)
    out.push(p)
  }
  if (detail.sheet && !seen.has(detail.sheet)) {
    out.push(detail.sheet)
  }
  return out
}

export type DownloadableSheetAsset = {
  id: string
  label: string
  path: string
}

/**
 * At most one Image (prefers webp / sheet_pages) and one PDF for per-tag downloads.
 */
export function downloadableSheetAssets(detail: {
  sheet?: string | null
  sheets?: string[] | null
  sheet_pages?: string[] | null
  sheet_preview?: string | null
}): DownloadableSheetAsset[] {
  const originals = originalSheetPaths(detail)
  const pdfs = originals.filter((p) => isPdfPath(p))
  const images = originals.filter((p) => isImageSheetPath(p))
  const pages = (detail.sheet_pages ?? []).filter(Boolean)
  const out: DownloadableSheetAsset[] = []

  let imagePath: string | null = null
  if (pages.length) {
    imagePath = pages.find((p) => isImageSheetPath(p)) ?? pages[0]!
  } else {
    imagePath =
      images.find((p) => /\.webp(\?|$)/i.test(p)) ??
      (detail.sheet && isImageSheetPath(detail.sheet) ? detail.sheet : null) ??
      images[0] ??
      null
  }
  if (imagePath) {
    out.push({ id: `image-${imagePath}`, label: 'Image', path: imagePath })
  }

  if (pdfs.length === 1) {
    out.push({ id: `pdf-${pdfs[0]}`, label: 'PDF', path: pdfs[0]! })
  } else if (pdfs.length > 1) {
    for (const [i, path] of pdfs.entries()) {
      out.push({ id: `pdf-${i}-${path}`, label: 'PDF', path })
    }
  }

  if (!out.length && pages.length) {
    out.push({
      id: `page-${pages[0]}`,
      label: pages.length > 1 ? 'Pages' : 'Image',
      path: pages[0]!,
    })
  }

  return out
}

/**
 * Build selectable image sets + PDF files for the sheet viewer.
 *
 * - Raster `sheet_pages` are the preferred on-screen view of the primary sheet.
 * - The primary `sheet` image is omitted when pages exist (pages are that raster).
 * - Images|PDF toggle only when both image uploads and PDF uploads exist
 *   (pages rasterized from a PDF are not a second “image” source).
 */
export function resolveSheetAssets(detail: {
  sheet?: string | null
  sheets?: string[] | null
  sheet_pages?: string[] | null
  sheet_preview?: string | null
}): SheetAssets {
  const originals = originalSheetPaths(detail)
  const pdfPaths = originals.filter((p) => isPdfPath(p))
  const imagePaths = originals.filter((p) => isImageSheetPath(p))
  const pages = (detail.sheet_pages ?? []).filter(Boolean)
  const primary = detail.sheet ?? null
  const canChooseFormat = pdfPaths.length > 0 && imagePaths.length > 0
  const redundant = (path: string) =>
    isRedundantWithSheetPages(path, {
      primary,
      pages,
      sheetPreview: detail.sheet_preview ?? null,
    })

  const imageSets: SheetImageSet[] = []
  if (pages.length) {
    imageSets.push({
      id: 'pages',
      label: pages.length > 1 ? `Pages (${pages.length})` : 'Pages',
      paths: pages,
    })
    for (const [i, path] of imagePaths.entries()) {
      if (redundant(path)) continue
      imageSets.push({
        id: `image-${i}-${path}`,
        label: sheetFileLabel(path),
        paths: [path],
      })
    }
  } else if (imagePaths.length) {
    imageSets.push({
      id: 'images',
      label:
        imagePaths.length > 1
          ? `Images (${imagePaths.length})`
          : sheetFileLabel(imagePaths[0]!),
      paths: imagePaths,
    })
  }

  const pdfs: SheetPdfFile[] = pdfPaths.map((path, i) => ({
    id: `pdf-${i}-${path}`,
    label: sheetFileLabel(path),
    path,
  }))

  return { imageSets, pdfs, canChooseFormat }
}
