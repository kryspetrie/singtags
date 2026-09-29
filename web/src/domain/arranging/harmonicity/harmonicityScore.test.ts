import { describe, expect, it } from 'vitest'
import {
  createHarmonicityScorer,
  normalizeHarmonicity,
  normalizeHarmonicityForDisplay,
  scoreHarmonicity,
} from './harmonicityScore'
import { BARBERSHOP_CHORDS, placeVoicing } from '../chords'

describe('harmonicityScore', () => {
  const scorer = createHarmonicityScorer()

  function bs7Closed(leadMidi = 64) {
    const chord = BARBERSHOP_CHORDS.find((c) => c.id === 'seventh')!
    const voicing = '1735'
    const midi = placeVoicing({
      chord,
      rootPc: 0,
      leadMidi,
      voicing,
      spread: false,
    })
    expect(midi).toBeTruthy()
    return { midi: midi!, voicing }
  }

  it('scores just BS7 higher than equal-tempered BS7', () => {
    const { midi, voicing } = bs7Closed()
    const just = scoreHarmonicity({
      midi,
      natureId: 'seventh',
      rootPc: 0,
      voicing,
      useJust: true,
    })
    const et = scoreHarmonicity({
      midi,
      natureId: 'seventh',
      rootPc: 0,
      voicing,
      useJust: false,
    })
    expect(just).toBeGreaterThan(et)
  })

  it('scores BS7 higher than a dissonant cluster', () => {
    const { midi, voicing } = bs7Closed()
    const good = scorer.normalize(
      scoreHarmonicity({
        midi,
        natureId: 'seventh',
        rootPc: 0,
        voicing,
        useJust: true,
      }),
    )
    const bad = scorer.normalize(
      scoreHarmonicity({
        midi: { bass: 48, bari: 49, lead: 50, tenor: 51 },
        natureId: 'seventh',
        rootPc: 0,
        voicing,
        useJust: false,
      }),
    )
    expect(good).toBeGreaterThan(bad)
  })
})

describe('normalizeHarmonicityForDisplay', () => {
  const scorer = createHarmonicityScorer()

  function placeMajor(voicing: string) {
    const chord = BARBERSHOP_CHORDS.find((c) => c.id === 'major')!
    const midi = placeVoicing({
      chord,
      rootPc: 0,
      leadMidi: 60,
      voicing,
      spread: false,
    })
    expect(midi).toBeTruthy()
    return midi!
  }

  function placeSeventh(voicing: string) {
    const chord = BARBERSHOP_CHORDS.find((c) => c.id === 'seventh')!
    const midi = placeVoicing({
      chord,
      rootPc: 7,
      leadMidi: 67,
      voicing,
      spread: false,
    })
    expect(midi).toBeTruthy()
    return midi!
  }

  it('maps a strong closed major near 100% on the 4-part display scale', () => {
    const midi = placeMajor('1135')
    const raw = scoreHarmonicity({
      midi,
      natureId: 'major',
      rootPc: 0,
      voicing: '1135',
      useJust: true,
    })
    const display = normalizeHarmonicityForDisplay(raw, { partCount: 4 })
    expect(display).toBeGreaterThanOrEqual(0.9)
    expect(display).toBeLessThanOrEqual(1)
    // Absolute logistic stays below the soft ceiling (~0.8).
    expect(normalizeHarmonicity(raw)).toBeLessThan(0.85)
  })

  it('keeps BS7 below a strong major on the display scale', () => {
    const majorMidi = placeMajor('1135')
    const sevMidi = placeSeventh('1537')
    const majorDisp = normalizeHarmonicityForDisplay(
      scoreHarmonicity({
        midi: majorMidi,
        natureId: 'major',
        rootPc: 0,
        voicing: '1135',
        useJust: true,
      }),
      { partCount: 4 },
    )
    const sevDisp = normalizeHarmonicityForDisplay(
      scoreHarmonicity({
        midi: sevMidi,
        natureId: 'seventh',
        rootPc: 7,
        voicing: '1537',
        useJust: true,
      }),
      { partCount: 4 },
    )
    expect(sevDisp).toBeGreaterThan(0.5)
    expect(sevDisp).toBeLessThan(majorDisp)
  })

  it('keeps a dissonant cluster low on the display scale', () => {
    const display = normalizeHarmonicityForDisplay(
      scoreHarmonicity({
        midi: { bass: 48, bari: 49, lead: 50, tenor: 51 },
        natureId: 'seventh',
        rootPc: 0,
        voicing: '1735',
        useJust: false,
      }),
      { partCount: 4 },
    )
    expect(display).toBeLessThan(0.55)
  })

  it('uses a tighter (lower) scale for partCount > 4 at the same raw', () => {
    const raw = 2.4
    const four = normalizeHarmonicityForDisplay(raw, { partCount: 4 })
    const multi = normalizeHarmonicityForDisplay(raw, { partCount: 5 })
    expect(four).toBeGreaterThan(multi)
    expect(scorer.normalizeForDisplay(raw, { partCount: 8 })).toBe(multi)
  })
})
