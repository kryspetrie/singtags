import { describe, expect, it } from 'vitest'
import {
  BARBERSHOP_CHORDS as DomainChords,
  TTBB_BASS_MIN,
  VOICINGS_BY_CHORD as DomainVoicings,
  ttbbPartsDistinct,
} from '../../../domain/arranging/chords/chords'
import { CHORDS_BHS_EXTENDED, CHORDS_SAI11 } from '../../../domain/arranging/contestProfile'
import {
  BARBERSHOP_CHORDS,
  chordContainsLead,
  closedHighRingScore,
  leadRoleInChord,
  orderVoicingsClosedHighRing,
  placeVoicing,
  placeVoicingConcert,
  voicingFitsLead,
  VOICINGS_BY_CHORD,
} from './chords'

/** Contest construction formulas (docs/arranging-knowledge/12-eleven-chords-ji.md). */
const CONTEST_OFFSETS: Record<string, Partial<Record<1 | 3 | 5 | 6 | 7 | 9, number>>> = {
  major: { 1: 0, 3: 4, 5: 7 },
  minor: { 1: 0, 3: 3, 5: 7 },
  aug: { 1: 0, 3: 4, 5: 8 },
  seventh: { 1: 0, 3: 4, 5: 7, 7: 10 },
  m7: { 1: 0, 3: 3, 5: 7, 7: 10 },
  dim7: { 1: 0, 3: 3, 5: 6, 7: 9 },
  maj7: { 1: 0, 3: 4, 5: 7, 7: 11 },
  add9: { 1: 0, 3: 4, 5: 7, 9: 2 },
  sixth: { 1: 0, 3: 4, 5: 7, 6: 9 },
  madd6: { 1: 0, 3: 3, 5: 7, 6: 9 },
  ninth: { 1: 0, 3: 4, 5: 7, 7: 10, 9: 2 },
  dim: { 1: 0, 3: 3, 5: 6 },
  'half-dim': { 1: 0, 3: 3, 5: 6, 7: 10 },
}

describe('tagRoll harmonizer chords', () => {
  const major = BARBERSHOP_CHORDS.find((c) => c.id === 'major')!
  const seventh = BARBERSHOP_CHORDS.find((c) => c.id === 'seventh')!

  it('matches contest eleven + BHS extended formulas', () => {
    const ids = BARBERSHOP_CHORDS.map((c) => c.id)
    expect(ids).toEqual(expect.arrayContaining([...CHORDS_BHS_EXTENDED]))
    expect(ids).toHaveLength(CHORDS_BHS_EXTENDED.length)
    for (const id of CHORDS_SAI11) {
      expect(BARBERSHOP_CHORDS.find((c) => c.id === id)?.offsets).toEqual(CONTEST_OFFSETS[id])
    }
    for (const id of ['dim', 'half-dim'] as const) {
      expect(BARBERSHOP_CHORDS.find((c) => c.id === id)?.offsets).toEqual(CONTEST_OFFSETS[id])
    }
  })

  it('keeps Tag Roll Dom9 voicings aligned with domain', () => {
    expect(VOICINGS_BY_CHORD.ninth).toEqual(DomainVoicings.ninth)
    for (const c of DomainChords) {
      expect(BARBERSHOP_CHORDS.find((t) => t.id === c.id)?.offsets).toEqual(c.offsets)
    }
  })

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

  it('keeps minor triad shells aligned with major / MuseScore plugin', () => {
    expect(VOICINGS_BY_CHORD.minor).toEqual(VOICINGS_BY_CHORD.major)
    expect(VOICINGS_BY_CHORD.minor).toContain('3155')
    expect(VOICINGS_BY_CHORD.minor).toContain('5351')
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

  it('raises bari/bass into a closed ringing register for TTBB lead', () => {
    const lead = 60 // C4 concert
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
    expect(concert.tenor).toBeGreaterThan(concert.lead)
    expect(concert.bass).toBeGreaterThanOrEqual(TTBB_BASS_MIN)
    expect(concert.bass).toBeLessThan(concert.lead)
    expect(ttbbPartsDistinct(concert)).toBe(true)
    // Prefer close outer span for Harmonize hear.
    expect(concert.tenor - concert.bass).toBeLessThanOrEqual(16)
  })

  it('does not use the TTBB written offset for SSAA or lower-staff melody', () => {
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

  it('orders voicings toward closed high-ring shells', () => {
    const lead = 62
    const role = leadRoleInChord(seventh, 7, lead)!
    const list = (VOICINGS_BY_CHORD.seventh ?? []).filter((v) => voicingFitsLead(v, role))
    const ordered = orderVoicingsClosedHighRing({
      chord: seventh,
      rootPc: 7,
      leadMidi: lead,
      voicings: list,
      spread: false,
    })
    expect(ordered.length).toBe(list.length)
    const best = placeVoicingConcert({
      chord: seventh,
      rootPc: 7,
      leadMidi: lead,
      voicing: ordered[0]!,
      spread: false,
    })!
    const worst = placeVoicingConcert({
      chord: seventh,
      rootPc: 7,
      leadMidi: lead,
      voicing: ordered[ordered.length - 1]!,
      spread: false,
    })!
    expect(closedHighRingScore(best)).toBeGreaterThanOrEqual(closedHighRingScore(worst))
  })
})
