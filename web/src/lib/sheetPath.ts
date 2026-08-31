/**
 * Sheet path predicates: PDF vs raster image extensions (query/hash stripped).
 */

/** True when `path` looks like a PDF (ignores query/hash). */
export function isPdfPath(path: string | null | undefined): boolean {
  if (!path) return false
  const clean = path.split(/[?#]/, 1)[0] ?? path
  return clean.toLowerCase().endsWith('.pdf')
}

/** Image-like sheet paths suitable for <img> (not PDF). */
export function isImageSheetPath(path: string | null | undefined): boolean {
  if (!path || isPdfPath(path)) return false
  const clean = (path.split(/[?#]/, 1)[0] ?? path).toLowerCase()
  return /\.(webp|png|jpe?g|gif|svg|avif|bmp)$/.test(clean) || clean.startsWith('blob:') || clean.startsWith('data:')
}
