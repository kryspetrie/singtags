/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { TagAudioPlayer, stereoBalanceGains, channelsEffectivelyMono } from './player'
import { originalSecondsToPlayable } from './transformContract'

const bakeFn = vi.fn()
const decodeFn = vi.fn()

vi.mock('./bakeClient', () => ({
  processOfflineTransform: (...args: unknown[]) => bakeFn(...args),
  preloadBakePipeline: () => Promise.resolve(),
  resetBakeClientForTests: () => {},
  cancelAllWorkerJobs: () => {},
}))

vi.mock('./decodeCache', async () => {
  const actual = await vi.importActual<typeof import('./decodeCache')>('./decodeCache')
  return {
    ...actual,
    decodeService: {
      decode: (...args: unknown[]) => decodeFn(...args),
      getCached: () => undefined,
      clear: () => {},
    },
  }
})

type StartCall = { offset: number; duration?: number; rate: number; bufferLength: number }

function makeTrack(url: string, durationSec: number, sampleRate = 44100) {
  const length = Math.round(durationSec * sampleRate)
  const left = new Float32Array(length)
  const right = new Float32Array(length)
  for (let i = 0; i < length; i++) {
    left[i] = 0.1
    right[i] = -0.05
  }
  const buffer = {
    numberOfChannels: 2,
    length,
    sampleRate,
    duration: durationSec,
    getChannelData: (c: number) => (c === 0 ? left : right),
  } as unknown as AudioBuffer
  return {
    buffer,
    identity: { url, revision: `${url}#v1` },
    sampleRate,
    channels: 2,
    peakL: 0.1,
    peakR: 0.05,
    effectivelyMono: false,
    byteSize: length * 2 * 4,
  }
}

function makeStretched(input: AudioBuffer, speed: number): AudioBuffer {
  const factor = 1 / speed
  const length = Math.round(input.length * factor)
  return {
    numberOfChannels: input.numberOfChannels,
    length,
    sampleRate: input.sampleRate,
    duration: length / input.sampleRate,
    getChannelData: () => new Float32Array(length),
  } as unknown as AudioBuffer
}

function installAudioContext(starts: StartCall[]) {
  vi.stubGlobal(
    'AudioContext',
    vi.fn(function AudioContext() {
      const gain = () => ({
        gain: { value: 1 },
        connect: vi.fn(),
        disconnect: vi.fn(),
      })
      const ctx = {
        state: 'running' as const,
        currentTime: 0,
        resume: vi.fn(async () => {}),
        close: vi.fn(async () => {}),
        destination: {},
        createBufferSource: vi.fn(() => {
          const src = {
            buffer: null as AudioBuffer | null,
            loop: false,
            loopStart: 0,
            loopEnd: 0,
            playbackRate: { value: 1 },
            onended: null as (() => void) | null,
            connect: vi.fn(),
            disconnect: vi.fn(),
            start: vi.fn((when = 0, offset = 0, duration?: number) => {
              void when
              starts.push({
                offset,
                duration,
                rate: src.playbackRate.value,
                bufferLength: src.buffer?.length ?? 0,
              })
            }),
            stop: vi.fn(),
          }
          return src
        }),
        createChannelSplitter: vi.fn(() => ({
          connect: vi.fn(),
          disconnect: vi.fn(),
        })),
        createChannelMerger: vi.fn(() => ({
          connect: vi.fn(),
          disconnect: vi.fn(),
        })),
        createGain: vi.fn(() => gain()),
      }
      return ctx
    }),
  )
}

describe('stereoBalanceGains', () => {
  it('ducks the unfavored side and caps boost to headroom', () => {
    expect(stereoBalanceGains(0)).toEqual({ l: 0.99, r: 0.99 })
    expect(stereoBalanceGains(1).l).toBeCloseTo(0)
    expect(stereoBalanceGains(1).r).toBeCloseTo(0.99)
  })
})

describe('channelsEffectivelyMono', () => {
  it('detects distinct stereo as not mono', () => {
    const left = new Float32Array([0.5, 0.4, 0.3, 0.2, 0.1])
    const right = new Float32Array([-0.5, -0.4, -0.3, -0.2, -0.1])
    expect(channelsEffectivelyMono(left, right)).toBe(false)
  })
})

