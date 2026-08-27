import { beforeEach, describe, expect, it, vi } from 'vitest'

const configure = vi.fn()
const encode = vi.fn(() => new Uint8Array([1, 1]))
const finalize = vi.fn(() => new Uint8Array([2]))

vi.mock('wasm-media-encoders', () => ({
  createEncoder: vi.fn(async () => ({ configure, encode, finalize })),
}))

vi.mock('wasm-media-encoders/wasm/mp3?url', () => ({ default: '/mp3.wasm' }))
vi.mock('wasm-media-encoders/wasm/ogg?url', () => ({ default: '/ogg.wasm' }))

const trackAdd = vi.fn(async () => {})
const trackClose = vi.fn()
const outputStart = vi.fn(async () => {})
const outputFinalize = vi.fn(async () => {})
const bufferTarget = { buffer: new ArrayBuffer(8) }

vi.mock('mediabunny', () => ({
  canEncodeAudio: vi.fn(async () => true),
  Output: vi.fn(function Output() {
    return {
      addAudioTrack: vi.fn(),
      start: outputStart,
      finalize: outputFinalize,
    }
  }),
  BufferTarget: vi.fn(function BufferTarget() {
    return bufferTarget
  }),
  Mp4OutputFormat: vi.fn(),
  OggOutputFormat: vi.fn(),
  AudioBufferSource: vi.fn(function AudioBufferSource() {
    return { add: trackAdd, close: trackClose }
  }),
}))

describe('encode', () => {
  beforeEach(() => {
    configure.mockClear()
    encode.mockClear()
    finalize.mockClear()
    trackAdd.mockClear()
    trackClose.mockClear()
    outputStart.mockClear()
    outputFinalize.mockClear()
  })

  it('encodeAudioBuffer produces mp3 and ogg bytes as stereo', async () => {
    const { encodeAudioBuffer } = await import('./encode')
    const buffer = {
      numberOfChannels: 2,
      length: 4,
      sampleRate: 44100,
      getChannelData: (ch: number) => new Float32Array([0, 0.1, -0.1, ch]),
    } as unknown as AudioBuffer
    const mp3 = await encodeAudioBuffer(buffer, 'mp3')
    expect(mp3.byteLength).toBeGreaterThan(0)
    expect(configure).toHaveBeenCalledWith(
      expect.objectContaining({ channels: 2, vbrQuality: 2 }),
    )
    const ogg = await encodeAudioBuffer(buffer, 'ogg')
    expect(ogg.byteLength).toBeGreaterThan(0)
  })

  it('compact quality stays stereo with higher VBR q', async () => {
    const { encodeAudioBuffer } = await import('./encode')
    const buffer = {
      numberOfChannels: 2,
      length: 4,
      sampleRate: 44100,
      getChannelData: (ch: number) => new Float32Array([0, 0.1, -0.1, ch]),
    } as unknown as AudioBuffer
    configure.mockClear()
    await encodeAudioBuffer(buffer, 'mp3', { quality: 'compact' })
    expect(configure).toHaveBeenCalledWith(
      expect.objectContaining({ channels: 2, vbrQuality: 5 }),
    )
  })

  it('encodeAudioBufferToM4a uses Mediabunny AAC path', async () => {
    const { encodeAudioBufferToM4a } = await import('./encode')
    const buffer = {
      numberOfChannels: 2,
      length: 4,
      sampleRate: 44100,
      getChannelData: (ch: number) => new Float32Array([0, 0.1, -0.1, ch]),
    } as unknown as AudioBuffer
    const out = await encodeAudioBufferToM4a(buffer, { quality: 'compact' })
    expect(out.byteLength).toBe(8)
    expect(trackAdd).toHaveBeenCalledWith(buffer)
    expect(outputFinalize).toHaveBeenCalled()
  })

  it('encodeAudioBufferToOggOpus uses Mediabunny Opus path', async () => {
    const { encodeAudioBufferToOggOpus } = await import('./encode')
    const buffer = {
      numberOfChannels: 2,
      length: 4,
      sampleRate: 44100,
      getChannelData: (ch: number) => new Float32Array([0, 0.1, -0.1, ch]),
    } as unknown as AudioBuffer
    const out = await encodeAudioBufferToOggOpus(buffer, { quality: 'compact' })
    expect(out.byteLength).toBe(8)
    expect(trackAdd).toHaveBeenCalledWith(buffer)
  })

  it('encodeDecodedBytes decodes then encodes', async () => {
    vi.stubGlobal(
      'AudioContext',
      vi.fn(function AudioContext() {
        return {
          decodeAudioData: async () =>
            ({
              numberOfChannels: 1,
              length: 2,
              sampleRate: 44100,
              getChannelData: () => new Float32Array([0, 0]),
            }) as unknown as AudioBuffer,
          close: async () => {},
        }
      }),
    )
    const { encodeDecodedBytes } = await import('./encode')
    const out = await encodeDecodedBytes(new Uint8Array([1, 2, 3, 4]), 'mp3')
    expect(out.byteLength).toBeGreaterThan(0)
    vi.unstubAllGlobals()
  })
})
