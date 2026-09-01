/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it } from 'vitest'
import {
  bakeCacheKey,
  canonicalizeTransform,
  expectedFrames,
  isCanonicalIdentity,
  stretchFactor,
  originalFrameToPlayable,
  playableFrameToOriginal,
  originalSecondsToPlayable,
  playableSecondsToOriginal,
} from './transformContract'
import { synthSine, synthClickTrain, synthDelayedStereo, synthSilence } from './synthTone'
import {
  estimateDominantHz,
  measureRms,
  channelPeak,
  allFinite,
  findOnsets,
  estimateInterChannelDelay,
  midSideEnergy,
} from './analyzeTone'
import { bakeAudioBufferSync, bakeChannels } from './voiceTransform'

describe('canonicalizeTransform', () => {
  it('clamps and rounds; preserves fractional semitones (fine detune)', () => {
    expect(canonicalizeTransform(0, 1)).toEqual({ pitchSemitones: 0, speed: 1 })
    expect(canonicalizeTransform(-0, 1)).toEqual({ pitchSemitones: 0, speed: 1 })
    expect(canonicalizeTransform(1.6, 0.1 + 0.2)).toEqual({ pitchSemitones: 1.6, speed: 0.3 })
    expect(canonicalizeTransform(2.32, 1).pitchSemitones).toBe(2.32)
    expect(canonicalizeTransform(100, 9).pitchSemitones).toBe(12)
    expect(canonicalizeTransform(0, 0.01).speed).toBe(0.25)
    expect(isCanonicalIdentity(canonicalizeTransform(0, 1))).toBe(true)
    expect(isCanonicalIdentity(canonicalizeTransform(1, 1))).toBe(false)
  })
})

describe('expectedFrames', () => {
  it('locks the frame contract for UI speeds including 0.25', () => {
    expect(expectedFrames(1000, 1)).toBe(1000)
    expect(expectedFrames(1000, 0.5)).toBe(2000)
    expect(expectedFrames(1000, 0.25)).toBe(4000)
    expect(expectedFrames(1000, 2)).toBe(500)
    expect(stretchFactor(0.5)).toBe(2)
    expect(stretchFactor(0.25)).toBe(4)
  })
})

describe('bakeCacheKey', () => {
  it('includes revision and does not collide across rates', () => {
    const a = bakeCacheKey({
      sourceRevision: 'u#1',
      sampleRate: 48000,
      channels: 2,
      pitchSemitones: 0,
      speed: 0.5,
    })
    const b = bakeCacheKey({
      sourceRevision: 'u#1',
      sampleRate: 44100,
      channels: 2,
      pitchSemitones: 0,
      speed: 0.5,
    })
    expect(a).not.toBe(b)
    expect(a).toContain('u#1')
  })
})

describe('timeline mapping', () => {
  it('round-trips frames via measured lengths', () => {
    expect(originalFrameToPlayable(100, 1000, 2000)).toBe(200)
    expect(playableFrameToOriginal(200, 1000, 2000)).toBe(100)
  })
})

describe('synth + analyze (T0)', () => {
  it('T0.1/T0.2: 440 Hz sine estimates near 440', () => {
    const buf = synthSine({ frequencyHz: 440, durationSec: 1, sampleRate: 48000 })
    expect(buf.duration).toBeCloseTo(1, 2)
    expect(channelPeak(buf.getChannelData(0))).toBeGreaterThan(0.4)
    expect(measureRms(buf.getChannelData(0))).toBeGreaterThan(0.2)
    const hz = estimateDominantHz(buf.getChannelData(0), 48000)
    expect(hz).toBeGreaterThan(420)
    expect(hz).toBeLessThan(460)
  })

  it('T0.5: click train onsets', () => {
    const buf = synthClickTrain({ intervalSec: 0.1, durationSec: 0.5, sampleRate: 1000 })
    const onsets = findOnsets(buf.getChannelData(0), { threshold: 0.5 })
    expect(onsets.length).toBeGreaterThanOrEqual(4)
    expect(onsets[1]! - onsets[0]!).toBe(100)
  })

  it('T0.4: delayed stereo reports lag', () => {
    const buf = synthDelayedStereo({ delaySamples: 48, sampleRate: 48000, durationSec: 0.5 })
    const delay = estimateInterChannelDelay(buf.getChannelData(0), buf.getChannelData(1), 128)
    expect(delay).toBeGreaterThan(40)
    expect(delay).toBeLessThan(56)
  })

  it('T0.6: silence finite; NaN rejected', () => {
    const buf = synthSilence({ durationSec: 0.2 })
    expect(allFinite(buf.getChannelData(0))).toBe(true)
    const bad = new Float32Array([0, NaN, 0])
    expect(allFinite(bad)).toBe(false)
  })
})

