/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import { DOWNLOAD_AAC_BITRATE } from '../../types/audio'
import {
  estimateBitrateBps,
  estimateOpticalAudioPayloadBytes,
  OPTICAL_MP3_VBR_BITRATE_BPS,
  opticalAudioTargetBitrateBps,
  shouldPassthroughAac96,
} from './opticalAudioFormat'

describe('opticalAudioFormat helpers', () => {
  it('estimates bitrate and passthrough threshold for AAC 96', () => {
    // 96 kbps * 10s = 960_000 bits = 120_000 bytes
    expect(estimateBitrateBps(120_000, 10)).toBeCloseTo(96_000, -2)
    expect(shouldPassthroughAac96(90_000)).toBe(true)
    expect(shouldPassthroughAac96(120_000)).toBe(false)
  })

  it('maps formats to target bitrates', () => {
    expect(opticalAudioTargetBitrateBps('original')).toBe(0)
    expect(opticalAudioTargetBitrateBps('aac96')).toBe(DOWNLOAD_AAC_BITRATE)
    expect(opticalAudioTargetBitrateBps('opus64')).toBe(64_000)
    expect(opticalAudioTargetBitrateBps('mp3vbr')).toBe(OPTICAL_MP3_VBR_BITRATE_BPS)
  })

  it('estimates reencoded size from duration × bitrate', () => {
    const durationSec = 180
    const aac = estimateOpticalAudioPayloadBytes({
      byteLength: 5_000_000,
      format: 'aac96',
      durationSec,
    })
    const opus = estimateOpticalAudioPayloadBytes({
      byteLength: 5_000_000,
      format: 'opus64',
      durationSec,
    })
    const mp3 = estimateOpticalAudioPayloadBytes({
      byteLength: 5_000_000,
      format: 'mp3vbr',
      durationSec,
    })
    expect(aac).toBe(Math.ceil((durationSec * DOWNLOAD_AAC_BITRATE) / 8) + 2_048)
    expect(opus).toBe(Math.ceil((durationSec * 64_000) / 8) + 2_048)
    expect(mp3).toBe(Math.ceil((durationSec * OPTICAL_MP3_VBR_BITRATE_BPS) / 8) + 2_048)
    expect(opus).toBeLessThan(aac)
    expect(aac).toBeLessThan(mp3)
  })

  it('keeps original size for original format and AAC passthrough cases', () => {
    expect(
      estimateOpticalAudioPayloadBytes({
        byteLength: 400_000,
        format: 'original',
        durationSec: 180,
      }),
    ).toBe(400_000)

    // Source already smaller than AAC 96 estimate → passthrough.
    const small = estimateOpticalAudioPayloadBytes({
      byteLength: 200_000,
      format: 'aac96',
      durationSec: 180,
    })
    expect(small).toBe(200_000)
  })

  it('falls back to a source-bitrate ratio when duration is unknown', () => {
    const sourceBytes = 3_000_000
    const estimated = estimateOpticalAudioPayloadBytes({
      byteLength: sourceBytes,
      format: 'opus64',
    })
    expect(estimated).toBeGreaterThan(0)
    expect(estimated).toBeLessThan(sourceBytes)
  })
})
