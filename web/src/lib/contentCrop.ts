/** Detect ink bounds on a mostly-white sheet page and crop whitespace. */

export type ContentBounds = { x: number; y: number; w: number; h: number }

/**
 * Find the bounding box of non-near-white pixels (sheet ink).
 * Returns null when the page is empty or already tight (crop would save little area).
 */
export function findContentBounds(
  image: ImageData,
  opts?: { threshold?: number; paddingRatio?: number; minAreaSavings?: number },
): ContentBounds | null {
  const threshold = opts?.threshold ?? 250
  const paddingRatio = opts?.paddingRatio ?? 0.012
  const minAreaSavings = opts?.minAreaSavings ?? 0.04
  const { width, height, data } = image

  let minX = width
  let minY = height
  let maxX = -1
  let maxY = -1

  // Coarse scan (every 2nd pixel) — sheets are large; ink is dense enough.
  const step = width * height > 800_000 ? 2 : 1
  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const i = (y * width + x) * 4
      const a = data[i + 3]!
      if (a < 10) continue
      const r = data[i]!
      const g = data[i + 1]!
      const b = data[i + 2]!
      // Near-white paper (allow slight gray / warm scans).
      if (r < threshold || g < threshold || b < threshold) {
        if (x < minX) minX = x
        if (y < minY) minY = y
        if (x > maxX) maxX = x
        if (y > maxY) maxY = y
      }
    }
  }

  if (maxX < 0) return null

  const padX = Math.max(2, Math.round(width * paddingRatio))
  const padY = Math.max(2, Math.round(height * paddingRatio))
  minX = Math.max(0, minX - padX)
  minY = Math.max(0, minY - padY)
  maxX = Math.min(width - 1, maxX + padX)
  maxY = Math.min(height - 1, maxY + padY)

  const w = maxX - minX + 1
  const h = maxY - minY + 1
  const areaRatio = (w * h) / (width * height)
  if (areaRatio > 1 - minAreaSavings) return null
  return { x: minX, y: minY, w, h }
}

export function cropCanvas(
  source: HTMLCanvasElement | OffscreenCanvas,
  bounds: ContentBounds,
): HTMLCanvasElement {
  const out = document.createElement('canvas')
  out.width = bounds.w
  out.height = bounds.h
  const ctx = out.getContext('2d')
  if (!ctx) return out
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, bounds.w, bounds.h)
  ctx.drawImage(
    source as CanvasImageSource,
    bounds.x,
    bounds.y,
    bounds.w,
    bounds.h,
    0,
    0,
    bounds.w,
    bounds.h,
  )
  return out
}

function canvasToBlobUrl(canvas: HTMLCanvasElement): Promise<string> {
  return new Promise((resolve, reject) => {
    const done = (blob: Blob | null) => {
      if (!blob) {
        reject(new Error('Could not encode cropped page'))
        return
      }
      resolve(URL.createObjectURL(blob))
    }
    // Prefer WebP; fall back to PNG when the browser won't encode WebP from canvas.
    canvas.toBlob((blob) => {
      if (blob) done(blob)
      else canvas.toBlob(done, 'image/png')
    }, 'image/webp', 0.92)
  })
}

function isAbort(e: unknown): boolean {
  return e instanceof DOMException && e.name === 'AbortError'
}

/** Load pixels onto a canvas via fetch→blob so getImageData is never CORS-tainted. */
export async function loadImageToCanvas(
  url: string,
  signal?: AbortSignal,
): Promise<HTMLCanvasElement> {
  let objectUrl: string | null = null
  try {
    let src = url
    if (!url.startsWith('blob:') && !url.startsWith('data:')) {
      const res = await fetch(url, { signal, credentials: 'same-origin' })
      if (!res.ok) throw new Error('Failed to load sheet image')
      objectUrl = URL.createObjectURL(await res.blob())
      src = objectUrl
    }

    const img = new Image()
    img.decoding = 'async'
    await new Promise<void>((resolve, reject) => {
      const onAbort = () => reject(new DOMException('Aborted', 'AbortError'))
      if (signal?.aborted) {
        onAbort()
        return
      }
      signal?.addEventListener('abort', onAbort, { once: true })
      img.onload = () => {
        signal?.removeEventListener('abort', onAbort)
        resolve()
      }
      img.onerror = () => {
        signal?.removeEventListener('abort', onAbort)
        reject(new Error('Failed to load sheet image'))
      }
      img.src = src
    })

    const canvas = document.createElement('canvas')
    canvas.width = img.naturalWidth || img.width
    canvas.height = img.naturalHeight || img.height
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) throw new Error('No 2d context')
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(img, 0, 0)
    return canvas
  } finally {
    if (objectUrl) URL.revokeObjectURL(objectUrl)
  }
}

/**
 * Return a blob URL cropped to content, or the original URL if crop is
 * unnecessary / impossible.
 */
export async function cropImageUrl(
  url: string,
  signal?: AbortSignal,
): Promise<{ url: string; revoke: boolean }> {
  try {
    const canvas = await loadImageToCanvas(url, signal)
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) return { url, revoke: false }
    const bounds = findContentBounds(ctx.getImageData(0, 0, canvas.width, canvas.height))
    if (!bounds) return { url, revoke: false }
    const cropped = cropCanvas(canvas, bounds)
    const blobUrl = await canvasToBlobUrl(cropped)
    return { url: blobUrl, revoke: true }
  } catch (e) {
    if (isAbort(e)) throw e
    return { url, revoke: false }
  }
}

/** Crop an already-drawn canvas; returns blob URL (always revoke). */
export async function cropDrawnCanvas(
  canvas: HTMLCanvasElement,
  signal?: AbortSignal,
): Promise<string> {
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
  try {
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) return canvasToBlobUrl(canvas)
    const bounds = findContentBounds(ctx.getImageData(0, 0, canvas.width, canvas.height))
    const out = bounds ? cropCanvas(canvas, bounds) : canvas
    return canvasToBlobUrl(out)
  } catch (e) {
    if (isAbort(e)) throw e
    return canvasToBlobUrl(canvas)
  }
}
