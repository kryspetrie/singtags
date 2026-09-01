/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import { unpackFile } from '../../../vendor/decimen/shared/protocol'
import type { SheetTransferMeta } from '../sheetQrTransfer'
import {
  isSingtagsCollectionFile,
  packSingtagsCollectionBatch,
  singtagsCollectionFilename,
  unpackCollectionTransfer,
  unpackSingtagsCollectionFile,
} from './collectionTransfer'
import { opticalPayloadFits } from './sendSettings'
import { OPTICAL_FRAME_BYTES_OPTIONS } from './sendSettings'

const MIN_FRAME_BYTES = Math.min(...OPTICAL_FRAME_BYTES_OPTIONS)

function sampleMeta(id: number): SheetTransferMeta {
  return {
    v: 1,
    id,
    title: `Tag ${id}`,
    arranger: null,
    key: null,
    mime: 'image/jpeg',
    width: 100,
    height: 120,
  }
}

describe('collectionTransfer', () => {
  it('round-trips a collection batch through deflate + Decimen pack', async () => {
    const manifest = {
      v: 1 as const,
      collectionName: 'Contest set',
      batchIndex: 0,
      batchCount: 2,
      tagIds: [1, 2],
      allTagIds: [1, 2, 3],
    }
    const batch = {
      manifest,
      tags: [
        { meta: sampleMeta(1), imageBytes: new Uint8Array([1, 2, 3]) },
        { meta: sampleMeta(2), imageBytes: new Uint8Array([4, 5]) },
      ],
    }
    const packed = await packSingtagsCollectionBatch(batch)
    expect(packed.filename).toBe(singtagsCollectionFilename(manifest))
    const optical = await unpackFile(packed.container)
    expect(isSingtagsCollectionFile(optical)).toBe(true)
    const restored = unpackSingtagsCollectionFile(optical)
    expect(restored.manifest).toEqual(manifest)
    expect(restored.tags.map((t) => t.meta.id)).toEqual([1, 2])
    expect(Array.from(restored.tags[0]!.imageBytes)).toEqual([1, 2, 3])
  })

  it('unpackCollectionTransfer rejects truncated payloads', () => {
    expect(() => unpackCollectionTransfer(new Uint8Array([0, 0, 0, 2, 123, 125]))).toThrow()
  })

  it('each batch container fits one optical stream at minimum density', async () => {
    const tags = Array.from({ length: 4 }, (_, i) => ({
      meta: sampleMeta(i + 1),
      imageBytes: new Uint8Array(4000).fill(i + 1),
    }))
    const manifest = {
      v: 1 as const,
      collectionName: 'Big set',
      batchIndex: 0,
      batchCount: 1,
      tagIds: tags.map((t) => t.meta.id),
      allTagIds: tags.map((t) => t.meta.id),
    }
    const { container } = await packSingtagsCollectionBatch({ manifest, tags })
    expect(opticalPayloadFits(container.length, MIN_FRAME_BYTES)).toBe(true)
  })

  it('detects collection files by mime or filename', () => {
    expect(
      isSingtagsCollectionFile({
        name: singtagsCollectionFilename({
          v: 1,
          collectionName: 'X',
          batchIndex: 1,
          batchCount: 3,
          tagIds: [1],
          allTagIds: [1],
        }),
        type: 'application/vnd.singtags.collection-transfer',
        bytes: new Uint8Array([9]),
      }),
    ).toBe(true)
  })
})
