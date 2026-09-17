import { describe, expect, it } from 'vitest'
import {
  BARBERSHOP_CHORDS,
  chordContainsLead,
  leadRoleInChord,
  placeVoicing,
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
})
