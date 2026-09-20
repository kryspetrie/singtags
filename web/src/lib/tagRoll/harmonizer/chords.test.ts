import { describe, expect, it } from 'vitest'
import {
  BARBERSHOP_CHORDS,
  chordContainsLead,
  leadRoleInChord,
  placeVoicing,
  placeVoicingConcert,
  voicingFitsLead,
  VOICINGS_BY_CHORD,
} from './chords'

describe('tagRoll harmonizer chords', () => {
  const major = BARBERSHOP_CHORDS.find((c) => c.id === 'major')!
  const seventh = BARBERSHOP_CHORDS.find((c) => c.id === 'seventh')!

  it('filters chord natures that contain the lead PC', () => {
    // C major, lead E (midi 64) → 3rd
    expect(chordContainsLead(major, 0, 64)).toBe(true)
    expect(leadRoleInChord(major, 0, 64)).toBe(3)
    // F# is not in C major
    expect(chordContainsLead(major, 0, 66)).toBe(false)
  })

  it('filters voicings by lead role slot', () => {
    expect(voicingFitsLead('5317', 1)).toBe(true)
    expect(voicingFitsLead('5317', 3)).toBe(false)
    expect(voicingFitsLead('1357', 5)).toBe(true)
  })

  it('places TTBB with tenor above lead and never moves lead', () => {
    const lead = 60 // C4
    const pitches = placeVoicing({
      chord: seventh,
      rootPc: 0,
      leadMidi: lead,
      voicing: '5317',
      spread: false,
    })
    expect(pitches).not.toBeNull()
    expect(pitches!.lead).toBe(lead)
    expect(pitches!.tenor).toBeGreaterThan(lead)
    expect(pitches!.bass).toBeLessThan(pitches!.bari)
    expect(VOICINGS_BY_CHORD.seventh).toContain('5317')
  })

  it('raises bari/bass an octave for TTBB lead melody (written-pitch anchor)', () => {
    const lead = 60 // C4 concert → written C5 on treble-8vb
    const raw = placeVoicing({
      chord: major,
      rootPc: 0,
      leadMidi: lead,
      voicing: '1513',
      spread: false,
    })!
    const concert = placeVoicingConcert({
      chord: major,
      rootPc: 0,
      leadMidi: lead,
      voicing: '1513',
      spread: false,
      clefFamily: 'ttbb',
      melodyStaff: 'upper',
    })!
    expect(concert.lead).toBe(lead)
    expect(concert.tenor).toBe(raw.tenor)
    expect(concert.bari).toBe(raw.bari + 12)
    expect(concert.bass).toBe(raw.bass + 12)
    // Close C major under lead C4: bass C4, bari G4, tenor E4
    expect(concert).toEqual({ bass: 60, bari: 67, lead: 60, tenor: 64 })
  })

  it('does not shift register for SSAA or lower-staff melody', () => {
    const lead = 60
    const raw = placeVoicing({
      chord: major,
      rootPc: 0,
      leadMidi: lead,
      voicing: '1513',
    })!
    expect(
      placeVoicingConcert({
        chord: major,
        rootPc: 0,
        leadMidi: lead,
        voicing: '1513',
        clefFamily: 'ssaa',
        melodyStaff: 'upper',
      }),
    ).toEqual(raw)
    expect(
      placeVoicingConcert({
        chord: major,
        rootPc: 0,
        leadMidi: lead,
        voicing: '1513',
        clefFamily: 'ttbb',
        melodyStaff: 'lower',
      }),
    ).toEqual(raw)
  })
})
