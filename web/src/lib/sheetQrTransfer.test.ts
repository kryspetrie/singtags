/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import {
  SHEET_QR_CHUNK_PAYLOAD,
  SHEET_QR_WARN_FRAME_COUNT,
  SheetTransferAssembler,
  buildSheetTransfer,
  buildSheetTransferFrames,
  estimateSheetTransferFrames,
  parseSheetTransferFrame,
  sheetTransferFrameCount,
  sheetTransferWarnOverBudget,
  unpackSheetTransfer,
  type SheetTransferMeta,
} from './sheetQrTransfer'

function meta(over?: Partial<SheetTransferMeta>): SheetTransferMeta {
  return {
    v: 1,
    id: 31,
    title: 'Hello Mary Lou',
    arranger: 'Ed Waesche',
    key: 'Ab Major',
    writKey: 'Ab',
    type: 'Tag',
    collection: null,
    year: 1960,
    parts: 4,
    mime: 'image/jpeg',
    width: 800,
    height: 1100,
    ...over,
  }
}

describe('sheetQrTransfer framing', () => {
  it('counts frames from package size and warns above 4', () => {
    expect(sheetTransferFrameCount(1)).toBe(1)
    expect(sheetTransferFrameCount(SHEET_QR_CHUNK_PAYLOAD)).toBe(1)
    expect(sheetTransferFrameCount(SHEET_QR_CHUNK_PAYLOAD + 1)).toBe(2)
    expect(sheetTransferFrameCount(SHEET_QR_CHUNK_PAYLOAD * 4)).toBe(4)
    expect(sheetTransferFrameCount(SHEET_QR_CHUNK_PAYLOAD * 4 + 1)).toBe(5)
    expect(sheetTransferWarnOverBudget(SHEET_QR_WARN_FRAME_COUNT)).toBe(false)
    expect(sheetTransferWarnOverBudget(SHEET_QR_WARN_FRAME_COUNT + 1)).toBe(true)
  })

  it('round-trips meta + image across unordered frames', () => {
    // High-entropy payload so deflate stays large enough for multiple frames.
    const image = new Uint8Array(6000)
    for (let i = 0; i < image.length; i++) image[i] = (i * 17 + 31) % 256
    // Mix in a crypto-like scramble without needing crypto in node tests.
    for (let i = image.length - 1; i > 0; i--) {
      const j = (image[i]! * 13 + i) % (i + 1)
      const tmp = image[i]!
      image[i] = image[j]!
      image[j] = tmp
    }
    const built = buildSheetTransfer(meta(), image, { transferId: 0xabcdd00d })
    expect(built.frameCount).toBeGreaterThan(1)
    expect(built.warnOverBudget).toBe(built.frameCount > 4)

    const parsed = built.frames.map((f) => parseSheetTransferFrame(f)!)
    expect(parsed.every((p) => p != null)).toBe(true)

    const asm = new SheetTransferAssembler(built.transferId, built.frameCount)
    // Accept out of order
    for (const frame of [...parsed].reverse()) {
      expect(asm.accept(frame)).toBe(true)
    }
    expect(asm.complete).toBe(true)
    const pkg = unpackSheetTransfer(asm.buildPackage())
    expect(pkg.meta.id).toBe(31)
    expect(pkg.meta.title).toBe('Hello Mary Lou')
    expect(Array.from(pkg.imageBytes)).toEqual(Array.from(image))
  })

  it('sets warnOverBudget when package needs more than 4 frames', () => {
    const blob = new Uint8Array(SHEET_QR_CHUNK_PAYLOAD * 5)
    for (let i = 0; i < blob.length; i++) blob[i] = (i * 29) & 255
    const built = buildSheetTransferFrames(blob, { transferId: 1 })
    expect(built.frameCount).toBeGreaterThan(SHEET_QR_WARN_FRAME_COUNT)
    expect(built.warnOverBudget).toBe(true)
  })

  it('estimate matches build frame count', () => {
    const image = new Uint8Array(9000).fill(7)
    const est = estimateSheetTransferFrames(meta(), image)
    const built = buildSheetTransfer(meta(), image)
    expect(est.frameCount).toBe(built.frameCount)
    expect(est.warnOverBudget).toBe(built.warnOverBudget)
  })

  it('rejects non-STX1 payloads', () => {
    expect(parseSheetTransferFrame(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]))).toBeNull()
  })
})
