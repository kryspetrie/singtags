/**
 * @vitest-environment happy-dom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { OUTPUT_HEADROOM } from './playerUtils'

function makeBuffer(peak: number, length = 32): AudioBuffer {
  const data = new Float32Array(length)
  data[4] = peak
  return {
    numberOfChannels: 1,
    length,
    sampleRate: 48000,
    duration: length / 48000,
    getChannelData: () => data,
  } as unknown as AudioBuffer
}

vi.mock('./channelSolo', () => ({
  getSharedAudioContext: () => ({
    createBuffer: (channels: number, length: number, sampleRate: number) => {
      const chans = Array.from({ length: channels }, () => new Float32Array(length))
      return {
        numberOfChannels: channels,
        length,
        sampleRate,
        duration: length / sampleRate,
        getChannelData: (i: number) => chans[i]!,
      }
    },
  }),
  resumeAudioContextBestEffort: async () => undefined,
}))

describe('normalizeAudioBuffer', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('scales a quiet buffer up toward headroom', async () => {
    const { normalizeAudioBuffer } = await import('./takeLevelProcess')
    const { buffer, gain, peakBefore, peakAfter } = normalizeAudioBuffer(makeBuffer(0.25))
    expect(peakBefore).toBeCloseTo(0.25, 5)
    expect(gain).toBeCloseTo(OUTPUT_HEADROOM / 0.25, 5)
    expect(channelPeakOf(buffer)).toBeCloseTo(OUTPUT_HEADROOM, 4)
    expect(peakAfter).toBeCloseTo(OUTPUT_HEADROOM, 4)
  })
})

describe('resolveTakeCompressSettings', () => {
  it('varies threshold and ratio by mode and intensity', async () => {
    const { resolveTakeCompressSettings } = await import('./takeLevelProcess')
    const vocalMed = resolveTakeCompressSettings('vocal', 0.5)
    const vocalHeavy = resolveTakeCompressSettings('vocal', 1)
    const gentleLight = resolveTakeCompressSettings('gentle', 0)
    const punch = resolveTakeCompressSettings('punch', 'medium')
    const broadcast = resolveTakeCompressSettings('broadcast', 'medium')

    expect(vocalHeavy.thresholdDb).toBeLessThan(vocalMed.thresholdDb)
    expect(vocalHeavy.ratio).toBeGreaterThan(vocalMed.ratio)
    expect(gentleLight.ratio).toBeLessThan(vocalMed.ratio)
    expect(punch.attackSec).toBeLessThan(vocalMed.attackSec)
    expect(broadcast.thresholdDb).toBeLessThan(vocalMed.thresholdDb)
    expect(broadcast.ratio).toBeGreaterThan(vocalMed.ratio)
    expect(resolveTakeCompressSettings('vocal', 'heavy').ratio).toBeCloseTo(vocalHeavy.ratio, 5)
  })
})

function channelPeakOf(buf: AudioBuffer): number {
  let peak = 0
  for (let ch = 0; ch < buf.numberOfChannels; ch++) {
    const d = buf.getChannelData(ch)
    for (let i = 0; i < d.length; i++) peak = Math.max(peak, Math.abs(d[i]!))
  }
  return peak
}
