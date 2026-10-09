/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import {
  BARBERSHOP_CHORDS,
  clampBassRegister,
  placeVoicing,
  placeVoicingConcert,
  ttbbPartsDistinct,
  TTBB_BASS_MIN,
  VOICINGS_BY_CHORD,
} from './chords'

describe('placeVoicingConcert', () => {
  it('keeps bass above the muddy floor for a mid-range lead', () => {
    const chord = BARBERSHOP_CHORDS.find((c) => c.id === 'major')!
    const concert = placeVoicingConcert({
      chord,
      rootPc: 0,
      leadMidi: 60,
      voicing: '1513',
      spread: false,
    })!
    expect(concert.bass).toBeGreaterThanOrEqual(TTBB_BASS_MIN)
    expect(concert.lead).toBe(60)
    expect(concert.tenor).toBeGreaterThan(concert.lead)
    expect(ttbbPartsDistinct(concert)).toBe(true)
    // Concert place should sit higher than naive placeVoicing on concert lead.
    const naive = placeVoicing({
      chord,
      rootPc: 0,
      leadMidi: 60,
      voicing: '1513',
      spread: false,
    })!
    expect(concert.bass).toBeGreaterThanOrEqual(naive.bass)
  })

  it('never emits part unisons (incl. bass/lead octave-double cases)', () => {
    const hits: string[] = []
    for (const chord of BARBERSHOP_CHORDS.filter((c) =>
      ['major', 'seventh', 'm7', 'minor'].includes(c.id),
    )) {
      for (const rootPc of [0, 5, 7, 10]) {
        for (const lead of [55, 58, 60, 62, 65, 67]) {
          for (const voicing of VOICINGS_BY_CHORD[chord.id] ?? []) {
            const m = placeVoicingConcert({
              chord,
              rootPc,
              leadMidi: lead,
              voicing,
              spread: false,
            })
            if (!m) continue
            if (!ttbbPartsDistinct(m)) {
              hits.push(`${chord.id}@${rootPc}/${voicing}/L${lead}`)
            }
          }
        }
      }
    }
    expect(hits).toEqual([])
  })

  it('clampBassRegister lifts bass under bari', () => {
    const lifted = clampBassRegister({
      bass: 36,
      bari: 55,
      lead: 60,
      tenor: 67,
    })
    expect(lifted.bass).toBeGreaterThanOrEqual(TTBB_BASS_MIN)
    expect(lifted.bass).toBeLessThanOrEqual(lifted.bari)
  })

  it('clampBassRegister only drops when the result stays octave-close', () => {
    // tenor 76 − 55 = 21 > 12 → keep the close high shell.
    const keepHigh = clampBassRegister({
      bass: 67,
      bari: 70,
      lead: 72,
      tenor: 76,
    })
    expect(keepHigh.bass).toBe(67)
    // tenor 64 − 48 = 16 > 12 → do not widen a usable shell.
    const keep = clampBassRegister({
      bass: 60,
      bari: 64,
      lead: 67,
      tenor: 72,
    })
    expect(keep.bass).toBe(60)
    expect(keep.bari).toBe(64)
    // Drop is allowed when the result stays ≤ octave (tenor 66 → span 11).
    const dropped = clampBassRegister({
      bass: 67,
      bari: 70,
      lead: 72,
      tenor: 66,
    })
    expect(dropped.bass).toBe(55)
    expect(dropped.bari).toBe(58)
  })

  it('clampBassRegister lifts bari+bass when spread pins bass low', () => {
    const lifted = clampBassRegister({
      bass: 36,
      bari: 43,
      lead: 60,
      tenor: 67,
    })
    expect(lifted.bass).toBeGreaterThanOrEqual(TTBB_BASS_MIN)
    expect(lifted.bari).toBeGreaterThan(43)
    expect(lifted.bari).toBeLessThan(lifted.lead)
  })
})
