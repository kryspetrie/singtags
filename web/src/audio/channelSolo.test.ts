/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { soloChannelToObjectUrl, resetSharedAudioContextForTests } from './channelSolo'

function mockAudioBuffer(): AudioBuffer {
  const left = new Float32Array([0.1, -0.2, 0.3])
  const right = new Float32Array([0.4, 0.5, -0.6])
  return {
    numberOfChannels: 2,
    length: 3,
    sampleRate: 44100,
    duration: 3 / 44100,
    getChannelData: (ch: number) => (ch === 0 ? left : right),
    copyToChannel: () => {},
    copyFromChannel: () => {},
    getChannelDataLength: () => 3,
  } as unknown as AudioBuffer
}

describe('channelSolo', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    resetSharedAudioContextForTests()
  })

  it('extracts left channel to a wav blob URL', async () => {
    const mono = {
      numberOfChannels: 1,
      length: 3,
      sampleRate: 44100,
      copyToChannel: vi.fn(),
      getChannelData: () => new Float32Array([0.1, -0.2, 0.3]),
    }
    const ctx = {
      state: 'running',
      resume: vi.fn(),
      decodeAudioData: vi.fn(async () => mockAudioBuffer()),
      createBuffer: vi.fn(() => mono),
    }
    vi.stubGlobal(
      'AudioContext',
      vi.fn(function AudioContext() {
        return ctx
      }),
    )
    vi.stubGlobal('fetch', vi.fn(async () => new Response(new ArrayBuffer(8), { status: 200 })))
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:wav')

    const url = await soloChannelToObjectUrl('/a.mp4', 'left')
    expect(url).toBe('blob:wav')
    expect(ctx.createBuffer).toHaveBeenCalled()
    expect(mono.copyToChannel).toHaveBeenCalled()
  })

  it('throws when fetch fails', async () => {
    vi.stubGlobal(
      'AudioContext',
      vi.fn(function AudioContext() {
        return { state: 'running', resume: vi.fn(), decodeAudioData: vi.fn() }
      }),
    )
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 500 })))
    await expect(soloChannelToObjectUrl('/bad', 'right')).rejects.toThrow(/500/)
  })
})
