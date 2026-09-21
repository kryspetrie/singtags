import { describe, expect, it } from 'vitest'
import {
  DEFAULT_METRONOME_SOUND_ID,
  isMetronomeSoundId,
  metronomeSampleUrl,
  metronomeSoundPair,
  METRONOME_SOUND_PAIRS,
} from '../../audio/metronomeSamples'
import {
  beatIndexAtTick,
  beatsCrossed,
  beatsCrossedSigned,
  isOnBeat,
  subdivisionsCrossed,
} from './metronomeBeats'
import { TAG_ROLL_PPQ } from './types'

describe('metronomeSamples', () => {
  it('lists four click pairs with stable urls', () => {
    expect(METRONOME_SOUND_PAIRS).toHaveLength(4)
    expect(isMetronomeSoundId(DEFAULT_METRONOME_SOUND_ID)).toBe(true)
    expect(isMetronomeSoundId('nope')).toBe(false)
    const pair = metronomeSoundPair('asrx')
    expect(pair.label).toBe('ASRX')
    expect(metronomeSampleUrl(pair.downFile)).toContain('instruments/metronome/asrx-down.wav')
    expect(metronomeSampleUrl(pair.upFile)).toContain('instruments/metronome/asrx-up.wav')
  })
})

describe('metronomeBeats', () => {
  const ts44 = { numerator: 4, denominator: 4 }
  const beat = TAG_ROLL_PPQ // quarter in 4/4

  it('classifies downbeat vs other beats', () => {
    expect(beatIndexAtTick(0, ts44)).toBe(0)
    expect(beatIndexAtTick(beat, ts44)).toBe(1)
    expect(beatIndexAtTick(beat * 3, ts44)).toBe(3)
    expect(isOnBeat(0, ts44)).toBe(true)
    expect(isOnBeat(beat / 2, ts44)).toBe(false)
  })

  it('lists beats crossed in a range with downbeat on measure starts', () => {
    const hits = beatsCrossed(0, beat * 4, ts44)
    expect(hits.map((h) => h.beatIndex)).toEqual([1, 2, 3, 0])
    expect(hits.map((h) => h.downbeat)).toEqual([false, false, false, true])
  })

  it('supports 3/4 meter', () => {
    const ts34 = { numerator: 3, denominator: 4 }
    const hits = beatsCrossed(-0.1, beat * 3 - 1, ts34)
    expect(hits.map((h) => h.beatIndex)).toEqual([0, 1, 2])
    expect(hits.filter((h) => h.downbeat)).toHaveLength(1)
  })

  it('supports signed pre-roll ranges', () => {
    const hits = beatsCrossedSigned(-beat * 4, 0, ts44)
    expect(hits.map((h) => h.tick)).toEqual([-beat * 3, -beat * 2, -beat, 0])
    expect(hits.map((h) => h.downbeat)).toEqual([false, false, false, true])
  })

  it('lists swing-unit subdivisions with downbeat on measure starts', () => {
    const eighth = beat / 2
    const hits = subdivisionsCrossed(0, beat, eighth, ts44)
    expect(hits.map((h) => h.tick)).toEqual([eighth, beat])
    expect(hits.every((h) => !h.downbeat)).toBe(true)
    const acrossBar = subdivisionsCrossed(beat * 3.5, beat * 4, eighth, ts44)
    expect(acrossBar.some((h) => h.tick === beat * 4 && h.downbeat)).toBe(true)
  })
})
