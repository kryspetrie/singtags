/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import {
  buildHarmonizeChordOptions,
  optionKey,
  optionKeyFromRootPc,
  prioritizeOptionsByRank,
  rankHintsFromCandidates,
} from './chordPickOptions'

describe('buildHarmonizeChordOptions', () => {
  it('lists diatonic lead-valid chords as primary; chromatic lead-valid in More', () => {
    const { primary, more } = buildHarmonizeChordOptions({
      tonality: 0,
      preferFlats: false,
      leadMidi: 60,
      chordOnly: false,
    })
    expect(primary.length).toBeGreaterThan(0)
    expect(primary.every((o) => o.validForLead && o.diatonicRoot)).toBe(true)
    expect(primary.some((o) => o.name === 'C' || o.roman === 'I')).toBe(true)
    expect(more.every((o) => o.validForLead && !o.diatonicRoot)).toBe(true)
    // Non-melody chords are omitted — filter means filter.
    expect([...primary, ...more].every((o) => o.validForLead)).toBe(true)
  })

  it('chord-only primary favors SAI-11 on diatonic roots', () => {
    const { primary, more } = buildHarmonizeChordOptions({
      tonality: 0,
      preferFlats: false,
      leadMidi: 60,
      chordOnly: true,
    })
    expect(primary.every((o) => o.diatonicRoot)).toBe(true)
    expect(primary.some((o) => o.chordId === 'major')).toBe(true)
    expect(primary.some((o) => o.chordId === 'seventh')).toBe(true)
    expect(primary.some((o) => o.chordId === 'ninth')).toBe(true)
    expect(primary.every((o) => o.chordId !== 'half-dim' && o.chordId !== 'dim')).toBe(true)
    expect(more.some((o) => o.chordId === 'half-dim' || o.chordId === 'dim')).toBe(true)
  })

  it('marks natural-minor diatonic roots (not major III/vi)', () => {
    // A minor (tonality 9): C (+3) is III; C♯ (+4) is chromatic ♯iii.
    const { primary, more } = buildHarmonizeChordOptions({
      tonality: 9,
      mode: 'minor',
      preferFlats: true,
      leadMidi: null,
      chordOnly: true,
    })
    expect(primary.some((o) => o.rootPc === 0 && o.chordId === 'major')).toBe(true) // C = III
    expect(primary.every((o) => o.rootPc !== 1)).toBe(true) // C♯ not in primary
    expect(more.some((o) => o.rootPc === 1 && !o.diatonicRoot)).toBe(true)
  })

  it('labels V7/V (II7) when resolvesToRoot is the next V', () => {
    const { primary } = buildHarmonizeChordOptions({
      tonality: 0,
      preferFlats: false,
      leadMidi: 62, // D — chord tone of D7 / Dm7
      chordOnly: false,
      resolvesToRoot: 7, // G = V in C
    })
    const d7 = primary.find((o) => o.rootPc === 2 && o.chordId === 'seventh')
    expect(d7?.romanPrimary).toBe('V7/V')
    expect(d7?.roman).toBe('V7/V (II7)')
    const dm7 = primary.find((o) => o.rootPc === 2 && o.chordId === 'm7')
    expect(dm7?.romanPrimary).toBe('ii7')
    expect(dm7?.roman).toBe('ii7')
  })
})

describe('rankHintsFromCandidates', () => {
  it('marks cadence labels', () => {
    const hints = rankHintsFromCandidates([
      { rootPc: 7, natureId: 'seventh', cadenceLabel: 'V7 → I' },
      { rootPc: 0, natureId: 'major', label: 'C' },
    ])
    expect(hints[0]!.cadence).toBe(true)
    expect(hints[0]!.label).toBe('V7 → I')
    expect(hints[1]!.cadence).toBe(false)
    expect(hints[1]!.label).toBe('C')
  })
})

describe('prioritizeOptionsByRank', () => {
  it('moves Detected hints to the front', () => {
    const { primary } = buildHarmonizeChordOptions({
      tonality: 0,
      preferFlats: false,
      leadMidi: 60,
      chordOnly: false,
    })
    const cKey = optionKeyFromRootPc(0, 'major', 0)
    const withoutCFirst = primary.filter((o) => optionKey(o) !== cKey)
    const shuffled = [...withoutCFirst, ...primary.filter((o) => optionKey(o) === cKey)]
    const ranked = prioritizeOptionsByRank(
      shuffled,
      [{ rootPc: 0, natureId: 'major' }],
      0,
    )
    expect(optionKey(ranked[0]!)).toBe(cKey)
    expect(ranked.length).toBe(shuffled.length)
  })
})
