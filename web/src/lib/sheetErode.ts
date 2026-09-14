/**
 * Sheet-music erode: morphological thicken + dark-favoring gamma/contrast.
 * Canvas pipeline (CSS SVG feComponentTransfer is unreliable via filter:url()).
 */

export const SHEET_ERODE_LEVELS = ['off', 'light', 'medium', 'strong'] as const
export type SheetErodeLevel = (typeof SHEET_ERODE_LEVELS)[number]

export const SHEET_ERODE_DEFAULT: SheetErodeLevel = 'off'
export const SHEET_ERODE_STORAGE_KEY = 'singtags.sheetErode.v2'
/** @deprecated boolean on/off — migrated into v2 levels. */
export const SHEET_ERODE_STORAGE_KEY_V1 = 'singtags.sheetErode.v1'

/** Classic “Smile” (tag #1) — Settings live preview. */
export const SHEET_ERODE_PREVIEW_TAG_ID = 1
export const SHEET_ERODE_PREVIEW_PATH =
  'Smile%20%28G%20Major%29%20-%20Bobby%20Gray%20Jr%20-%201/Smile%20%28G%20Major%29%20-%20Bobby%20Gray%20Jr%20-%20Sheet%20Preview.webp'

export const SHEET_ERODE_OPTIONS: Array<{
  value: SheetErodeLevel
  label: string
  hint: string
}> = [
  {
    value: 'off',
    label: 'Off',
    hint: 'Original sheet thickness and contrast',
  },
  {
    value: 'light',
    label: 'Light',
    hint: 'Subtle thicken + a bit more ink contrast',
  },
  {
    value: 'medium',
    label: 'Medium',
    hint: 'Noticeably thicker lines and darker ink',
  },
  {
    value: 'strong',
    label: 'Strong',
    hint: 'Maximum thicken and dark-favoring contrast',
  },
]

/**
 * Processing knobs.
 * - `amount`: blend of morphological erode into the original (0–1).
 * - `gamma`: >1 darkens midtones (pow).
 * - `contrast` / `intercept`: linear gain after gamma.
 * - `inkSoft`: soft ceiling below which tones are crushed toward black (0.75–0.92).
 * - `darkPower`: extra pow after contrast (>1) to bias remaining greys darker.
 */
export type SheetErodeFilterParams = {
  /** Morphological radius in pixels (1 → 3×3). */
  radius: number
  amount: number
  gamma: number
  contrast: number
  intercept: number
  inkSoft: number
  darkPower: number
}

export const SHEET_ERODE_FILTER_PARAMS: Record<
  Exclude<SheetErodeLevel, 'off'>,
  SheetErodeFilterParams
> = {
  light: {
    radius: 1,
    amount: 0.28,
    gamma: 1.55,
    contrast: 1.55,
    intercept: -0.14,
    inkSoft: 0.88,
    darkPower: 1.35,
  },
  medium: {
    radius: 1,
    amount: 0.45,
    gamma: 1.9,
    contrast: 1.85,
    intercept: -0.2,
    inkSoft: 0.9,
    darkPower: 1.55,
  },
  strong: {
    radius: 1,
    amount: 0.7,
    gamma: 2.35,
    contrast: 2.15,
    intercept: -0.28,
    inkSoft: 0.92,
    darkPower: 1.75,
  },
}

export function isSheetErodeLevel(v: unknown): v is SheetErodeLevel {
  return typeof v === 'string' && (SHEET_ERODE_LEVELS as readonly string[]).includes(v)
}

export function normalizeSheetErodeLevel(raw: unknown): SheetErodeLevel {
  if (isSheetErodeLevel(raw)) return raw
  return SHEET_ERODE_DEFAULT
}

export function sheetErodeFilterParams(
  level: SheetErodeLevel,
): SheetErodeFilterParams | null {
  if (level === 'off') return null
  return SHEET_ERODE_FILTER_PARAMS[level]
}

export function readStoredSheetErodeLevel(): SheetErodeLevel | null {
  if (typeof localStorage === 'undefined') return null
  try {
    const v2 = localStorage.getItem(SHEET_ERODE_STORAGE_KEY)
    if (v2 != null && v2 !== '') return normalizeSheetErodeLevel(v2)
    const v1 = localStorage.getItem(SHEET_ERODE_STORAGE_KEY_V1)
    if (v1 === '1') return 'light'
    if (v1 === '0') return 'off'
    return null
  } catch {
    return null
  }
}

export function writeStoredSheetErodeLevel(level: SheetErodeLevel): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(SHEET_ERODE_STORAGE_KEY, normalizeSheetErodeLevel(level))
  } catch {
    /* ignore */
  }
}

export function resolveInitialSheetErodeLevel(): SheetErodeLevel {
  return readStoredSheetErodeLevel() ?? SHEET_ERODE_DEFAULT
}

function clampByte(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : v
}

