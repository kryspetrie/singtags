/**
 * Decode QR payloads from video frames or still images (BarcodeDetector + jsQR).
 */
import jsQR from 'jsqr'

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

function decodeWithJsQr(imageData: ImageData): string | null {
  const result = jsQR(imageData.data, imageData.width, imageData.height, {
    inversionAttempts: 'attemptBoth',
  })
  return result?.data?.trim() || null
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

/** Decode the first QR string found in a live video frame. */
export async function decodeQrFromVideo(video: HTMLVideoElement): Promise<string | null> {
  if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return null
  if (video.videoWidth <= 0 || video.videoHeight <= 0) return null

  const detector = getBarcodeDetector()
  if (detector) {
    try {
      const codes = await detector.detect(video)
      const value = codes[0]?.rawValue?.trim()
      if (value) return value
    } catch {
      // Fall through to jsQR.
    }
  }

  const imageData = rasterizeToImageData(video, { maxEdge: 720 })
  if (!imageData) return null
  return decodeWithJsQr(imageData)
}

/** Decode a QR from a photo / image file (camera roll, screenshots, etc.). */
export async function decodeQrFromFile(file: File): Promise<string | null> {
  const bitmap = await createImageBitmap(file)
  try {
    const detector = getBarcodeDetector()
    if (detector) {
      try {
        const codes = await detector.detect(bitmap)
        const value = codes[0]?.rawValue?.trim()
        if (value) return value
      } catch {
        // Fall through to jsQR.
      }
    }
    const imageData = rasterizeToImageData(bitmap, { maxEdge: 1600 })
    if (!imageData) return null
    return decodeWithJsQr(imageData)
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
