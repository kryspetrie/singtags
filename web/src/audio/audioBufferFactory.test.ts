import { afterEach, describe, expect, it, vi } from 'vitest'
import { createAudioBuffer, FakeAudioBuffer } from './audioBufferFactory'

describe('createAudioBuffer', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('uses OfflineAudioContext with render length 1, not the buffer length', () => {
    const created: Array<{ channels: number; length: number; sampleRate: number }> = []
    const createBuffer = vi.fn(
      (channels: number, length: number, sampleRate: number) =>
        new FakeAudioBuffer(channels, length, sampleRate),
    )
    class MockOffline {
      createBuffer = createBuffer
      constructor(channels: number, length: number, sampleRate: number) {
        created.push({ channels, length, sampleRate })
      }
    }
    vi.stubGlobal('OfflineAudioContext', MockOffline)

    const buf = createAudioBuffer(2, 44100 * 90, 44100)
    expect(created).toEqual([{ channels: 2, length: 1, sampleRate: 44100 }])
    expect(createBuffer).toHaveBeenCalledWith(2, 44100 * 90, 44100)
    expect(buf.length).toBe(44100 * 90)
    expect(buf.numberOfChannels).toBe(2)
  })

  it('does not construct Offline context with full stretched length', () => {
    const lengths: number[] = []
    class MockOffline {
      createBuffer = (c: number, length: number, sr: number) => new FakeAudioBuffer(c, length, sr)
      constructor(_c: number, length: number, _sr: number) {
        lengths.push(length)
      }
    }
    vi.stubGlobal('OfflineAudioContext', MockOffline)

    // speed 0.5 → ~2× frames; factory must not use that as Offline render length
    createAudioBuffer(2, 44100 * 180, 44100)
    expect(lengths).toEqual([1])
  })
})
