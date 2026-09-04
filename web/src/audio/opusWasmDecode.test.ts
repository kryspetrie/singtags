/**
 * @vitest-environment happy-dom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { resetCodecSupportForTests } from './codecSupport'

const decodeFile = vi.fn()
const reset = vi.fn(async () => {})

vi.mock('ogg-opus-decoder', () => ({
  OggOpusDecoderWebWorker: vi.fn(function MockWorker() {
    return {
      ready: Promise.resolve(),
      decodeFile,
      reset,
      free: vi.fn(),
    }
  }),
}))

describe('opusWasmDecode', () => {
  beforeEach(() => {
    vi.resetModules()
    resetCodecSupportForTests()
    decodeFile.mockReset()
    reset.mockClear()
  })

  it('builds an AudioBuffer from WASM channel data', async () => {
    const left = new Float32Array([0.1, -0.2, 0.3])
    const right = new Float32Array([-0.1, 0.2, -0.3])
    decodeFile.mockResolvedValueOnce({
      channelData: [left, right],
      samplesDecoded: 3,
      sampleRate: 48_000,
      errors: [],
    })
    const { decodeOggOpusToAudioBuffer } = await import('./opusWasmDecode')
    const buf = await decodeOggOpusToAudioBuffer(new Uint8Array([0x4f, 0x67, 0x67, 0x53]))
    expect(buf.numberOfChannels).toBe(2)
    expect(buf.length).toBe(3)
    expect(buf.sampleRate).toBe(48_000)
    expect(buf.getChannelData(0)[0]).toBeCloseTo(0.1, 5)
    expect(buf.getChannelData(0)[1]).toBeCloseTo(-0.2, 5)
    expect(reset).toHaveBeenCalled()
  })
})

describe('decodeLock wasm path', () => {
  beforeEach(() => {
    vi.resetModules()
    resetCodecSupportForTests()
    decodeFile.mockReset()
    reset.mockClear()
    vi.spyOn(document, 'createElement').mockReturnValue({
      canPlayType: () => '',
    } as unknown as HTMLAudioElement)
  })

  it('uses WASM for Ogg when native Opus is unsupported', async () => {
    const mono = new Float32Array([0.5, -0.5])
    decodeFile.mockResolvedValueOnce({
      channelData: [mono],
      samplesDecoded: 2,
      sampleRate: 48_000,
      errors: [],
    })
    const { decodeAudioDataExclusive } = await import('./decodeLock')
    // Minimal OggS header so sniffAudioMagic returns ogg
    const bytes = new Uint8Array(16)
    bytes[0] = 0x4f
    bytes[1] = 0x67
    bytes[2] = 0x67
    bytes[3] = 0x53
    const buf = await decodeAudioDataExclusive(bytes.buffer)
    expect(buf.length).toBe(2)
    expect(decodeFile).toHaveBeenCalled()
  })
})
