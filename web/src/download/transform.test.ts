import { describe, expect, it, vi } from 'vitest'
import {
  resolveOutputFormat,
  downloadFilename,
  audioBufferToWav,
  prepareDownloadBytes,
} from './transform'
import { IDENTITY_TRANSFORM } from '../types/audio'

describe('resolveOutputFormat', () => {
  it('keeps the requested container including after transforms', () => {
    expect(resolveOutputFormat('m4a', IDENTITY_TRANSFORM)).toBe('m4a')
    expect(resolveOutputFormat('m4a', { pitchSemitones: 1, speed: 1 })).toBe('m4a')
    expect(resolveOutputFormat('mp3', { pitchSemitones: 1, speed: 1 })).toBe('mp3')
  })

  it('keeps m4a extension in filenames when transforming', () => {
    expect(downloadFilename('bass', 'm4a', { pitchSemitones: -2, speed: 1 })).toBe('bass_-2st.m4a')
  })
})

describe('audioBufferToWav', () => {
  it('encodes a mono buffer to wav bytes', () => {
    const samples = new Float32Array([0, 0.5, -0.5, 1])
    const buffer = {
      numberOfChannels: 1,
      sampleRate: 8000,
      length: samples.length,
      getChannelData: () => samples,
    } as unknown as AudioBuffer
    const wav = audioBufferToWav(buffer)
    expect(wav.byteLength).toBe(44 + samples.length * 2)
    expect(String.fromCharCode(...wav.slice(0, 4))).toBe('RIFF')
    expect(String.fromCharCode(...wav.slice(8, 12))).toBe('WAVE')
  })
})

describe('prepareDownloadBytes', () => {
  it('returns input for identity m4a at original quality', async () => {
    const input = new Uint8Array([1, 2, 3])
    const out = await prepareDownloadBytes({
      input,
      format: 'm4a',
      transform: IDENTITY_TRANSFORM,
      encodeQuality: 'original',
    })
    expect(out).toBe(input)
  })

  it('throws when aborted before work', async () => {
    const c = new AbortController()
    c.abort()
    await expect(
      prepareDownloadBytes({
        input: new Uint8Array([1]),
        format: 'm4a',
        signal: c.signal,
      }),
    ).rejects.toThrow(/Abort/)
  })

  it('surfaces decode/transform failures for non-identity m4a', async () => {
    vi.stubGlobal(
      'AudioContext',
      vi.fn(function AudioContext() {
        return {
          decodeAudioData: async () => {
            throw new Error('decode failed')
          },
          close: async () => {},
        }
      }),
    )
    await expect(
      prepareDownloadBytes({
        input: new Uint8Array([1, 2, 3, 4]),
        format: 'm4a',
        transform: { pitchSemitones: 1, speed: 1 },
      }),
    ).rejects.toThrow(/decode failed/)
    vi.unstubAllGlobals()
  })
})
