import { describe, expect, it } from 'vitest'
import { fundamentalsFromPeaks } from './fundamentalsFromPeaks'

describe('fundamentalsFromPeaks', () => {
  it('keeps root and rejects octave/harmonic of a stronger lower peak', () => {
    const out = fundamentalsFromPeaks([
      { hz: 220, salience: 0.9 },
      { hz: 440, salience: 0.5 },
      { hz: 660, salience: 0.4 },
      { hz: 277, salience: 0.7 },
    ])
    expect(out.map((p) => Math.round(p.hz))).toEqual([220, 277])
  })

  it('keeps two independent fundamentals', () => {
    const out = fundamentalsFromPeaks([
      { hz: 220, salience: 0.8 },
      { hz: 330, salience: 0.75 },
    ])
    expect(out).toHaveLength(2)
  })
})
