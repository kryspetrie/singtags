/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it, vi, beforeEach } from 'vitest'
import {
  buildPartLearningStereoObjectUrl,
  equalPowerPanGains,
  mixPanForPart,
  monoSoloToHardPanObjectUrl,
  ULTRA_MIX_PAN,
} from './partLeftReconstruct'
import { FakeAudioBuffer } from './audioBufferFactory'
import { resetSharedAudioContextForTests } from './channelSolo'

function sineMono(length: number, freq: number, sampleRate: number): Float32Array {
  const out = new Float32Array(length)
  for (let i = 0; i < length; i++) {
    out[i] = Math.sin((2 * Math.PI * freq * i) / sampleRate)
  }
  return out
}

function mockMonoBuffer(mono: Float32Array, sampleRate = 44100): AudioBuffer {
  const buf = new FakeAudioBuffer(1, mono.length, sampleRate)
  buf.getChannelData(0).set(mono)
  return buf as unknown as AudioBuffer
}

function stubAudioContext(decode: () => Promise<AudioBuffer>) {
  const ctx = {
    state: 'running',
    resume: vi.fn(),
    decodeAudioData: vi.fn(async () => decode()),
    createBuffer: (channels: number, len: number, sr: number) =>
      new FakeAudioBuffer(channels, len, sr) as unknown as AudioBuffer,
  }
  vi.stubGlobal(
    'AudioContext',
    vi.fn(function AudioContext() {
      return ctx
    }),
  )
  return ctx
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
    stubAudioContext(async () => {
      decodeCall++
      if (decodeCall === 1) return mockMonoBuffer(soloMono, sampleRate)
      return mockMonoBuffer(accMono, sampleRate)
    })
    vi.stubGlobal('fetch', vi.fn(async () => new Response(new ArrayBuffer(8), { status: 200 })))

    let wavBlob: Blob | null = null
    vi.spyOn(URL, 'createObjectURL').mockImplementation((blob: Blob | MediaSource) => {
      if (blob instanceof Blob) wavBlob = blob
      return 'blob:learning-stereo'
    })

    const result = await buildPartLearningStereoObjectUrl({
      activePart: 'lead',
      activeUrl: 'blob:solo',
      otherParts: [{ part: 'tenor', url: 'blob:acc' }],
      soloSide: 'left',
    })

    expect(result.url).toBe('blob:learning-stereo')
    expect(wavBlob).toBeTruthy()
    // Parse WAV: after 44-byte header, interleaved int16 L/R
    const bytes = new Uint8Array(await wavBlob!.arrayBuffer())
    expect(bytes[22]).toBe(2) // num channels
    const view = new DataView(bytes.buffer)
    let lSoloCorr = 0
    for (let i = 0, frame = 0; i + 3 < bytes.length - 44; i += 4, frame++) {
      const off = 44 + i
      const l = view.getInt16(off, true) / 0x8000
      if (frame < length) lSoloCorr += l * soloMono[frame]!
    }
    expect(lSoloCorr).toBeGreaterThan(length * 0.45)
    // Not dual-mono: channels must differ (solo vs accompaniment tones)
    let sumAbsDiff = 0
    for (let off = 44; off + 3 < bytes.length; off += 4) {
      const l = view.getInt16(off, true)
      const r = view.getInt16(off + 2, true)
      sumAbsDiff += Math.abs(l - r)
    }
    expect(sumAbsDiff).toBeGreaterThan(length * 100)
  })

  it('monoSoloToHardPanObjectUrl puts solo on only one channel (never dual-mono)', async () => {
    const sampleRate = 44100
    const length = 256
    const soloMono = sineMono(length, 440, sampleRate)
    stubAudioContext(async () => mockMonoBuffer(soloMono, sampleRate))
    vi.stubGlobal('fetch', vi.fn(async () => new Response(new ArrayBuffer(8), { status: 200 })))

    let wavBlob: Blob | null = null
    vi.spyOn(URL, 'createObjectURL').mockImplementation((blob: Blob | MediaSource) => {
      if (blob instanceof Blob) wavBlob = blob
      return 'blob:hard-pan'
    })

    await monoSoloToHardPanObjectUrl('blob:solo', 'right')
    expect(wavBlob).toBeTruthy()
    const bytes = new Uint8Array(await wavBlob!.arrayBuffer())
    expect(bytes[22]).toBe(2)
    let leftEnergy = 0
    let rightEnergy = 0
    const view = new DataView(bytes.buffer)
    for (let off = 44; off + 3 < bytes.length; off += 4) {
      leftEnergy += Math.abs(view.getInt16(off, true))
      rightEnergy += Math.abs(view.getInt16(off + 2, true))
    }
    expect(leftEnergy).toBe(0)
    expect(rightEnergy).toBeGreaterThan(0)
  })
})
