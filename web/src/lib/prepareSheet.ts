/**
 * Offscreen sheet preparation: resolve URLs, optional whitespace crop, PDF rasterization.
 * Catalog sheets are published pre-cropped — pass `crop: true` for Local Library / user uploads.
 */

import { cropImageUrl } from './contentCrop'
import { mediaUrl } from './mediaUrl'
import { renderPdfToPageUrls } from './pdfRender'
import type { SheetAssets } from './sheetAssets'

/** Result of {@link prepareDefaultSheet}: pages to show and blob URLs the caller must revoke. */
export type PreparedSheet = {
  /** Ready-to-display page URLs (may be blob:). */
  pages: string[]
  /** Blob URLs the caller must revoke. */
  owned: string[]
}

/** Resolve a catalog-relative path to an absolute fetch/display URL. */
function resolveSrc(path: string, baseUrl?: string): string {
  if (
    path.startsWith('/') ||
    path.startsWith('blob:') ||
    path.startsWith('http://') ||
    path.startsWith('https://') ||
    path.startsWith('data:')
  ) {
    return path
  }
  if (baseUrl) return `${baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`}${path}`
  return mediaUrl(path)
}

/**
 * Build display-ready sheet pages offscreen (prefer raster/images).
 * Defaults to no crop — catalog pages are pre-cropped at publish time.
 */
export async function prepareDefaultSheet(
  assets: SheetAssets,
  opts: { crop?: boolean; baseUrl?: string; signal?: AbortSignal; allowPdf?: boolean } = {},
): Promise<PreparedSheet> {
  const { crop = false, baseUrl, signal, allowPdf = true } = opts
  const imagePaths = assets.imageSets[0]?.paths ?? []

  if (imagePaths.length) {
    const raw = imagePaths.map((p) => resolveSrc(p, baseUrl))
    if (!crop) return { pages: raw, owned: [] }
    const pages: string[] = []
    const owned: string[] = []
    for (const url of raw) {
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
      const { url: next, revoke } = await cropImageUrl(url, signal)
      pages.push(next)
      if (revoke) owned.push(next)
    }
    return { pages, owned }
  }

  const pdf = allowPdf ? assets.pdfs[0] : null
  if (pdf) {
    const urls = await renderPdfToPageUrls(resolveSrc(pdf.path, baseUrl), {
      crop,
      signal,
    })
    return { pages: urls, owned: urls }
  }

  return { pages: [], owned: [] }
}

/** Revoke blob URLs listed in {@link PreparedSheet.owned}. */
export function revokePreparedSheet(prepared: PreparedSheet | null | undefined): void {
  if (!prepared) return
  for (const u of prepared.owned) URL.revokeObjectURL(u)
}

/**
 * Warm the browser image cache / decode pipeline so the first on-screen paint
 * has intrinsic dimensions (avoids sheet height 0 → Tracks jumping up).
 */
export async function preloadSheetPages(
  urls: string[],
  signal?: AbortSignal,
): Promise<void> {
  if (!urls.length || typeof Image === 'undefined') return
  await Promise.all(
    urls.map(
      (url) =>
        new Promise<void>((resolve, reject) => {
          if (signal?.aborted) {
            reject(new DOMException('Aborted', 'AbortError'))
            return
          }
          const img = new Image()
          let settled = false
          const finish = () => {
            if (settled) return
            settled = true
            clearTimeout(timer)
            signal?.removeEventListener('abort', onAbort)
            resolve()
          }
          const onAbort = () => {
            if (settled) return
            settled = true
            clearTimeout(timer)
            img.onload = null
            img.onerror = null
            reject(new DOMException('Aborted', 'AbortError'))
          }
          // Safety for test envs / hung decodes — never block tag load indefinitely.
          const timer = setTimeout(finish, 4000)
          signal?.addEventListener('abort', onAbort, { once: true })
          img.onload = () => {
            if (typeof img.decode === 'function') {
              void img.decode().then(finish, finish)
            } else {
              finish()
            }
          }
          img.onerror = finish
          img.src = url
        }),
    ),
  )
}
