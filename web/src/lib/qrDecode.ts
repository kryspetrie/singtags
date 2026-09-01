/**
 * Decode QR payloads from video frames or still images (BarcodeDetector + jsQR).
 */
import jsQR from 'jsqr'

export type QrDecodeResult = {
  /** UTF-8 / text payload when present. */
  text: string | null
  /** Raw bytes (preferred for STX1 sheet transfer frames). */
  bytes: Uint8Array | null
}

type BarcodeDetectorLike = {
  detect: (source: ImageBitmapSource) => Promise<Array<{ rawValue?: string }>>
}

function getBarcodeDetector(): BarcodeDetectorLike | null {
  const Ctor = (globalThis as { BarcodeDetector?: new (opts?: { formats?: string[] }) => BarcodeDetectorLike })
    .BarcodeDetector
  if (!Ctor) return null
  try {
    return new Ctor({ formats: ['qr_code'] })
  } catch {
    return null
  }
}

function decodeWithJsQr(imageData: ImageData): QrDecodeResult | null {
  const result = jsQR(imageData.data, imageData.width, imageData.height, {
    inversionAttempts: 'attemptBoth',
  })
  if (!result) return null
  const bytes =
    result.binaryData?.length > 0 ? Uint8Array.from(result.binaryData) : null
  const text = result.data?.trim() ? result.data.trim() : null
  if (!bytes && !text) return null
  return { text, bytes }
}

/** Draw an image-like source onto a canvas and return ImageData (downscales huge stills). */
function rasterizeToImageData(
  source: CanvasImageSource,
  opts?: { maxEdge?: number },
): ImageData | null {
  const maxEdge = opts?.maxEdge ?? 1280
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return null

  let sw = 0
  let sh = 0
  if (source instanceof HTMLVideoElement) {
    sw = source.videoWidth
    sh = source.videoHeight
  } else if (source instanceof HTMLImageElement) {
    sw = source.naturalWidth || source.width
    sh = source.naturalHeight || source.height
  } else if (source instanceof HTMLCanvasElement) {
    sw = source.width
    sh = source.height
  } else if (typeof ImageBitmap !== 'undefined' && source instanceof ImageBitmap) {
    sw = source.width
    sh = source.height
  }
  if (sw <= 0 || sh <= 0) return null

  const scale = Math.min(1, maxEdge / Math.max(sw, sh))
  canvas.width = Math.max(1, Math.round(sw * scale))
  canvas.height = Math.max(1, Math.round(sh * scale))
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height)
  return ctx.getImageData(0, 0, canvas.width, canvas.height)
}

async function decodeQrDetailedFromSource(
  source: CanvasImageSource,
  opts?: { maxEdge?: number; preferBinary?: boolean },
): Promise<QrDecodeResult | null> {
  // Binary sheet-transfer frames need jsQR's binaryData; BarcodeDetector is text-only.
  if (!opts?.preferBinary) {
    const detector = getBarcodeDetector()
    if (detector) {
      try {
        const codes = await detector.detect(source as ImageBitmapSource)
        const value = codes[0]?.rawValue?.trim()
        if (value) return { text: value, bytes: null }
      } catch {
        // Fall through to jsQR.
      }
    }
  }

  const imageData = rasterizeToImageData(source, { maxEdge: opts?.maxEdge })
  if (!imageData) return null
  return decodeWithJsQr(imageData)
}

/** Decode the first QR string found in a live video frame. */
export async function decodeQrFromVideo(video: HTMLVideoElement): Promise<string | null> {
  if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return null
  if (video.videoWidth <= 0 || video.videoHeight <= 0) return null
  const result = await decodeQrDetailedFromSource(video, { maxEdge: 720 })
  return result?.text ?? null
}

/**
 * Decode QR from video, preferring binary payloads (sheet transfer).
 * Falls back to text for normal tag URL codes.
 */
export async function decodeQrDetailedFromVideo(
  video: HTMLVideoElement,
): Promise<QrDecodeResult | null> {
  if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return null
  if (video.videoWidth <= 0 || video.videoHeight <= 0) return null
  return decodeQrDetailedFromSource(video, { maxEdge: 720, preferBinary: true })
}

/** Decode a QR from a photo / image file (camera roll, screenshots, etc.). */
export async function decodeQrFromFile(file: File): Promise<string | null> {
  const detailed = await decodeQrDetailedFromFile(file)
  return detailed?.text ?? null
}

/** Decode QR from a file with binary + text. */
export async function decodeQrDetailedFromFile(file: File): Promise<QrDecodeResult | null> {
  const bitmap = await createImageBitmap(file)
  try {
    return await decodeQrDetailedFromSource(bitmap, { maxEdge: 1600, preferBinary: true })
  } finally {
    bitmap.close()
  }
}

/**
 * Probe whether a usable camera can be opened. Stops the stream immediately.
 * Returns false when getUserMedia is missing or the request is denied/fails.
 */
export async function probeCameraAccess(): Promise<boolean> {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) return false
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: { ideal: 'environment' } },
    })
    for (const track of stream.getTracks()) track.stop()
    return true
  } catch {
    return false
  }
}
