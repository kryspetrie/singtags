/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it, vi, beforeEach } from 'vitest'
import {
  decodeAudioDataExclusive,
  formatAudioDecodeError,
  isAudioDecodeFailure,
} from './decodeLock'

describe('decodeLock', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('recognizes Safari EncodingError Decoding failed', () => {
    const err = new DOMException('Decoding failed', 'EncodingError')
    expect(isAudioDecodeFailure(err)).toBe(true)
    expect(formatAudioDecodeError(err)).toMatch(/decode audio/i)
  })

  it('keeps specific MIDI / WMA guard messages', () => {
    expect(formatAudioDecodeError(new Error('This mix is a MIDI file, not browser-playable'))).toMatch(
      /MIDI/i,
    )
    expect(
      formatAudioDecodeError(
        new Error('This mix is a WMA/ASF file that can’t play in the browser.'),
      ),
    ).toMatch(/WMA\/ASF/i)
  })

  it('serializes concurrent decodes', async () => {
    let inflight = 0
    let maxInflight = 0
    const decodeAudioData = vi.fn(async () => {
      inflight++
      maxInflight = Math.max(maxInflight, inflight)
      await new Promise((r) => setTimeout(r, 20))
      inflight--
      return {
        length: 1,
        numberOfChannels: 1,
        sampleRate: 48_000,
        getChannelData: () => new Float32Array(1),
      } as unknown as AudioBuffer
    })

    vi.stubGlobal(
      'OfflineAudioContext',
      class {
        decodeAudioData = decodeAudioData
        constructor(_c: number, _l: number, _sr: number) {}
      },
    )

    const bytes = new ArrayBuffer(8)
    new Uint8Array(bytes).set([0xff, 0xfb, 0x90, 0x00, 0x00, 0x00, 0x00, 0x00])

    await Promise.all([
      decodeAudioDataExclusive(bytes, { offlineSampleRate: 48_000 }),
      decodeAudioDataExclusive(bytes.slice(0), { offlineSampleRate: 48_000 }),
      decodeAudioDataExclusive(bytes.slice(0), { offlineSampleRate: 48_000 }),
    ])

    expect(maxInflight).toBe(1)
    expect(decodeAudioData).toHaveBeenCalledTimes(3)
  })

  it('runs priority decodes ahead of queued background work', async () => {
    const finished: string[] = []

    vi.stubGlobal(
      'OfflineAudioContext',
      class {
        constructor(_c: number, _l: number, _sr: number) {}
        decodeAudioData = async () => {
          await new Promise((r) => setTimeout(r, 25))
          return {
            length: 1,
            numberOfChannels: 1,
            sampleRate: 48_000,
            getChannelData: () => new Float32Array(1),
          } as unknown as AudioBuffer
        }
      },
    )

    const bytes = new ArrayBuffer(8)
    new Uint8Array(bytes).set([0xff, 0xfb, 0x90, 0x00, 0x00, 0x00, 0x00, 0x00])

    const track = (id: string, p: Promise<AudioBuffer>) =>
      p.then((buf) => {
        finished.push(id)
        return buf
      })

    const bg1 = track('bg1', decodeAudioDataExclusive(bytes, { offlineSampleRate: 48_000 }))
    // Let bg1 claim the pump before enqueueing the rest.
    await new Promise((r) => setTimeout(r, 5))
    const bg2 = track(
      'bg2',
      decodeAudioDataExclusive(bytes.slice(0), { offlineSampleRate: 48_000 }),
    )
    const live = track(
      'live',
      decodeAudioDataExclusive(bytes.slice(0), {
        offlineSampleRate: 48_000,
        priority: true,
      }),
    )

    await Promise.all([bg1, bg2, live])
    // bg1 already running; live jumps the queue ahead of bg2.
    expect(finished).toEqual(['bg1', 'live', 'bg2'])
  })
})
