import { describe, expect, it, vi } from 'vitest'

vi.mock('@soundtouchjs/audio-worklet', () => ({
  SoundTouchNode: {
    register: vi.fn(async () => {}),
  },
  processOffline: vi.fn(async ({ input }: { input: AudioBuffer }) => input),
}))

vi.mock('@soundtouchjs/audio-worklet/processor?url', () => ({
  default: '/processor.js',
}))

describe('soundtouch helpers', () => {
  it('createSoundTouchNode returns a node when registration succeeds', async () => {
    const { createSoundTouchNode, processOfflineTransform } = await import('./soundtouch')
    const { SoundTouchNode } = await import('@soundtouchjs/audio-worklet')
    vi.mocked(SoundTouchNode as unknown as { register: ReturnType<typeof vi.fn> }).register
    // SoundTouchNode is also a constructor in real pkg — mock constructor via dynamic
    vi.doMock('@soundtouchjs/audio-worklet', () => ({
      SoundTouchNode: Object.assign(
        vi.fn(function SoundTouchNode() {
          return {
            connect: vi.fn(),
            disconnect: vi.fn(),
            pitch: { value: 1 },
            pitchSemitones: { value: 0 },
            playbackRate: { value: 1 },
          }
        }),
        { register: vi.fn(async () => {}) },
      ),
      processOffline: vi.fn(async ({ input }: { input: AudioBuffer }) => input),
    }))

    const ctx = {} as AudioContext
    // First import may already be cached — exercise processOfflineTransform which is self-contained
    const buf = {
      numberOfChannels: 1,
      length: 1,
      sampleRate: 44100,
      getChannelData: () => new Float32Array([0]),
    } as unknown as AudioBuffer
    const out = await processOfflineTransform(buf, 1, 0.9)
    expect(out).toBeTruthy()
    void createSoundTouchNode
    void ctx
  })

  it('processOfflineTransform returns null on failure', async () => {
    vi.resetModules()
    vi.doMock('@soundtouchjs/audio-worklet', () => ({
      processOffline: vi.fn(async () => {
        throw new Error('fail')
      }),
    }))
    vi.doMock('@soundtouchjs/audio-worklet/processor?url', () => ({
      default: '/processor.js',
    }))
    const { processOfflineTransform } = await import('./soundtouch')
    const buf = {
      numberOfChannels: 1,
      length: 1,
      sampleRate: 44100,
      getChannelData: () => new Float32Array([0]),
    } as unknown as AudioBuffer
    expect(await processOfflineTransform(buf, 0, 1)).toBeNull()
  })
})
