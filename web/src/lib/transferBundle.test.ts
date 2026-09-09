import { describe, expect, it } from 'vitest'
import { buildTransferBundle, opticalFileFromBrowserFile } from './transferBundle'

describe('buildTransferBundle', () => {
  it('returns the single file unchanged', async () => {
    const file = new File([new Uint8Array([1, 2, 3])], 'chart.pdf', { type: 'application/pdf' })
    const bundle = await buildTransferBundle([file])
    expect(bundle.fileCount).toBe(1)
    expect(bundle.payloadBytes).toBe(3)
    expect(bundle.file).toBe(file)
  })

  it('zips multiple files', async () => {
    const a = new File([new Uint8Array([1])], 'a.txt', { type: 'text/plain' })
    const b = new File([new Uint8Array([2, 3])], 'b.txt', { type: 'text/plain' })
    const bundle = await buildTransferBundle([a, b])
    expect(bundle.fileCount).toBe(2)
    expect(bundle.file.type).toBe('application/zip')
    expect(bundle.file.name).toMatch(/^transfer-2-files-/)
    expect(bundle.payloadBytes).toBeGreaterThan(0)
  })

  it('rejects an empty queue', async () => {
    await expect(buildTransferBundle([])).rejects.toThrow(/at least one file/i)
  })
})

describe('opticalFileFromBrowserFile', () => {
  it('reads bytes for receive ingest', async () => {
    const file = new File([new Uint8Array([9, 8])], 'x.bin', { type: 'application/octet-stream' })
    const optical = await opticalFileFromBrowserFile(file)
    expect(optical.name).toBe('x.bin')
    expect(Array.from(optical.bytes)).toEqual([9, 8])
    expect(optical.compression).toBe('none')
    expect(optical.transmittedSize).toBe(2)
    expect(optical.sha256).toHaveLength(32)
  })
})
