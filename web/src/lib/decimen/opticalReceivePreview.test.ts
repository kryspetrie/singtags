/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import { estimateReceiveBytes, formatReceiveProgressLabel } from './receiveProgress'
import {
  canOpenOpticalAfterTransfer,
  isOpticalMultiFileZip,
  opticalPreviewKind,
} from './opticalReceivePreview'
import type { OpticalFile } from '../../../vendor/decimen/shared/protocol'

function file(partial: Partial<OpticalFile> & Pick<OpticalFile, 'name' | 'type'>): OpticalFile {
  return {
    bytes: new Uint8Array([1]),
    ...partial,
  }
}

describe('receiveProgress', () => {
  it('estimates bytes from fraction', () => {
    expect(estimateReceiveBytes(1000, 0.5)).toEqual({ bytesReceived: 500, totalBytes: 1000 })
    expect(estimateReceiveBytes(1000, 1.5)).toEqual({ bytesReceived: 1000, totalBytes: 1000 })
  })

  it('formats blocks and bytes in the status label', () => {
    const label = formatReceiveProgressLabel({
      solved: 12,
      totalBlocks: 40,
      bytesReceived: 48 * 1024,
      totalBytes: 160 * 1024,
      percent: 30,
    })
    expect(label).toMatch(/12 \/ 40 blocks/)
    expect(label).toMatch(/48\.0 KB \/ 160\.0 KB/)
    expect(label).toMatch(/30%/)
  })
})

describe('opticalReceivePreview', () => {
  it('classifies previewable media', () => {
    expect(opticalPreviewKind({ name: 'a.png', type: 'image/png' })).toBe('image')
    expect(opticalPreviewKind({ name: 'a.pdf', type: 'application/pdf' })).toBe('pdf')
    expect(opticalPreviewKind({ name: 'a.m4a', type: 'audio/mp4' })).toBe('audio')
    expect(opticalPreviewKind({ name: 'a.bin', type: 'application/octet-stream' })).toBeNull()
  })

  it('treats zips as multi-file (no open-after-transfer)', () => {
    expect(isOpticalMultiFileZip({ name: 'pack.zip', type: 'application/zip' })).toBe(true)
    expect(
      canOpenOpticalAfterTransfer(
        file({ name: 'pack.zip', type: 'application/zip' }),
      ),
    ).toBe(false)
  })

  it('allows open for single media and SingTags packages, not collections', () => {
    expect(
      canOpenOpticalAfterTransfer(file({ name: 'clip.m4a', type: 'audio/mp4' })),
    ).toBe(true)
    expect(
      canOpenOpticalAfterTransfer(
        file({ name: 'singtags-9.sheet', type: 'application/vnd.singtags.sheet-transfer' }),
      ),
    ).toBe(true)
    expect(
      canOpenOpticalAfterTransfer(
        file({
          name: 'collection.batch',
          type: 'application/vnd.singtags.collection-transfer',
        }),
      ),
    ).toBe(false)
  })
})
