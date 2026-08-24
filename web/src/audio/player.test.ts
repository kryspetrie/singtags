/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { TagAudioPlayer, stereoBalanceGains } from './player'

vi.mock('./soundtouch', () => ({
  createSoundTouchNode: vi.fn(async () => null),
}))

describe('stereoBalanceGains', () => {
  it('boosts the favored side but never past 0 dBFS headroom', () => {
    // Unknown peaks → treat as already full-scale, so no boost past headroom
    expect(stereoBalanceGains(0)).toEqual({ l: 0.99, r: 0.99 })
    expect(stereoBalanceGains(1).l).toBeCloseTo(0.99)
    expect(stereoBalanceGains(1).r).toBeCloseTo(0.99)
    expect(stereoBalanceGains(-1).l).toBeCloseTo(0.99)
    expect(stereoBalanceGains(-1).r).toBeCloseTo(0.99)
  })

  it('allows boost when channel peak has headroom', () => {
    const g = stereoBalanceGains(1, { peakL: 0.5, peakR: 0.4 })
    expect(g.l).toBeCloseTo(1) // unfavored side stays at unity
    expect(g.r).toBeCloseTo(2) // 0.4 * 2 = 0.8 < 0.99
    const hot = stereoBalanceGains(1, { peakL: 0.9, peakR: 0.9 })
    expect(hot.r).toBeCloseTo(0.99 / 0.9)
    expect(hot.r * 0.9).toBeLessThanOrEqual(0.99)
  })

  it('applies normalize multipliers within headroom', () => {
    const g = stereoBalanceGains(0, { normL: 2, normR: 1, peakL: 0.4, peakR: 0.8 })
    expect(g.l).toBeCloseTo(2) // 0.4 * 2 = 0.8 < 0.99
    expect(g.r).toBeCloseTo(1) // already at unity; cap never raises gain
    const hot = stereoBalanceGains(0, { normL: 3, normR: 1, peakL: 0.5, peakR: 0.9 })
    expect(hot.l).toBeCloseTo(0.99 / 0.5)
    expect(hot.l * 0.5).toBeLessThanOrEqual(0.99)
  })
})

describe('TagAudioPlayer', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('loads, seeks, loops, plays, pauses', async () => {
    const play = vi.fn(async () => {})
    const pause = vi.fn()
    const load = vi.fn()
    class FakeAudio {
      preload = ''
      crossOrigin = ''
      paused = true
      currentTime = 0
      duration = 10
      loop = false
      playbackRate = 1
      preservesPitch = true
      src = ''
      readyState = 1 // HAVE_METADATA — load() must not hang waiting for events
      error = null
      addEventListener = vi.fn()
      removeEventListener = vi.fn()
      removeAttribute = vi.fn()
      load = load
      play = play
      pause = pause
    }
    vi.stubGlobal(
      'Audio',
      vi.fn(function Audio() {
        return new FakeAudio()
      }),
    )
    vi.stubGlobal(
      'AudioContext',
      vi.fn(function AudioContext() {
        const gain = () => ({
          gain: { value: 1 },
          connect: vi.fn(),
          disconnect: vi.fn(),
        })
        return {
          state: 'running',
          resume: vi.fn(async () => {}),
          close: vi.fn(async () => {}),
          destination: {},
          createMediaElementSource: vi.fn(() => ({
            connect: vi.fn(),
            disconnect: vi.fn(),
          })),
          createChannelSplitter: vi.fn(() => ({
            connect: vi.fn(),
            disconnect: vi.fn(),
          })),
          createChannelMerger: vi.fn(() => ({
            connect: vi.fn(),
            disconnect: vi.fn(),
          })),
          createGain: vi.fn(() => gain()),
          decodeAudioData: vi.fn(async () => ({
            numberOfChannels: 2,
            length: 1,
            getChannelData: () => new Float32Array([0]),
          })),
        }
      }),
    )
    vi.stubGlobal('fetch', vi.fn(async () => new Response(new ArrayBuffer(8), { status: 200 })))

    const p = new TagAudioPlayer()
    p.setUpdateListener(() => {})
    p.setEndedListener(() => {})
    await p.load('/sample.mp4', 'stereo')
    p.seek(3)
    expect(p.currentTime).toBe(3)
    p.setLoop(true)
    await p.play()
    expect(play).toHaveBeenCalled()
    await p.setSolo('left')
    await p.setBalance(-0.5)
    expect(p.getBalance()).toBe(-0.5)
    p.pause()
    expect(pause).toHaveBeenCalled()
    p.dispose()
    vi.unstubAllGlobals()
  })
})
