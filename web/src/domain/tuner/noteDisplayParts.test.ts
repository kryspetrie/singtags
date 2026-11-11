import { describe, expect, it } from 'vitest'
import {
  formatFundamentalHz,
  formatFundamentalHzParts,
  noteDisplayParts,
  noteDisplayPartsFromMidi,
  preferFlatsForKeyPc,
} from './noteDisplayParts'

describe('noteDisplayParts', () => {
  it('parses naturals, sharps, and flats', () => {
    expect(noteDisplayParts('A4')).toEqual({
      letter: 'A',
      accidental: null,
      accidentalGlyph: '',
      octave: 4,
      spoken: 'A 4',
    })
    expect(noteDisplayParts('C#4')?.accidentalGlyph).toBe('♯')
    expect(noteDisplayParts('Bb3')?.accidentalGlyph).toBe('♭')
    expect(noteDisplayParts('G♯2')?.spoken).toBe('G sharp 2')
  })

  it('spells MIDI with flats when preferred', () => {
    // MIDI 70 = A#4 / Bb4
    expect(noteDisplayPartsFromMidi(70, false)?.accidentalGlyph).toBe('♯')
    expect(noteDisplayPartsFromMidi(70, true)).toMatchObject({
      letter: 'B',
      accidental: 'flat',
      octave: 4,
    })
  })

  it('formats fundamental Hz with fixed unit slot', () => {
    expect(formatFundamentalHz(440.24)).toBe('440.2 Hz')
    expect(formatFundamentalHz(82.41)).toBe('82.41 Hz')
    const parts = formatFundamentalHzParts(440.24)
    expect(parts.body).toBe('440.2')
    expect(parts.unit).toBe('Hz')
  })

  it('prefers flats in flat keys', () => {
    expect(preferFlatsForKeyPc(0)).toBe(false) // C
    expect(preferFlatsForKeyPc(5)).toBe(true) // F
    expect(preferFlatsForKeyPc(10)).toBe(true) // Bb
  })
})
