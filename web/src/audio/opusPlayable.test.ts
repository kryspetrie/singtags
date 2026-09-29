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
  OggOpusDecoder: vi.fn(function MockMain() {
    return {
      ready: Promise.resolve(),
      decodeFile,
      reset,
      free: vi.fn(),
    }
  }),
}))

describe('opusPlayable', () => {
  beforeEach(() => {
    vi.resetModules()
    resetCodecSupportForTests()
    decodeFile.mockReset()
    reset.mockClear()
    vi.spyOn(document, 'createElement').mockReturnValue({
      canPlayType: () => '',
    } as unknown as HTMLAudioElement)
    vi.spyOn(URL, 'createObjectURL').mockImplementation(() => 'blob:wav-playable')
  })

  it('transcodes Opus to a WAV object URL when native Opus is unsupported', async () => {
    const mono = new Float32Array([0.25, -0.25])
    decodeFile.mockResolvedValueOnce({
      channelData: [mono],
      samplesDecoded: 2,
      sampleRate: 48_000,
      errors: [],
    })
    const {
      playableObjectUrlFromAudioBytes,
      resetOpusPlayableForTests,
      needsOpusOnDeviceTranscode,
    } = await import('./opusPlayable')
    resetOpusPlayableForTests()
    expect(needsOpusOnDeviceTranscode()).toBe(true)

    const ogg = new Uint8Array(16)
    ogg[0] = 0x4f
    ogg[1] = 0x67
    ogg[2] = 0x67
    ogg[3] = 0x53
    const url = await playableObjectUrlFromAudioBytes(ogg.buffer, 'audio/ogg', 'test:lead')
    expect(url).toBe('blob:wav-playable')
    expect(decodeFile).toHaveBeenCalledOnce()

    // Second resolve hits session Blob cache — no second WASM decode.
    decodeFile.mockClear()
    const url2 = await playableObjectUrlFromAudioBytes(ogg.buffer, 'audio/ogg', 'test:lead')
    expect(url2).toBe('blob:wav-playable')
    expect(decodeFile).not.toHaveBeenCalled()
  })

  it('marks WASM unavailable when decoder load fails', async () => {
    vi.doMock('ogg-opus-decoder', () => ({
      OggOpusDecoderWebWorker: vi.fn(function FailWorker() {
        throw new Error('worker blocked')
      }),
      OggOpusDecoder: vi.fn(function FailMain() {
        throw new Error('main blocked')
      }),
    }))
    const { noteOpusWasmUnavailable, isOpusWasmUnavailable, resetOpusPlayableForTests } =
      await import('./opusPlayable')
    resetOpusPlayableForTests()
    noteOpusWasmUnavailable()
    expect(isOpusWasmUnavailable()).toBe(true)
  })
})
