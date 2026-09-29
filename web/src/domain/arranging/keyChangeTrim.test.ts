import { describe, expect, it } from 'vitest'
import { suggestKeyChanges } from './keyChange'
import { trimModulationPath, maxChordsForSpan } from './keyChangeTrim'
import { enumerateHybridPairs } from './keyChangeHybridsEnum'

const PPQ = 480

describe('trimModulationPath', () => {
  it('shortens circle-walk to fit maxLength', () => {
    const paths = suggestKeyChanges({
      fromTonality: 0,
      toTonality: 6,
      includeHybrids: false,
      minLength: 4,
      limit: 20,
    })
    const long = paths.find((p) => p.length >= 4)
    expect(long).toBeTruthy()
    const trimmed = trimModulationPath(long!, { maxLength: 3 })
    expect(trimmed.length).toBeGreaterThan(0)
    expect(trimmed.every((t) => t.length <= 3)).toBe(true)
    expect(trimmed[0]!.fromTonality).toBe(long!.fromTonality)
    expect(trimmed[0]!.toTonality).toBe(long!.toTonality)
  })

  it('maxChordsForSpan is beat-based', () => {
    expect(
      maxChordsForSpan({ startTick: 0, endTick: PPQ * 4, ppq: PPQ, denominator: 4 }),
    ).toBe(4)
  })
})

describe('enumerateHybridPairs', () => {
  it('returns capped hybrids for C→Db', () => {
    const bases = suggestKeyChanges({
      fromTonality: 0,
      toTonality: 1,
      includeHybrids: false,
      limit: 20,
    })
    const hybrids = enumerateHybridPairs(bases, {
      maxLength: 6,
      beamWidth: 4,
      limit: 8,
    })
    expect(hybrids.length).toBeGreaterThan(0)
    expect(hybrids.length).toBeLessThanOrEqual(8)
    expect(hybrids.every((h) => h.character === 'hybrid')).toBe(true)
    expect(hybrids.every((h) => h.length <= 6)).toBe(true)
  })
})
