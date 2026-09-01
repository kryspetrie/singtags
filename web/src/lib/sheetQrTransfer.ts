/**
 * Multi-frame QR protocol for peer sheet + tag-metadata transfer (STX1).
 *
 * Binary QR payloads (ECC M, ~2200 byte chunks). Warn when frame count > 4.
 */
import { deflateSync, inflateSync } from 'fflate'
import { qrDataUrlFromBytes } from './qr'

/** Soft UX budget — still allow more frames, but warn above this. */
export const SHEET_QR_WARN_FRAME_COUNT = 4

/** Byte-mode payload per frame after the 12-byte STX1 header (under ECC-M max 2331). */
export const SHEET_QR_CHUNK_PAYLOAD = 2200

export const SHEET_QR_MAGIC = 'STX1'
const HEADER_BYTES = 12

export type SheetTransferMeta = {
  v: 1
  id: number
  title: string | null
  altTitle?: string | null
  arranger: string | null
  key: string | null
  writKey?: string | null
  type?: string | null
  collection?: string | null
  year?: number | string | null
  parts?: number | null
  mime: string
  width: number
  height: number
}

export type SheetTransferPackage = {
  meta: SheetTransferMeta
  imageBytes: Uint8Array
}

export type SheetTransferFrameInfo = {
  transferId: number
  index: number
  count: number
  payload: Uint8Array
}

export type BuiltSheetTransfer = {
  transferId: number
  frames: Uint8Array[]
  frameCount: number
  /** True when frameCount exceeds {@link SHEET_QR_WARN_FRAME_COUNT}. */
  warnOverBudget: boolean
  packageBytes: number
}

function textEncoder(): TextEncoder {
  return new TextEncoder()
}

function textDecoder(): TextDecoder {
  return new TextDecoder()
}

function writeU32(view: DataView, offset: number, value: number): void {
  view.setUint32(offset, value >>> 0, false)
}

function readU32(view: DataView, offset: number): number {
  return view.getUint32(offset, false)
}

/** Random 32-bit id for one send session. */
export function newSheetTransferId(): number {
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const buf = new Uint32Array(1)
    crypto.getRandomValues(buf)
    return buf[0]! >>> 0
  }
  return (Math.floor(Math.random() * 0xffffffff) >>> 0) || 1
}

/** Serialize meta + image, then deflate. */
export function packSheetTransfer(pkg: SheetTransferPackage): Uint8Array {
  const metaJson = textEncoder().encode(JSON.stringify(pkg.meta))
  const raw = new Uint8Array(4 + metaJson.length + pkg.imageBytes.length)
  writeU32(new DataView(raw.buffer), 0, metaJson.length)
  raw.set(metaJson, 4)
  raw.set(pkg.imageBytes, 4 + metaJson.length)
  return deflateSync(raw, { level: 6 })
}

/** Inflate and parse a packed transfer blob. */
export function unpackSheetTransfer(compressed: Uint8Array): SheetTransferPackage {
  const raw = inflateSync(compressed)
  if (raw.length < 4) throw new Error('Transfer package too short')
  const metaLen = readU32(new DataView(raw.buffer, raw.byteOffset, 4), 0)
  if (metaLen < 2 || 4 + metaLen > raw.length) throw new Error('Invalid transfer metadata length')
  const metaText = textDecoder().decode(raw.subarray(4, 4 + metaLen))
  const meta = JSON.parse(metaText) as SheetTransferMeta
  if (!meta || meta.v !== 1 || typeof meta.id !== 'number') {
    throw new Error('Unsupported transfer metadata')
  }
  const imageBytes = raw.subarray(4 + metaLen)
  return { meta, imageBytes }
}

/** How many QR frames a compressed package needs. */
export function sheetTransferFrameCount(packageBytes: number): number {
  const n = Math.max(0, Math.floor(packageBytes))
  if (n === 0) return 1
  return Math.ceil(n / SHEET_QR_CHUNK_PAYLOAD)
}

export function sheetTransferWarnOverBudget(frameCount: number): boolean {
  return frameCount > SHEET_QR_WARN_FRAME_COUNT
}

/** Split compressed bytes into STX1 frames. */
export function buildSheetTransferFrames(
  compressed: Uint8Array,
  opts?: { transferId?: number },
): BuiltSheetTransfer {
  const transferId = (opts?.transferId ?? newSheetTransferId()) >>> 0
  const frameCount = sheetTransferFrameCount(compressed.length)
  const frames: Uint8Array[] = []
  for (let i = 0; i < frameCount; i++) {
    const start = i * SHEET_QR_CHUNK_PAYLOAD
    const chunk = compressed.subarray(start, start + SHEET_QR_CHUNK_PAYLOAD)
    const frame = new Uint8Array(HEADER_BYTES + chunk.length)
    const magic = textEncoder().encode(SHEET_QR_MAGIC)
    frame.set(magic, 0)
    const view = new DataView(frame.buffer)
    writeU32(view, 4, transferId)
    frame[8] = i
    frame[9] = frameCount
    frame[10] = 0
    frame[11] = 0
    frame.set(chunk, HEADER_BYTES)
    frames.push(frame)
  }
  return {
    transferId,
    frames,
    frameCount,
    warnOverBudget: sheetTransferWarnOverBudget(frameCount),
    packageBytes: compressed.length,
  }
}

/** Parse one STX1 frame; null if not our magic / malformed. */
export function parseSheetTransferFrame(bytes: Uint8Array): SheetTransferFrameInfo | null {
  if (bytes.length < HEADER_BYTES) return null
  const magic = textDecoder().decode(bytes.subarray(0, 4))
  if (magic !== SHEET_QR_MAGIC) return null
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const transferId = readU32(view, 4)
  const index = bytes[8]!
  const count = bytes[9]!
  if (count < 1 || index >= count) return null
  return {
    transferId,
    index,
    count,
    payload: bytes.subarray(HEADER_BYTES),
  }
}

