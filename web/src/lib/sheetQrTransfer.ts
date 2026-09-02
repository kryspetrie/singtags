/**
 * SingTags sheet + tag-metadata blob for Decimen optical transfer.
 * The packed bytes are sent inside a Decimen file container (see decimen/singtagsPayload.ts).
 */
import { deflateSync, inflateSync } from 'fflate'
import type { TagSummary } from '../types/tag'

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

/** Minimal browse summary from received sheet transfer metadata. */
export function tagSummaryFromSheetTransferMeta(meta: SheetTransferMeta): TagSummary {
  return {
    id: meta.id,
    title: meta.title,
    altTitle: meta.altTitle ?? null,
    arranger: meta.arranger,
    key: meta.key,
    writKey: meta.writKey ?? null,
    rating: null,
    type: meta.type ?? null,
    collection: meta.collection ?? null,
    year: meta.year ?? null,
    parts: meta.parts ?? null,
    hasSheet: true,
    audioParts: [],
    sheet: null,
  }
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

/**
 * Encode an image source as JPEG sized for optical transfer.
 */
export async function encodeSheetImageForTransfer(
  source: CanvasImageSource | Blob,
  opts?: { maxWidth?: number },
): Promise<{ bytes: Uint8Array; mime: string; width: number; height: number; quality: number }> {
  const maxWidth = opts?.maxWidth ?? 1200
  const qualities = [0.72, 0.6, 0.48, 0.36, 0.28, 0.22]
  const widths = [maxWidth, Math.min(maxWidth, 960), Math.min(maxWidth, 720)]

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
