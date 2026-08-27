/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it, vi, beforeEach } from 'vitest'
import {
  buildPartLearningStereoObjectUrl,
  equalPowerPanGains,
  mixPanForPart,
  ULTRA_MIX_PAN,
} from './partLeftReconstruct'
import { resetSharedAudioContextForTests } from './channelSolo'

function sineMono(length: number, freq: number, sampleRate: number): Float32Array {
  const out = new Float32Array(length)
  for (let i = 0; i < length; i++) {
    out[i] = Math.sin((2 * Math.PI * freq * i) / sampleRate)
  }
  return out
}
function mockMonoBuffer(mono: Float32Array, sampleRate = 44100): AudioBuffer {
  return {
    numberOfChannels: 1,
    length: mono.length,
    sampleRate,
    duration: mono.length / sampleRate,
    getChannelData: () => mono,
    copyToChannel: vi.fn(),
    copyFromChannel: vi.fn(),
  } as unknown as AudioBuffer
}

describe('partLeftReconstruct', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    resetSharedAudioContextForTests()
  })

  it('maps barbershop parts to fixed pans', () => {
    expect(mixPanForPart('tenor')).toBe(ULTRA_MIX_PAN.tenor)
    expect(mixPanForPart('Lead')).toBe(ULTRA_MIX_PAN.lead)
    expect(mixPanForPart('bass')).toBe(ULTRA_MIX_PAN.bass)
    expect(mixPanForPart('bari')).toBe(ULTRA_MIX_PAN.bari)
    expect(mixPanForPart('unknown')).toBe(0)
  })

  it('equal-power pan is center at 0 and extremes at ±1', () => {
    const c = equalPowerPanGains(0)
    expect(c.l).toBeCloseTo(Math.SQRT1_2, 5)
    expect(c.r).toBeCloseTo(Math.SQRT1_2, 5)

    const left = equalPowerPanGains(-1)
    expect(left.l).toBeCloseTo(1, 5)
    expect(left.r).toBeCloseTo(0, 5)

    const right = equalPowerPanGains(1)
    expect(right.l).toBeCloseTo(0, 5)
    expect(right.r).toBeCloseTo(1, 5)
  })

  it('buildPartLearningStereoObjectUrl separates solo and accompaniment channels', async () => {
    const sampleRate = 44100
    const length = 512
    const soloMono = sineMono(length, 440, sampleRate)
    const accMono = sineMono(length, 880, sampleRate)

    let decodeCall = 0
    const captured: { left?: Float32Array; right?: Float32Array } = {}
    const ctx = {
      state: 'running',
      resume: vi.fn(),
      decodeAudioData: vi.fn(async () => {
        decodeCall++
        if (decodeCall === 1) return mockMonoBuffer(soloMono, sampleRate)
        return mockMonoBuffer(accMono, sampleRate)
      }),
      createBuffer: vi.fn((channels: number, len: number, sr: number) => {
        const left = new Float32Array(len)
        const right = new Float32Array(len)
        return {
          numberOfChannels: channels,
          length: len,
          sampleRate: sr,
          copyToChannel: (data: Float32Array, ch: number) => {
            if (ch === 0) captured.left = data
            if (ch === 1) captured.right = data
          },
          getChannelData: (ch: number) => (ch === 0 ? left : right),
        }
      }),
    }
    vi.stubGlobal(
      'AudioContext',
      vi.fn(function AudioContext() {
        return ctx
      }),
    )
    vi.stubGlobal('fetch', vi.fn(async () => new Response(new ArrayBuffer(8), { status: 200 })))
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:learning-stereo')

    const result = await buildPartLearningStereoObjectUrl({
      activePart: 'lead',
      activeUrl: 'blob:solo',
      otherParts: [{ part: 'tenor', url: 'blob:acc' }],
      soloSide: 'left',
    })

    expect(result.url).toBe('blob:learning-stereo')
    expect(captured.left).toBeDefined()
    expect(captured.right).toBeDefined()

    let lSoloCorr = 0
    let channelDiff = 0
    for (let i = 0; i < length; i++) {
      lSoloCorr += captured.left![i]! * soloMono[i]!
      channelDiff += Math.abs(captured.left![i]! - captured.right![i]!)
    }
    expect(lSoloCorr).toBeGreaterThan(length * 0.45)
    expect(channelDiff).toBeGreaterThan(length * 0.1)
  })
})
