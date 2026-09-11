/**
 * @vitest-environment happy-dom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  buildSoloMixObjectUrl,
  defaultMixPanForNextSelection,
  mixPanPosition,
  normalizeMixPanSetting,
  sideVoiceGain,
  soloInFileChannelIndex,
} from './multiPartMix'
import { resetSharedAudioContextForTests } from './channelSolo'

function stereoBuffer(left: Float32Array, right: Float32Array, sampleRate = 44100): AudioBuffer {
  return {
    numberOfChannels: 2,
    length: left.length,
    sampleRate,
    duration: left.length / sampleRate,
    getChannelData: (ch: number) => (ch === 0 ? left : right),
    copyToChannel: () => {},
    copyFromChannel: () => {},
  } as unknown as AudioBuffer
}

function stubMixCtx(decoded: AudioBuffer[], outL: Float32Array, outR: Float32Array) {
  const out = {
    numberOfChannels: 2,
    length: outL.length,
    sampleRate: 44100,
    getChannelData: (ch: number) => (ch === 0 ? outL : outR),
  }
  let decodeIdx = 0
  const ctx = {
    state: 'running',
    resume: vi.fn(),
    decodeAudioData: vi.fn(async () => decoded[decodeIdx++]!),
    createBuffer: vi.fn(() => out),
  }
  vi.stubGlobal(
    'AudioContext',
    vi.fn(function AudioContext() {
      return ctx
    }),
  )
  vi.stubGlobal('fetch', vi.fn(async () => new Response(new ArrayBuffer(8), { status: 200 })))
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mix')
  return ctx
}

describe('mix helpers', () => {
  it('attenuates equally when multiple voices share a side', () => {
    expect(sideVoiceGain(1)).toBe(1)
    expect(sideVoiceGain(2)).toBe(0.5)
    expect(sideVoiceGain(3)).toBeCloseTo(1 / 3)
  })

  it('defaults first selection hard left, later selections hard right', () => {
    expect(defaultMixPanForNextSelection(0)).toEqual({ mode: 'left', value: -1 })
    expect(defaultMixPanForNextSelection(1)).toEqual({ mode: 'right', value: 1 })
    expect(defaultMixPanForNextSelection(2).mode).toBe('right')
  })

  it('normalizes legacy string pans and custom objects', () => {
    expect(normalizeMixPanSetting('left')).toEqual({ mode: 'left', value: -1 })
    expect(normalizeMixPanSetting({ mode: 'custom', value: 0.5 })).toEqual({
      mode: 'custom',
      value: 0.5,
    })
    expect(mixPanPosition({ mode: 'custom', value: 0 })).toBe(0)
    expect(mixPanPosition({ mode: 'left', value: 0 })).toBe(-1)
  })

  it('maps Part L/R to channel 0/1 (mono always 0)', () => {
    expect(soloInFileChannelIndex('left', 2)).toBe(0)
    expect(soloInFileChannelIndex('right', 2)).toBe(1)
    expect(soloInFileChannelIndex('right', 1)).toBe(0)
  })
})

describe('multiPartMix routing', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    resetSharedAudioContextForTests()
  })

  it('extracts Part L (ch0) → Hard L and Part L (ch0) → Hard R', async () => {
    const lead = stereoBuffer(new Float32Array([0.5, 0.5, 0.5]), new Float32Array([0.1, 0.1, 0.1]))
    const bari = stereoBuffer(new Float32Array([0.4, 0.4, 0.4]), new Float32Array([0.2, 0.2, 0.2]))
    const outL = new Float32Array(3)
    const outR = new Float32Array(3)
    stubMixCtx([lead, bari], outL, outR)

    await buildSoloMixObjectUrl([
      { url: '/lead.m4a', soloInFile: 'left', pan: -1 },
      { url: '/bari.m4a', soloInFile: 'left', pan: 1 },
    ])

    expect(outL[0]).toBeCloseTo(0.5)
    expect(outR[0]).toBeCloseTo(0.4)
    expect(outL[0]).not.toBeCloseTo(0.1)
    expect(outR[0]).not.toBeCloseTo(0.2)
  })

  it('extracts Part R (ch1) when solo-in-file is right', async () => {
    const lead = stereoBuffer(new Float32Array([0.9, 0.9, 0.9]), new Float32Array([0.3, 0.3, 0.3]))
    const bari = stereoBuffer(new Float32Array([0.8, 0.8, 0.8]), new Float32Array([0.25, 0.25, 0.25]))
    const outL = new Float32Array(3)
    const outR = new Float32Array(3)
    stubMixCtx([lead, bari], outL, outR)

    await buildSoloMixObjectUrl([
      { url: '/lead.m4a', soloInFile: 'right', pan: -1 },
      { url: '/bari.m4a', soloInFile: 'right', pan: 1 },
    ])

    expect(outL[0]).toBeCloseTo(0.3)
    expect(outR[0]).toBeCloseTo(0.25)
  })

  it('routes Part L → Hard R and Part R → Hard L when crossed', async () => {
    const a = stereoBuffer(new Float32Array([0.5, 0.5]), new Float32Array([0.1, 0.1]))
    const b = stereoBuffer(new Float32Array([0.2, 0.2]), new Float32Array([0.7, 0.7]))
    const outL = new Float32Array(2)
    const outR = new Float32Array(2)
    stubMixCtx([a, b], outL, outR)

    await buildSoloMixObjectUrl([
      { url: '/a.m4a', soloInFile: 'left', pan: 1 },
      { url: '/b.m4a', soloInFile: 'right', pan: -1 },
    ])

    expect(outL[0]).toBeCloseTo(0.7)
    expect(outR[0]).toBeCloseTo(0.5)
  })

  it('peak-normalizes when multiple voices sum above headroom', async () => {
    const a = stereoBuffer(new Float32Array([0.6, 0.6, 0.6]), new Float32Array([0, 0, 0]))
    const b = stereoBuffer(new Float32Array([0.6, 0.6, 0.6]), new Float32Array([0, 0, 0]))
    const c = stereoBuffer(new Float32Array([0.6, 0.6, 0.6]), new Float32Array([0, 0, 0]))
    const outL = new Float32Array(3)
    const outR = new Float32Array(3)
    stubMixCtx([a, b, c], outL, outR)

    await buildSoloMixObjectUrl([
      { url: '/a.m4a', soloInFile: 'left', pan: -1 },
      { url: '/b.m4a', soloInFile: 'left', pan: -1 },
      { url: '/c.m4a', soloInFile: 'left', pan: 1 },
    ])

    expect(outL[0]).toBeCloseTo(0.99)
    expect(outR[0]).toBeCloseTo(0.495)
  })

  it('requires at least two parts', async () => {
    await expect(
      buildSoloMixObjectUrl([{ url: '/a', soloInFile: 'left', pan: -1 }]),
    ).rejects.toThrow(/two parts/i)
  })
})
