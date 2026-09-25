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
  it('lists lead-valid chords as primary in stack mode', () => {
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
