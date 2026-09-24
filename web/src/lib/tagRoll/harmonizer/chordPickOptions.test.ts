/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import { buildHarmonizeChordOptions } from './chordPickOptions'

describe('buildHarmonizeChordOptions', () => {
  it('lists lead-valid chords as primary in stack mode', () => {
    // C4 (midi 60) in C major — many C-family and other chords contain C
    const { primary, more } = buildHarmonizeChordOptions({
      tonality: 0,
      preferFlats: false,
      leadMidi: 60,
      chordOnly: false,
    })
    expect(primary.length).toBeGreaterThan(0)
    expect(primary.every((o) => o.validForLead)).toBe(true)
    expect(primary.some((o) => o.name === 'C' || o.roman === 'I')).toBe(true)
    expect(more.every((o) => !o.validForLead)).toBe(true)
  })

  it('chord-only primary favors common diatonic natures', () => {
    const { primary } = buildHarmonizeChordOptions({
      tonality: 0,
      preferFlats: false,
      leadMidi: 60,
      chordOnly: true,
    })
    expect(primary.every((o) => o.diatonicRoot)).toBe(true)
    expect(primary.some((o) => o.chordId === 'major')).toBe(true)
    expect(primary.some((o) => o.chordId === 'seventh')).toBe(true)
  })
})