describe('TagAudioPlayer', () => {
  const starts: StartCall[] = []

  beforeEach(() => {
    starts.length = 0
    bakeFn.mockReset()
    decodeFn.mockReset()
    decodeFn.mockImplementation(async (url: string) => {
      if (url.includes('long')) return makeTrack(url, 2)
      if (url.includes('short')) return makeTrack(url, 0.5)
      return makeTrack(url, 1)
    })
    bakeFn.mockImplementation(async (input: AudioBuffer, _pitch: number, speed: number) => {
      if (Math.abs(speed - 1) < 0.001) return input
      return makeStretched(input, speed)
    })
    installAudioContext(starts)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('loads and plays identity at rate 1 without bake', async () => {
    const p = new TagAudioPlayer()
    await p.load('/sample.m4a', 'stereo')
    expect(p.duration).toBe(1)
    expect(p.usingBake).toBe(false)
    await p.play()
    expect(p.paused).toBe(false)
    expect(bakeFn).not.toHaveBeenCalled()
    expect(starts.at(-1)?.rate).toBe(1)
    expect(starts.at(-1)?.offset).toBeCloseTo(0, 3)
    p.dispose()
  })

  it('setSpeed(0.5) bakes and keeps source rate 1', async () => {
    const p = new TagAudioPlayer()
    await p.load('/sample.m4a')
    await p.setSpeed(0.5)
    expect(bakeFn).toHaveBeenCalledTimes(1)
    expect(p.usingBake).toBe(true)
    await p.play()
    expect(starts.at(-1)?.rate).toBe(1)
    p.dispose()
  })

  it('identity setSpeed(1)/setPitch(0) does not bake', async () => {
    const p = new TagAudioPlayer()
    await p.load('/sample.m4a')
    await p.setSpeed(1)
    await p.setPitchSemitones(0)
    expect(bakeFn).not.toHaveBeenCalled()
    p.dispose()
  })

  it('balance updates without rebake', async () => {
    const p = new TagAudioPlayer()
    await p.load('/sample.m4a')
    bakeFn.mockClear()
    await p.setBalance(-1)
    expect(p.getBalance()).toBe(-1)
    expect(bakeFn).not.toHaveBeenCalled()
    p.dispose()
  })

  it('bake failure keeps previous and surfaces error', async () => {
    bakeFn.mockResolvedValue(null)
    const p = new TagAudioPlayer()
    await p.load('/sample.m4a')
    await p.setSpeed(0.5)
    expect(p.bakeError).toBeTruthy()
    expect(p.usingBake).toBe(false)
    expect(p.getSpeed()).toBe(1)
    p.dispose()
  })

  describe('scrub / seek position mapping', () => {
    it('seek then play starts BufferSource at the scrubbed original offset (identity)', async () => {
      const p = new TagAudioPlayer()
      await p.load('/sample.m4a')
      p.seek(0.37)
      expect(p.currentTime).toBeCloseTo(0.37, 3)
      await p.play()
      expect(starts.at(-1)?.offset).toBeCloseTo(0.37, 3)
      expect(starts.at(-1)?.rate).toBe(1)
      p.dispose()
    })

    it('seek while playing restarts at the new scrub position, not 0', async () => {
      const p = new TagAudioPlayer()
      await p.load('/sample.m4a')
      await p.play()
      expect(starts.at(-1)?.offset).toBeCloseTo(0, 3)
      await p.seek(0.62)
      expect(p.currentTime).toBeCloseTo(0.62, 3)
      expect(starts.at(-1)?.offset).toBeCloseTo(0.62, 3)
      p.dispose()
    })

    it('under speed 0.5, scrub to original 0.25s maps to playable ~0.5s', async () => {
      const p = new TagAudioPlayer()
      await p.load('/sample.m4a')
      await p.setSpeed(0.5)
      await p.seek(0.25)
      expect(p.currentTime).toBeCloseTo(0.25, 3)
      expect(p.duration).toBeCloseTo(1, 5)
      await p.play()
      const expected = originalSecondsToPlayable(0.25, 44100, 44100, 88200)
      expect(starts.at(-1)?.offset).toBeCloseTo(expected, 3)
      expect(starts.at(-1)?.offset).toBeCloseTo(0.5, 2)
      expect(starts.at(-1)?.rate).toBe(1)
      p.dispose()
    })

    it('scrub mid-file then change speed remaps playable offset, keeps original time', async () => {
      const p = new TagAudioPlayer()
      await p.load('/sample.m4a')
      await p.seek(0.4)
      await p.play()
      await p.setSpeed(0.5)
      expect(p.currentTime).toBeCloseTo(0.4, 2)
      const expected = originalSecondsToPlayable(0.4, 44100, 44100, 88200)
      expect(starts.at(-1)?.offset).toBeCloseTo(expected, 2)
      p.dispose()
    })

    it('multiple scrubs never restart at 0 unless scrubbed there', async () => {
      const p = new TagAudioPlayer()
      await p.load('/sample.m4a')
      await p.play()
      for (const t of [0.1, 0.55, 0.9, 0.2]) {
        await p.seek(t)
        expect(starts.at(-1)?.offset).toBeCloseTo(t, 3)
        expect(p.currentTime).toBeCloseTo(t, 3)
      }
      p.dispose()
    })
  })

  describe('track switching', () => {
    it('loading a new track resets playhead to 0 (does not keep prior scrub)', async () => {
      const p = new TagAudioPlayer()
      await p.load('/a.m4a')
      await p.seek(0.7)
      expect(p.currentTime).toBeCloseTo(0.7, 3)
      await p.load('/b-long.m4a')
      expect(p.duration).toBe(2)
      expect(p.currentTime).toBe(0)
      await p.play()
      expect(starts.at(-1)?.offset).toBeCloseTo(0, 3)
      p.dispose()
    })

    it('switch tracks while playing starts the new track at 0, not old scrub', async () => {
      const p = new TagAudioPlayer()
      await p.load('/a.m4a')
      await p.play()
      await p.seek(0.8)
      expect(starts.at(-1)?.offset).toBeCloseTo(0.8, 3)
      await p.load('/b-long.m4a')
      expect(p.paused).toBe(true)
      expect(p.currentTime).toBe(0)
      await p.play()
      expect(starts.at(-1)?.offset).toBeCloseTo(0, 3)
      expect(p.duration).toBe(2)
      p.dispose()
    })

    it('stale onended from previous source cannot end or rewind the new track', async () => {
      const p = new TagAudioPlayer()
      await p.load('/a.m4a')
      await p.play()
      const firstSrc = (p as unknown as { bufferSource: { onended: (() => void) | null } })
        .bufferSource
      await p.load('/b-long.m4a')
      await p.seek(0.3)
      await p.play()
      firstSrc?.onended?.()
      expect(p.paused).toBe(false)
      expect(p.currentTime).toBeCloseTo(0.3, 2)
      expect(p.duration).toBe(2)
      p.dispose()
    })

    it('rapid load A then B: only B remains; play starts at 0 on B', async () => {
      const p = new TagAudioPlayer()
      const loadA = p.load('/a.m4a')
      const loadB = p.load('/b-long.m4a')
      await Promise.all([loadA, loadB])
      expect(p.duration).toBe(2)
      expect(p.currentTime).toBe(0)
      await p.play()
      expect(starts.at(-1)?.offset).toBeCloseTo(0, 3)
      p.dispose()
    })

    it('track switch abandons in-flight bake from previous track', async () => {
      let calls = 0
      bakeFn.mockImplementation(
        (input: AudioBuffer, _pitch: number, speed: number, opts?: { signal?: AbortSignal }) => {
          calls++
          if (calls === 1) {
            return new Promise<AudioBuffer>((_resolve, reject) => {
              opts?.signal?.addEventListener(
                'abort',
                () => reject(new DOMException('Aborted', 'AbortError')),
                { once: true },
              )
            })
          }
          return Promise.resolve(makeStretched(input, speed))
        },
      )
      const p = new TagAudioPlayer()
      await p.load('/a.m4a')
      const pending = p.setSpeed(0.5)
      await p.load('/b-long.m4a')
      await pending
      expect(p.duration).toBe(2)
      // New track re-applies requested non-identity speed via a fresh bake.
      expect(p.getSpeed()).toBe(0.5)
      expect(p.currentTime).toBe(0)
      p.dispose()
    })

    it('after switch, scrub on new track uses new duration bounds', async () => {
      const p = new TagAudioPlayer()
      await p.load('/short.m4a')
      expect(p.duration).toBe(0.5)
      await p.seek(0.4)
      await p.load('/b-long.m4a')
      await p.seek(1.5)
      expect(p.currentTime).toBeCloseTo(1.5, 3)
      await p.play()
      expect(starts.at(-1)?.offset).toBeCloseTo(1.5, 3)
      await p.seek(99)
      expect(p.currentTime).toBeCloseTo(2, 3)
      p.dispose()
    })
  })

  describe('A–B region + seek', () => {
    it('play region maps stop duration from original A–B under speed change', async () => {
      const p = new TagAudioPlayer()
      await p.load('/sample.m4a')
      await p.setSpeed(0.5)
      p.setPlayRegion(0.2, 0.6)
      await p.seek(0.2)
      await p.play()
      const last = starts.at(-1)!
      expect(last.offset).toBeCloseTo(0.4, 2)
      expect(last.duration).toBeCloseTo(0.8, 2)
      p.dispose()
    })
  })

  describe('pause / resume position', () => {
    it('pause then play resumes from captured playhead, not start', async () => {
      const p = new TagAudioPlayer()
      await p.load('/sample.m4a')
      await p.play()
      await p.seek(0.45)
      p.pause()
      expect(p.currentTime).toBeCloseTo(0.45, 3)
      await p.play()
      expect(starts.at(-1)?.offset).toBeCloseTo(0.45, 3)
      p.dispose()
    })
  })

  describe('regression: bake / region edge cases', () => {
    it('scrub during in-flight bake is preserved when bake completes', async () => {
      let resolveBake: (v: AudioBuffer) => void = () => {}
      bakeFn.mockImplementation(
        () =>
          new Promise<AudioBuffer>((resolve) => {
            resolveBake = resolve
          }),
      )
      const p = new TagAudioPlayer()
      await p.load('/sample.m4a')
      await p.play()
      await p.seek(0.2)
      const pending = p.setSpeed(0.5)
      await p.seek(0.55)
      expect(p.currentTime).toBeCloseTo(0.55, 3)
      resolveBake(makeStretched(makeTrack('/sample.m4a', 1).buffer, 0.5))
      await pending
      expect(p.currentTime).toBeCloseTo(0.55, 2)
      expect(starts.at(-1)?.offset).toBeCloseTo(
        originalSecondsToPlayable(0.55, 44100, 44100, 88200),
        2,
      )
      p.dispose()
    })

    it('rapid transform changes keep baking flag truthful for the latest request', async () => {
      const resolvers: Array<(v: AudioBuffer) => void> = []
      bakeFn.mockImplementation(
        () =>
          new Promise<AudioBuffer>((resolve) => {
            resolvers.push(resolve)
          }),
      )
      const p = new TagAudioPlayer()
      await p.load('/sample.m4a')
      const p1 = p.setSpeed(0.5)
      expect(p.baking).toBe(true)
      const p2 = p.setSpeed(0.75)
      expect(p.baking).toBe(true)
      // Finish the superseded bake (should be ignored)
      resolvers[0]?.(makeStretched(makeTrack('/sample.m4a', 1).buffer, 0.5))
      await p1
      expect(p.baking).toBe(true)
      resolvers[1]?.(makeStretched(makeTrack('/sample.m4a', 1).buffer, 0.75))
      await p2
      expect(p.baking).toBe(false)
      expect(p.getSpeed()).toBe(0.75)
      expect(p.usingBake).toBe(true)
      p.dispose()
    })

    it('aborting bake does not surface a bake error', async () => {
      bakeFn.mockImplementation(
        (_input: AudioBuffer, _p: number, _s: number, opts?: { signal?: AbortSignal }) =>
          new Promise<AudioBuffer>((_resolve, reject) => {
            opts?.signal?.addEventListener(
              'abort',
              () => reject(new DOMException('Aborted', 'AbortError')),
              { once: true },
            )
          }),
      )
      const p = new TagAudioPlayer()
      await p.load('/sample.m4a')
      const pending = p.setSpeed(0.5)
      await p.setSpeed(1)
      await pending
      expect(p.bakeError).toBeNull()
      expect(p.usingBake).toBe(false)
      expect(p.getSpeed()).toBe(1)
      p.dispose()
    })

    it('A–B natural end leaves playhead at region B and does not fire onEnded', async () => {
      const p = new TagAudioPlayer()
      const ended = vi.fn()
      p.setEndedListener(ended)
      await p.load('/sample.m4a')
      p.setPlayRegion(0.2, 0.4)
      await p.seek(0.2)
      await p.play()
      const src = (p as unknown as { bufferSource: { onended: (() => void) | null } }).bufferSource
      src!.onended!()
      expect(p.paused).toBe(true)
      expect(p.currentTime).toBeCloseTo(0.4, 3)
      expect(p.currentTime).toBeLessThan(0.99)
      expect(ended).not.toHaveBeenCalled()
      p.dispose()
    })

    it('full-buffer end fires onEnded', async () => {
      const p = new TagAudioPlayer()
      const ended = vi.fn()
      p.setEndedListener(ended)
      await p.load('/sample.m4a')
      await p.play()
      const src = (p as unknown as { bufferSource: { onended: (() => void) | null } }).bufferSource
      src!.onended!()
      expect(ended).toHaveBeenCalledTimes(1)
      p.dispose()
    })

    it('setTransform bakes once for pitch+speed', async () => {
      bakeFn.mockClear()
      const p = new TagAudioPlayer()
      await p.load('/sample.m4a')
      await p.setTransform(2, 0.5)
      expect(bakeFn).toHaveBeenCalledTimes(1)
      expect(p.getPitchSemitones()).toBe(2)
      expect(p.getSpeed()).toBe(0.5)
      p.dispose()
    })

    it('identity while already identity does not restart playback', async () => {
      const p = new TagAudioPlayer()
      await p.load('/sample.m4a')
      await p.play()
      const before = starts.length
      await p.setSpeed(1)
      await p.setPitchSemitones(0)
      expect(starts.length).toBe(before)
      expect(p.paused).toBe(false)
      p.dispose()
    })
  })
})
