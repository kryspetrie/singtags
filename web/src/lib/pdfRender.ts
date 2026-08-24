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

export type RenderPdfOptions = {
  /** Target CSS pixel width before devicePixelRatio. */
  targetWidth?: number
  crop?: boolean
  signal?: AbortSignal
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
  const { targetWidth = 960, crop = true, signal } = opts
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
      const dpr = typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 2) : 1
      const scale = (targetWidth / base.width) * dpr
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