/** True when bytes look like an STX1 frame (for scanner routing). */
export function isSheetTransferFrame(bytes: Uint8Array): boolean {
  return parseSheetTransferFrame(bytes) != null
}

/** Assemble frames for one transferId (any order; ignores duplicates). */
export class SheetTransferAssembler {
  readonly transferId: number
  readonly frameCount: number
  private readonly parts: Array<Uint8Array | null>
  private got = 0

  constructor(transferId: number, frameCount: number) {
    this.transferId = transferId
    this.frameCount = frameCount
    this.parts = Array.from({ length: frameCount }, () => null)
  }

  get receivedCount(): number {
    return this.got
  }

  get complete(): boolean {
    return this.got >= this.frameCount
  }

  /** @returns true if this frame was newly accepted */
  accept(frame: SheetTransferFrameInfo): boolean {
    if (frame.transferId !== this.transferId) return false
    if (frame.count !== this.frameCount) return false
    if (frame.index < 0 || frame.index >= this.frameCount) return false
    if (this.parts[frame.index]) return false
    this.parts[frame.index] = frame.payload
    this.got += 1
    return true
  }

  /** Concat payloads once complete. */
  buildPackage(): Uint8Array {
    if (!this.complete) throw new Error('Transfer incomplete')
    let total = 0
    for (const p of this.parts) total += p!.length
    const out = new Uint8Array(total)
    let offset = 0
    for (const p of this.parts) {
      out.set(p!, offset)
      offset += p!.length
    }
    return out
  }
}

/**
 * Encode an image source as JPEG sized for QR transfer.
 * Drops quality (and width as a last resort) aiming for ≤ warn frame budget.
 */
export async function encodeSheetImageForTransfer(
  source: CanvasImageSource | Blob,
  opts?: {
    maxWidth?: number
    /** Prefer packages that fit this many frames (default: warn threshold). */
    targetMaxFrames?: number
  },
): Promise<{ bytes: Uint8Array; mime: string; width: number; height: number; quality: number }> {
  const targetFrames = opts?.targetMaxFrames ?? SHEET_QR_WARN_FRAME_COUNT
  const targetBytes = targetFrames * SHEET_QR_CHUNK_PAYLOAD - 256
  const maxWidth = opts?.maxWidth ?? 800

  // When given a non-ImageBitmap canvas source, createImageBitmap owns it.
  let bmp: ImageBitmap
  let closeBmp = false
  if (source instanceof Blob) {
    bmp = await createImageBitmap(source)
    closeBmp = true
  } else if (typeof ImageBitmap !== 'undefined' && source instanceof ImageBitmap) {
    bmp = source
  } else {
    bmp = await createImageBitmap(source as CanvasImageSource)
    closeBmp = true
  }

  try {
    const qualities = [0.72, 0.6, 0.48, 0.36, 0.28, 0.22]
    const widths = [maxWidth, Math.min(maxWidth, 640), Math.min(maxWidth, 480)]

    let best: { bytes: Uint8Array; width: number; height: number; quality: number } | null = null

    for (const wMax of widths) {
      const scale = Math.min(1, wMax / Math.max(1, bmp.width))
      const width = Math.max(1, Math.round(bmp.width * scale))
      const height = Math.max(1, Math.round(bmp.height * scale))
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('Canvas unavailable')
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, width, height)
      ctx.drawImage(bmp, 0, 0, width, height)

      for (const quality of qualities) {
        const blob = await new Promise<Blob | null>((resolve) =>
          canvas.toBlob((b) => resolve(b), 'image/jpeg', quality),
        )
        if (!blob) continue
        const bytes = new Uint8Array(await blob.arrayBuffer())
        const candidate = { bytes, width, height, quality }
        if (!best || bytes.length < best.bytes.length) best = candidate
        if (bytes.length <= targetBytes) {
          return { ...candidate, mime: 'image/jpeg' }
        }
      }
    }

    if (!best) throw new Error('Could not encode sheet image')
    return { ...best, mime: 'image/jpeg' }
  } finally {
    if (closeBmp) {
      try {
        bmp.close()
      } catch {
        /* ignore */
      }
    }
  }
}

/** Build a full transfer (pack + frames) from meta + already-encoded image bytes. */
export function buildSheetTransfer(
  meta: SheetTransferMeta,
  imageBytes: Uint8Array,
  opts?: { transferId?: number },
): BuiltSheetTransfer {
  const compressed = packSheetTransfer({ meta, imageBytes })
  return buildSheetTransferFrames(compressed, opts)
}

/** Render STX1 frames to QR data URLs for on-screen display. */
export async function sheetTransferQrDataUrls(
  frames: Uint8Array[],
  size = 512,
): Promise<string[]> {
  const out: string[] = []
  for (const frame of frames) {
    out.push(await qrDataUrlFromBytes(frame, size))
  }
  return out
}

/** Estimate frames for meta + image without building QR images. */
export function estimateSheetTransferFrames(
  meta: SheetTransferMeta,
  imageBytes: Uint8Array,
): { frameCount: number; warnOverBudget: boolean; packageBytes: number } {
  const packageBytes = packSheetTransfer({ meta, imageBytes }).length
  const frameCount = sheetTransferFrameCount(packageBytes)
  return {
    frameCount,
    warnOverBudget: sheetTransferWarnOverBudget(frameCount),
    packageBytes,
  }
}