/** Morphological erode (min) on RGB; alpha copied. In-place into `out`. */
export function erodeRgbMin(
  src: Uint8ClampedArray,
  out: Uint8ClampedArray,
  w: number,
  h: number,
  radius: number,
): void {
  const r = Math.max(1, Math.round(radius))
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let minR = 255
      let minG = 255
      let minB = 255
      for (let dy = -r; dy <= r; dy++) {
        const yy = y + dy
        if (yy < 0 || yy >= h) continue
        for (let dx = -r; dx <= r; dx++) {
          const xx = x + dx
          if (xx < 0 || xx >= w) continue
          const i = (yy * w + xx) * 4
          if (src[i]! < minR) minR = src[i]!
          if (src[i + 1]! < minG) minG = src[i + 1]!
          if (src[i + 2]! < minB) minB = src[i + 2]!
        }
      }
      const o = (y * w + x) * 4
      out[o] = minR
      out[o + 1] = minG
      out[o + 2] = minB
      out[o + 3] = src[o + 3]!
    }
  }
}

/**
 * Dark-favoring tone curve for sheet ink (v in 0…1).
 * Near-white paper stays light; greys and ink crush toward black with high contrast.
 */
export function applyDarkFavorTone(
  v: number,
  params: Pick<
    SheetErodeFilterParams,
    'gamma' | 'contrast' | 'intercept' | 'inkSoft' | 'darkPower'
  >,
): number {
  let x = Math.min(1, Math.max(0, v))
  const soft = Math.min(0.98, Math.max(0.5, params.inkSoft))
  // Remap so values below inkSoft fill 0…1, then crush with gamma.
  if (x >= soft) {
    // Compress leftover highlight range toward pure white.
    const t = (x - soft) / (1 - soft || 1)
    x = soft + t * t * (1 - soft)
  } else {
    x = x / soft
    x = Math.pow(x, Math.max(0.01, params.gamma))
    x *= soft * 0.92 // leave headroom before contrast so ink stays dark
  }
  x = x * params.contrast + params.intercept
  x = Math.min(1, Math.max(0, x))
  x = Math.pow(x, Math.max(0.01, params.darkPower))
  return Math.min(1, Math.max(0, x))
}

/**
 * Apply erode blend + dark-favoring tone (+ optional invert) to ImageData in place.
 */
export function applySheetErodeToImageData(
  imageData: ImageData,
  params: SheetErodeFilterParams,
  invert = false,
): void {
  const { data, width: w, height: h } = imageData
  const eroded = new Uint8ClampedArray(data.length)
  erodeRgbMin(data, eroded, w, h, params.radius)

  const amt = Math.min(1, Math.max(0, params.amount))
  const invAmt = 1 - amt

  for (let i = 0; i < data.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      const mixed = data[i + c]! * invAmt + eroded[i + c]! * amt
      let v = applyDarkFavorTone(mixed / 255, params)
      if (invert) v = 1 - v
      data[i + c] = clampByte(Math.round(v * 255))
    }
  }
}

export type ProcessSheetErodeOptions = {
  params: SheetErodeFilterParams | null
  invert?: boolean
  /** Cap longest side (preview). Full sheets omit this. */
  maxEdge?: number
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.decoding = 'async'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Failed to load sheet image'))
    // Same-origin library / tags — avoid tainting when possible.
    img.crossOrigin = 'anonymous'
    img.src = url
  })
}

/**
 * Rasterize `url` through the erode pipeline. Returns a blob: object URL
 * (caller must revoke). If params is null and invert is false, returns `url` unchanged.
 */
export async function processSheetImageUrl(
  url: string,
  opts: ProcessSheetErodeOptions,
): Promise<string> {
  const { params, invert = false, maxEdge } = opts
  if (!params && !invert) return url

  const img = await loadImage(url)
  let w = img.naturalWidth || img.width
  let h = img.naturalHeight || img.height
  if (!(w > 0 && h > 0)) throw new Error('Sheet image has no dimensions')

  if (maxEdge && Math.max(w, h) > maxEdge) {
    const scale = maxEdge / Math.max(w, h)
    w = Math.max(1, Math.round(w * scale))
    h = Math.max(1, Math.round(h * scale))
  }

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('Canvas unavailable')
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, w, h)
  ctx.drawImage(img, 0, 0, w, h)

  if (params) {
    const imageData = ctx.getImageData(0, 0, w, h)
    applySheetErodeToImageData(imageData, params, invert)
    ctx.putImageData(imageData, 0, 0)
  } else if (invert) {
    // Invert-only path (no erode).
    const imageData = ctx.getImageData(0, 0, w, h)
    const d = imageData.data
    for (let i = 0; i < d.length; i += 4) {
      d[i] = 255 - d[i]!
      d[i + 1] = 255 - d[i + 1]!
      d[i + 2] = 255 - d[i + 2]!
    }
    ctx.putImageData(imageData, 0, 0)
  }

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('toBlob failed'))),
      'image/webp',
      0.92,
    )
  })
  return URL.createObjectURL(blob)
}
