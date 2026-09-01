/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import { packSheetTransfer, unpackSheetTransfer, type SheetTransferMeta } from './sheetQrTransfer'

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

describe('sheetQrTransfer pack/unpack', () => {
  it('round-trips meta + image bytes', () => {
    const image = new Uint8Array(6000)
    for (let i = 0; i < image.length; i++) image[i] = (i * 17 + 31) % 256
    const compressed = packSheetTransfer({ meta: meta(), imageBytes: image })
    const pkg = unpackSheetTransfer(compressed)
    expect(pkg.meta.id).toBe(31)
    expect(pkg.meta.title).toBe('Hello Mary Lou')
    expect(Array.from(pkg.imageBytes)).toEqual(Array.from(image))
  })

  it('rejects invalid metadata', () => {
    const image = new Uint8Array([1, 2, 3])
    const compressed = packSheetTransfer({ meta: meta({ v: 1, id: 0 }), imageBytes: image })
    const raw = compressed.slice()
    expect(() => unpackSheetTransfer(new Uint8Array([0, 1, 2]))).toThrow()
    expect(() => unpackSheetTransfer(raw)).not.toThrow()
  })
})