describe('voiceTransform bake (T2 core)', () => {
  it('T2.1 identity returns same buffer reference via sync helper', () => {
    const buf = synthSine({ durationSec: 0.25, sampleRate: 22050 })
    expect(bakeAudioBufferSync(buf, 0, 1)).toBe(buf)
  })

  it('T2.2 speed 0.5: duration ~2×, F0 preserved (not halved)', () => {
    const buf = synthSine({ frequencyHz: 440, durationSec: 0.5, sampleRate: 22050 })
    const out = bakeAudioBufferSync(buf, 0, 0.5)
    expect(out).not.toBeNull()
    expect(out!.length).toBe(expectedFrames(buf.length, 0.5))
    const hz = estimateDominantHz(out!.getChannelData(0), out!.sampleRate, {
      minHz: 200,
      maxHz: 800,
    })
    expect(hz).toBeGreaterThan(400)
    expect(hz).toBeLessThan(480)
    // Anti-test A2.1: must not be ~220
    expect(hz).toBeGreaterThan(300)
  })

  it('T2.4 pitch +12: F0 ~2×, length unchanged', () => {
    const buf = synthSine({ frequencyHz: 220, durationSec: 0.5, sampleRate: 22050 })
    const out = bakeAudioBufferSync(buf, 12, 1)
    expect(out).not.toBeNull()
    expect(out!.length).toBe(buf.length)
    const hz = estimateDominantHz(out!.getChannelData(0), out!.sampleRate, {
      minHz: 300,
      maxHz: 600,
    })
    expect(hz).toBeGreaterThan(400)
    expect(hz).toBeLessThan(500)
  })

  it('T2.8 speed 0.5 + pitch 0 does not need +12 to sound correct', () => {
    const buf = synthSine({ frequencyHz: 440, durationSec: 0.4, sampleRate: 22050 })
    const out = bakeAudioBufferSync(buf, 0, 0.5)!
    const hz = estimateDominantHz(out.getChannelData(0), out.sampleRate)
    expect(hz).toBeGreaterThan(400)
    expect(hz).toBeLessThan(480)
  })

  it('T2.12 exact frame contract', () => {
    const data = new Float32Array(1000)
    for (let i = 0; i < data.length; i++) data[i] = Math.sin(i / 10)
    const result = bakeChannels([data], 22050, canonicalizeTransform(0, 0.75))
    expect(result.channels[0]!.length).toBe(expectedFrames(1000, 0.75))
  })
})

