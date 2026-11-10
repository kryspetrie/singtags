import { describe, expect, it } from 'vitest'
import { auditionRegionFromPeaks, consecutiveIntervalCents } from './regionAudition'

describe('regionAudition', () => {
  it('builds a capped region from peaks', () => {
    const r = auditionRegionFromPeaks([440, 554.37, 659.25, 0, NaN])
    expect(r?.hz).toEqual([440, 554.37, 659.25])
    expect(r?.label).toBe('resynth')
  })

  it('reports ~M3 then ~m3 cents for a major triad stack', () => {
    const cents = consecutiveIntervalCents([261.63, 329.63, 392.0])
    expect(cents[0]).toBeCloseTo(400, -1) // ~M3
    expect(cents[1]).toBeCloseTo(300, -1) // ~m3
  })

  it('returns null for empty selection', () => {
    expect(auditionRegionFromPeaks([])).toBeNull()
  })
})
