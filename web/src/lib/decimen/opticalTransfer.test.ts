/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import { unzipSync } from 'fflate'
import { prepareOpticalTransfer, previewOpticalTransfer, zipFilesForTransfer, estimateOpticalSendFromContainer, estimateOpticalTransferPreview } from './opticalTransfer'
import { unpackFile } from '../../../vendor/decimen/shared/protocol'

describe('opticalTransfer', () => {
  it('zips multiple files with deduped names', async () => {
    const zip = await zipFilesForTransfer([
      new File([new Uint8Array([1])], 'a.txt', { type: 'text/plain' }),
      new File([new Uint8Array([2])], 'folder/a.txt', { type: 'text/plain' }),
    ])
    const tree = unzipSync(zip) as Record<string, Uint8Array>
    expect(Object.keys(tree).sort()).toEqual(['a-1.txt', 'a.txt'])
  })

  it('packs a single file for optical transfer', async () => {
    const file = new File([new Uint8Array([9, 8, 7])], 'note.txt', { type: 'text/plain' })
    const prepared = await prepareOpticalTransfer([file])
    expect(prepared.fileCount).toBe(1)
    expect(prepared.sendName).toBe('note.txt')
    const optical = await unpackFile(prepared.container)
    expect(optical.name).toBe('note.txt')
    expect(Array.from(optical.bytes)).toEqual([9, 8, 7])
  })

  it('packs multiple files as a zip archive', async () => {
    const prepared = await prepareOpticalTransfer([
      new File([new Uint8Array([1])], 'one.bin', { type: 'application/octet-stream' }),
      new File([new Uint8Array([2])], 'two.bin', { type: 'application/octet-stream' }),
    ])
    expect(prepared.fileCount).toBe(2)
    expect(prepared.sendType).toBe('application/zip')
    const optical = await unpackFile(prepared.container)
    expect(optical.type).toBe('application/zip')
    const inner = unzipSync(optical.bytes) as Record<string, Uint8Array>
    expect(Object.keys(inner).sort()).toEqual(['one.bin', 'two.bin'])
  })

  it('estimates send duration from packed container size', async () => {
    const prepared = await prepareOpticalTransfer([
      new File([new Uint8Array(5000)], 'chunk.bin', { type: 'application/octet-stream' }),
    ])
    const estimate = estimateOpticalSendFromContainer(prepared.container.length)
    expect(estimate.containerBytes).toBe(prepared.container.length)
    expect(estimate.expectedFrames).toBeGreaterThan(0)
    expect(estimate.etaSeconds).toBeGreaterThan(0)
    expect(estimate.etaLabel.length).toBeGreaterThan(0)
  })

  it('estimateOpticalTransferPreview sizes from file metadata only', () => {
    const preview = estimateOpticalTransferPreview([
      new File([new Uint8Array(5000)], 'chunk.bin', { type: 'application/octet-stream' }),
    ])
    expect(preview.fileCount).toBe(1)
    expect(preview.payloadBytes).toBe(5000)
    expect(preview.containerBytes).toBeGreaterThan(5000)
    expect(preview.etaLabel.length).toBeGreaterThan(0)
  })

  it('previewOpticalTransfer includes payload and container estimates', async () => {
    const preview = await previewOpticalTransfer([
      new File([new Uint8Array([4, 5])], 'x.txt', { type: 'text/plain' }),
    ])
    expect(preview.fileCount).toBe(1)
    expect(preview.estimate.payloadBytes).toBe(2)
    expect(preview.estimate.containerBytes).toBe(preview.container.length)
  })
})
