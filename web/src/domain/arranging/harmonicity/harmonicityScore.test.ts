import { describe, expect, it } from 'vitest'
import {
  createHarmonicityScorer,
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
