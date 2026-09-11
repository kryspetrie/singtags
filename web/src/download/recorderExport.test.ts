/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it, vi, afterEach } from 'vitest'
import { encodeRecorderTakeForTests, RECORDER_DOWNLOAD_FORMAT_OPTIONS } from './recorderExport'
import * as transform from './transform'

describe('recorderExport', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('lists original plus re-encode options', () => {
    expect(RECORDER_DOWNLOAD_FORMAT_OPTIONS.map((o) => o.value)).toEqual([
      'original',
      'mp3',
      'm4a',
    ])
  })

  it('always re-encodes (never catalog original passthrough)', async () => {
    const input = new Uint8Array([1, 2, 3, 4, 5])
    const spy = vi.spyOn(transform, 'prepareDownloadBytes').mockResolvedValue(new Uint8Array([9, 9]))
    const out = await encodeRecorderTakeForTests(input, 'mp3')
    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({
        input,
        format: 'mp3',
        encodeQuality: 'standard',
      }),
    )
    expect(out).not.toBe(input)
    expect(Array.from(out)).toEqual([9, 9])
  })
})