describe('voiceTransform stereo bake (T2.9 / T2.17)', () => {
  it('stereo identical L/R at speed 0.5: equal lengths, both F0 ≈ 440', () => {
    const buf = synthSine({
      frequencyHz: 440,
      durationSec: 0.5,
      sampleRate: 22050,
      channels: 2,
    })
    const out = bakeAudioBufferSync(buf, 0, 0.5)
    expect(out).not.toBeNull()
    expect(out!.numberOfChannels).toBe(2)
    expect(out!.length).toBe(expectedFrames(buf.length, 0.5))
    const L = out!.getChannelData(0)
    const R = out!.getChannelData(1)
    expect(L.length).toBe(R.length)
    expect(allFinite(L)).toBe(true)
    expect(allFinite(R)).toBe(true)
    for (const ch of [L, R]) {
      const hz = estimateDominantHz(ch, out!.sampleRate, { minHz: 200, maxHz: 800 })
      expect(hz).toBeGreaterThan(400)
      expect(hz).toBeLessThan(480)
    }
  })

  it('stereo dual-tone (L=330, R=550) speed 0.5 preserves both fundamentals', () => {
    const buf = synthSine({
      frequencyHz: 330,
      frequencyHzR: 550,
      durationSec: 0.5,
      sampleRate: 22050,
      channels: 2,
    })
    const out = bakeAudioBufferSync(buf, 0, 0.5)!
    expect(out.length).toBe(expectedFrames(buf.length, 0.5))
    const hzL = estimateDominantHz(out.getChannelData(0), out.sampleRate, {
      minHz: 200,
      maxHz: 450,
    })
    const hzR = estimateDominantHz(out.getChannelData(1), out.sampleRate, {
      minHz: 400,
      maxHz: 700,
    })
    expect(hzL).toBeGreaterThan(300)
    expect(hzL).toBeLessThan(360)
    expect(hzR).toBeGreaterThan(500)
    expect(hzR).toBeLessThan(600)
  })

  it('stereo pitch +12: both channels ≈ 2× F0, length unchanged', () => {
    const buf = synthSine({
      frequencyHz: 220,
      durationSec: 0.45,
      sampleRate: 22050,
      channels: 2,
    })
    const out = bakeAudioBufferSync(buf, 12, 1)!
    expect(out.length).toBe(buf.length)
    expect(out.numberOfChannels).toBe(2)
    for (const ch of [0, 1] as const) {
      const hz = estimateDominantHz(out.getChannelData(ch), out.sampleRate, {
        minHz: 300,
        maxHz: 600,
      })
      expect(hz).toBeGreaterThan(400)
      expect(hz).toBeLessThan(500)
    }
  })

  it('stereo speed 0.5 + pitch +12: duration 2×, F0 ≈ 2×', () => {
    const buf = synthSine({
      frequencyHz: 220,
      durationSec: 0.4,
      sampleRate: 22050,
      channels: 2,
    })
    const out = bakeAudioBufferSync(buf, 12, 0.5)!
    expect(out.length).toBe(expectedFrames(buf.length, 0.5))
    for (const ch of [0, 1] as const) {
      const hz = estimateDominantHz(out.getChannelData(ch), out.sampleRate, {
        minHz: 300,
        maxHz: 600,
      })
      expect(hz).toBeGreaterThan(400)
      expect(hz).toBeLessThan(500)
    }
  })

  it('stereo delayed fixture: L/R lengths equal after stretch (ITD not guaranteed by per-channel WSOLA)', () => {
    const delayIn = 48
    const buf = synthDelayedStereo({
      frequencyHz: 440,
      delaySamples: delayIn,
      durationSec: 0.5,
      sampleRate: 22050,
    })
    const delayBefore = estimateInterChannelDelay(buf.getChannelData(0), buf.getChannelData(1), 128)
    expect(delayBefore).toBeGreaterThan(40)

    const out = bakeAudioBufferSync(buf, 0, 0.5)!
    expect(out.getChannelData(0).length).toBe(out.getChannelData(1).length)
    expect(out.length).toBe(expectedFrames(buf.length, 0.5))
    // Per-channel WSOLA does not lock inter-channel delay to stretchFactor.
    // Record measured post-bake delay for regression visibility (must stay finite/searchable).
    const delayAfter = estimateInterChannelDelay(
      out.getChannelData(0),
      out.getChannelData(1),
      256,
    )
    expect(Number.isFinite(delayAfter)).toBe(true)
    expect(Math.abs(delayAfter)).toBeLessThan(256)
    // Documented limitation: delayAfter is often ~delayIn, not ~delayIn*2.
    void delayBefore
  })

  it('stereo mid/side energy remains finite and non-silent after bake', () => {
    const buf = synthSine({
      frequencyHz: 440,
      frequencyHzR: 554,
      durationSec: 0.4,
      sampleRate: 22050,
      channels: 2,
    })
    const out = bakeAudioBufferSync(buf, 0, 0.75)!
    const { mid, side } = midSideEnergy(out.getChannelData(0), out.getChannelData(1))
    expect(mid).toBeGreaterThan(0)
    expect(side).toBeGreaterThan(0)
    expect(Number.isFinite(mid)).toBe(true)
    expect(Number.isFinite(side)).toBe(true)
  })
})

