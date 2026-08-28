/**
 * Lazy PDF → page image blobs (no Acrobat chrome).
 * pdf.js is imported only when a PDF is opened.
 */
import { cropDrawnCanvas } from './contentCrop'

let workerReady = false

async function loadPdfJs() {
  const pdfjs = await import('pdfjs-dist')
  if (!workerReady) {
    pdfjs.GlobalWorkerOptions.workerSrc = new URL(
      'pdfjs-dist/build/pdf.worker.min.mjs',
      import.meta.url,
    ).toString()
    workerReady = true
  }
  return pdfjs
}

/** PDF user units are 1/72″. Viewport scale 1 ⇒ 72 DPI. */
export const PDF_USER_SPACE_DPI = 72

/**
 * Default client-side PDF render resolution — much sharper than the cached
 * 2-bit WebP sheet previews used for browse/offline.
 */
export const DEFAULT_PDF_RENDER_DPI = 300

/** Soft cap on the longest canvas edge to limit peak memory on large pages. */
export const MAX_PDF_CANVAS_EDGE = 8192

export type RenderPdfOptions = {
  /**
   * Render resolution in DPI (default {@link DEFAULT_PDF_RENDER_DPI}).
   * Independent of devicePixelRatio — 300 DPI already exceeds typical screen density.
   */
  dpi?: number
  /**
   * @deprecated Prefer {@link RenderPdfOptions.dpi}. When set without `dpi`,
   * scales so the page width is about this many CSS pixels (× dpr, capped).
   */
  targetWidth?: number
  crop?: boolean
  signal?: AbortSignal
}

/**
 * pdf.js viewport scale for a page sized `baseW`×`baseH` at scale 1 (PDF points).
 */
export function pdfRenderScale(
  baseW: number,
  baseH: number,
  opts: { dpi?: number; targetWidth?: number } = {},
): number {
  const dpi = opts.dpi ?? (opts.targetWidth != null ? null : DEFAULT_PDF_RENDER_DPI)
  let scale: number
  if (dpi != null) {
    scale = dpi / PDF_USER_SPACE_DPI
  } else {
    const dpr = typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 2) : 1
    scale = ((opts.targetWidth ?? 960) / baseW) * dpr
  }
  const longest = Math.max(baseW * scale, baseH * scale)
  if (longest > MAX_PDF_CANVAS_EDGE) {
    scale *= MAX_PDF_CANVAS_EDGE / longest
  }
  return scale
}

function canvasToUrl(canvas: HTMLCanvasElement): Promise<string> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) reject(new Error('Could not encode PDF page'))
        else resolve(URL.createObjectURL(blob))
      },
      'image/webp',
      0.92,
    )
  })
}

/**
 * Render each PDF page to a cropped (optional) WebP blob URL.
 * Caller must revoke the returned URLs when done.
 */
export async function renderPdfToPageUrls(
  url: string,
  opts: RenderPdfOptions = {},
): Promise<string[]> {
  const { dpi, targetWidth, crop = true, signal } = opts
  const pdfjs = await loadPdfJs()
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')

  const loadingTask = pdfjs.getDocument({ url, withCredentials: false })
  if (signal) {
    signal.addEventListener(
      'abort',
      () => {
        void loadingTask.destroy()
      },
      { once: true },
    )
  }
  const pdf = await loadingTask.promise
  if (signal?.aborted) {
    await pdf.destroy()
    throw new DOMException('Aborted', 'AbortError')
  }

  const urls: string[] = []
  try {
    for (let n = 1; n <= pdf.numPages; n++) {
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
      const page = await pdf.getPage(n)
      const base = page.getViewport({ scale: 1 })
      const scale = pdfRenderScale(base.width, base.height, { dpi, targetWidth })
      const viewport = page.getViewport({ scale })
      const canvas = document.createElement('canvas')
      canvas.width = Math.ceil(viewport.width)
      canvas.height = Math.ceil(viewport.height)
      const ctx = canvas.getContext('2d', { willReadFrequently: true })
      if (!ctx) throw new Error('No 2d context')
      ctx.fillStyle = '#fff'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      const renderTask = page.render({
        canvasContext: ctx,
        viewport,
        background: '#ffffff',
        annotationMode: pdfjs.AnnotationMode?.DISABLE ?? 0,
      })
      await renderTask.promise
      try {
        page.cleanup()
      } catch {
        /* ignore */
      }
      const pageUrl = crop ? await cropDrawnCanvas(canvas, signal) : await canvasToUrl(canvas)
      urls.push(pageUrl)
    }
  } catch (e) {
    for (const u of urls) URL.revokeObjectURL(u)
    throw e
  } finally {
    await pdf.destroy()
  }
  return urls
}
