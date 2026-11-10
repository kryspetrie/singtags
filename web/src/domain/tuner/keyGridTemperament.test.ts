import { describe, expect, it } from 'vitest'
import { keyGridOffsetCents } from './keyGridTemperament'

describe('keyGridTemperament', () => {
  it('returns 0 for equal temperament', () => {
    expect(keyGridOffsetCents(4, 0, 'equal')).toBe(0)
  })

  it('applies just-triad M3 ≈ −14¢ and P5 ≈ +2¢ vs ET in C', () => {
    expect(keyGridOffsetCents(4, 0, 'justTriad')).toBeCloseTo(-13.7, 1)
    expect(keyGridOffsetCents(7, 0, 'justTriad')).toBeCloseTo(2.0, 1)
  })

  it('reads custom offsets by pitch class', () => {
    const custom = Array.from({ length: 12 }, (_, i) => (i === 4 ? -14 : 0))
    expect(keyGridOffsetCents(4, 0, 'custom', custom)).toBe(-14)
    expect(keyGridOffsetCents(0, 0, 'custom', custom)).toBe(0)
  })
})