describe('voiceTransform matrix / edge cases', () => {
  const sr = 22050

  it.each([0.25, 0.5, 0.75, 1.25, 1.5, 2] as const)(
    'speed %s: frame contract + F0 not coupled to rate',
    (speed) => {
      const buf = synthSine({ frequencyHz: 440, durationSec: 0.35, sampleRate: sr })
      const out = bakeAudioBufferSync(buf, 0, speed)!
      expect(out.length).toBe(expectedFrames(buf.length, speed))
      const hz = estimateDominantHz(out.getChannelData(0), out.sampleRate, {
        minHz: 200,
        maxHz: 800,
      })
      expect(hz).toBeGreaterThan(400)
      expect(hz).toBeLessThan(480)
    },
  )

  it.each([-12, -5, -2, 2, 5, 12] as const)(
    'pitch %s: length unchanged, F0 scales by 2^(n/12)',
    (semitones) => {
      const f0 = 330
      const buf = synthSine({ frequencyHz: f0, durationSec: 0.4, sampleRate: sr })
      const out = bakeAudioBufferSync(buf, semitones, 1)!
      expect(out.length).toBe(buf.length)
      const expectHz = f0 * 2 ** (semitones / 12)
      const hz = estimateDominantHz(out.getChannelData(0), out.sampleRate, {
        minHz: Math.max(60, expectHz * 0.7),
        maxHz: Math.min(2000, expectHz * 1.3),
      })
      expect(hz).toBeGreaterThan(expectHz * 0.9)
      expect(hz).toBeLessThan(expectHz * 1.1)
    },
  )

  it('mono speed+pitch combined', () => {
    const buf = synthSine({ frequencyHz: 220, durationSec: 0.35, sampleRate: sr, channels: 1 })
    const out = bakeAudioBufferSync(buf, 5, 0.75)!
    expect(out.numberOfChannels).toBe(1)
    expect(out.length).toBe(expectedFrames(buf.length, 0.75))
    const expectHz = 220 * 2 ** (5 / 12)
    const hz = estimateDominantHz(out.getChannelData(0), out.sampleRate, {
      minHz: expectHz * 0.7,
      maxHz: expectHz * 1.3,
    })
    expect(hz).toBeGreaterThan(expectHz * 0.88)
    expect(hz).toBeLessThan(expectHz * 1.12)
  })

  it('very short buffer does not throw', () => {
    const buf = synthSine({ frequencyHz: 440, durationSec: 0.05, sampleRate: sr })
    const out = bakeAudioBufferSync(buf, 0, 0.5)
    expect(out).not.toBeNull()
    expect(out!.length).toBe(expectedFrames(buf.length, 0.5))
  })

  it('silence stays silent / finite', () => {
    const buf = synthSilence({ durationSec: 0.3, sampleRate: sr, channels: 2 })
    const out = bakeAudioBufferSync(buf, 2, 0.5)!
    expect(allFinite(out.getChannelData(0))).toBe(true)
    expect(allFinite(out.getChannelData(1))).toBe(true)
    expect(channelPeak(out.getChannelData(0))).toBeLessThan(0.05)
  })

  it('click train output length follows speed contract', () => {
    const buf = synthClickTrain({
      intervalSec: 0.1,
      durationSec: 0.5,
      sampleRate: 8000,
    })
    const out = bakeAudioBufferSync(buf, 0, 0.5)!
    expect(out.length).toBe(expectedFrames(buf.length, 0.5))
    expect(allFinite(out.getChannelData(0))).toBe(true)
    // Onset spacing under WSOLA is best-effort on impulses; length/finite are the hard gates.
    const after = findOnsets(out.getChannelData(0), { threshold: 0.3, refractorySamples: 40 })
    expect(after.length).toBeGreaterThanOrEqual(1)
  })

  it('44.1 kHz stereo preserves sample rate and channels', () => {
    const buf = synthSine({
      frequencyHz: 440,
      durationSec: 0.3,
      sampleRate: 44100,
      channels: 2,
    })
    const out = bakeAudioBufferSync(buf, -2, 1.25)!
    expect(out.sampleRate).toBe(44100)
    expect(out.numberOfChannels).toBe(2)
    expect(out.length).toBe(expectedFrames(buf.length, 1.25))
  })

  it('bakeChannels cooperative cancel throws AbortError between stages', () => {
    const buf = synthSine({ frequencyHz: 440, durationSec: 0.3, sampleRate: sr, channels: 2 })
    const chans = [
      new Float32Array(buf.getChannelData(0)),
      new Float32Array(buf.getChannelData(1)),
    ]
    let checks = 0
    expect(() =>
      bakeChannels(chans, sr, canonicalizeTransform(3, 0.5), {
        isCancelled: () => {
          checks++
          return checks > 2
        },
      }),
    ).toThrow(/Aborted/)
    expect(checks).toBeGreaterThan(2)
  })
})

describe('timeline mapping edge cases', () => {
  it('round-trips scrub positions across speed ratios', () => {
    const originalFrames = 44100
    for (const speed of [0.25, 0.5, 0.75, 1, 1.5, 2]) {
      const playableFrames = expectedFrames(originalFrames, speed)
      for (const sec of [0, 0.1, 0.33, 0.5, 0.99]) {
        const of = Math.round(sec * 44100)
        const pf = originalFrameToPlayable(of, originalFrames, playableFrames)
        const back = playableFrameToOriginal(pf, originalFrames, playableFrames)
        expect(Math.abs(back - of)).toBeLessThanOrEqual(1)
      }
    }
  })

  it('originalSecondsToPlayable at speed 0.5 doubles time', () => {
    expect(originalSecondsToPlayable(0.25, 44100, 44100, 88200)).toBeCloseTo(0.5, 5)
    expect(playableSecondsToOriginal(0.5, 44100, 44100, 88200)).toBeCloseTo(0.25, 5)
  })
})
