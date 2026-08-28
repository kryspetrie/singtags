/** Detect ink bounds on a mostly-white sheet page and crop whitespace. */

export type ContentBounds = { x: number; y: number; w: number; h: number }

type ComponentBox = { x0: number; y0: number; x1: number; y1: number; size: number }

/**
 * Union-find connected components on a binary mask (1 = ink).
 * 4-connected. Returns 1-based labels (0 = background) and per-label sizes.
 */
function labelInkComponents(
  mask: Uint8Array,
  mw: number,
  mh: number,
): { labels: Int32Array; sizes: number[]; count: number } {
  const n = mw * mh
  const parent = new Int32Array(n)
  for (let i = 0; i < n; i++) parent[i] = i

  const find = (i: number): number => {
    let root = i
    while (parent[root] !== root) root = parent[root]!
    let cur = i
    while (cur !== root) {
      const next = parent[cur]!
      parent[cur] = root
      cur = next
    }
    return root
  }
  const union = (a: number, b: number) => {
    const ra = find(a)
    const rb = find(b)
    if (ra !== rb) parent[rb] = ra
  }

  for (let y = 0; y < mh; y++) {
    for (let x = 0; x < mw; x++) {
      const i = y * mw + x
      if (!mask[i]) continue
      if (x > 0 && mask[i - 1]) union(i, i - 1)
      if (y > 0 && mask[i - mw]) union(i, i - mw)
    }
  }

  const rootId = new Int32Array(n)
  rootId.fill(-1)
  const labels = new Int32Array(n)
  const sizes: number[] = [0] // index 0 unused (background)
  let count = 0
  for (let i = 0; i < n; i++) {
    if (!mask[i]) continue
    const r = find(i)
    let id = rootId[r]!
    if (id < 0) {
      count++
      id = count
      rootId[r] = id
      sizes[id] = 0
    }
    labels[i] = id
    sizes[id]!++
  }
  return { labels, sizes, count }
}

function componentBoxes(
  labels: Int32Array,
  sizes: number[],
  count: number,
  mw: number,
  mh: number,
): ComponentBox[] {
  const boxes: ComponentBox[] = new Array(count + 1)
  for (let id = 1; id <= count; id++) {
    boxes[id] = { x0: mw, y0: mh, x1: -1, y1: -1, size: sizes[id] ?? 0 }
  }
  for (let y = 0; y < mh; y++) {
    for (let x = 0; x < mw; x++) {
      const id = labels[y * mw + x]!
      if (id <= 0) continue
      const b = boxes[id]!
      if (x < b.x0) b.x0 = x
      if (y < b.y0) b.y0 = y
      if (x > b.x1) b.x1 = x
      if (y > b.y1) b.y1 = y
    }
  }
  return boxes
}

/**
 * Ignore scan speckles / binder-edge blobs: keep the largest ink component plus
 * nearby or vertically-stacked (shared x-range) companions. Far corner artifacts
 * that inflate a naive min/max bbox are dropped.
 */
function boundsFromInkMask(
  mask: Uint8Array,
  mw: number,
  mh: number,
  opts?: { minSpeckle?: number; nearPadFrac?: number },
): { x0: number; y0: number; x1: number; y1: number } | null {
  const minSpeckle = opts?.minSpeckle ?? 24
  const nearPadFrac = opts?.nearPadFrac ?? 0.08
  const { labels, sizes, count } = labelInkComponents(mask, mw, mh)
  if (count === 0) return null

  let main = 1
  for (let id = 2; id <= count; id++) {
    if ((sizes[id] ?? 0) > (sizes[main] ?? 0)) main = id
  }
  const boxes = componentBoxes(labels, sizes, count, mw, mh)
  const m = boxes[main]!
  const pad = Math.max(8, Math.round(nearPadFrac * Math.max(mw, mh)))
  const ex0 = m.x0 - pad
  const ey0 = m.y0 - pad
  const ex1 = m.x1 + pad
  const ey1 = m.y1 + pad
  const mainW = m.x1 - m.x0 + 1

  let minX = m.x0
  let minY = m.y0
  let maxX = m.x1
  let maxY = m.y1

  for (let id = 1; id <= count; id++) {
    if (id === main) continue
    const b = boxes[id]!
    if (b.size < minSpeckle) continue
    const cx = (b.x0 + b.x1) / 2
    const cy = (b.y0 + b.y1) / 2
    const near = cx >= ex0 && cx <= ex1 && cy >= ey0 && cy <= ey1
    const overlap = Math.max(0, Math.min(m.x1, b.x1) - Math.max(m.x0, b.x0) + 1)
    const otherW = b.x1 - b.x0 + 1
    const stacked = overlap / Math.max(1, Math.min(mainW, otherW)) >= 0.5 && b.size >= minSpeckle * 2
    if (!near && !stacked) continue
    if (b.x0 < minX) minX = b.x0
    if (b.y0 < minY) minY = b.y0
    if (b.x1 > maxX) maxX = b.x1
    if (b.y1 > maxY) maxY = b.y1
  }

  return { x0: minX, y0: minY, x1: maxX, y1: maxY }
}

/**
 * Find the bounding box of non-near-white pixels (sheet ink).
 * Returns null when the page is empty or already tight (crop would save little area).
 *
 * Speckles and distant edge blobs (common on scanned tags) are ignored so they
 * do not pin the crop to the full page.
 */
export function findContentBounds(
  image: ImageData,
  opts?: { threshold?: number; paddingRatio?: number; minAreaSavings?: number },
): ContentBounds | null {
  const threshold = opts?.threshold ?? 250
  const paddingRatio = opts?.paddingRatio ?? 0.012
  const minAreaSavings = opts?.minAreaSavings ?? 0.04
  const { width, height, data } = image

  // Coarse scan (every 2nd pixel) — sheets are large; ink is dense enough.
  const step = width * height > 800_000 ? 2 : 1
  const mw = Math.ceil(width / step)
  const mh = Math.ceil(height / step)
  const mask = new Uint8Array(mw * mh)

  for (let y = 0, my = 0; y < height; y += step, my++) {
    for (let x = 0, mx = 0; x < width; x += step, mx++) {
      const i = (y * width + x) * 4
      const a = data[i + 3]!
      if (a < 10) continue
      const r = data[i]!
      const g = data[i + 1]!
      const b = data[i + 2]!
      // Near-white paper (allow slight gray / warm scans).
      if (r < threshold || g < threshold || b < threshold) {
        mask[my * mw + mx] = 1
      }
    }
  }

  // Speckle size scales with downsample (area ∝ step²).
  const minSpeckle = Math.max(8, Math.round(24 / (step * step)))
  const tight = boundsFromInkMask(mask, mw, mh, { minSpeckle })
  if (!tight) return null

  let minX = tight.x0 * step
  let minY = tight.y0 * step
  let maxX = Math.min(width - 1, tight.x1 * step + (step - 1))
  let maxY = Math.min(height - 1, tight.y1 * step + (step - 1))

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
