import { describe, expect, it } from 'vitest'
import {
  STROBE_HZ_PER_CENT,
  advanceStrobePhase,
  centsToStrobeDirection,
  centsToStrobeRateHz,
  strobeStripeOffsets,
} from './strobe'

describe('strobe', () => {
  it('maps positive cents to positive rate and direction', () => {
    expect(centsToStrobeRateHz(10)).toBeCloseTo(10 * STROBE_HZ_PER_CENT, 6)
    expect(centsToStrobeDirection(10)).toBe(1)
    expect(centsToStrobeDirection(-10)).toBe(-1)
    expect(centsToStrobeDirection(0.1)).toBe(0)
  })

  it('advances phase in the sharp direction for +¢', () => {
    const a = advanceStrobePhase(0, 10, 1)
    expect(a.direction).toBe(1)
    expect(a.phase01).toBeCloseTo(wrap(10 * STROBE_HZ_PER_CENT), 5)
    const flat = advanceStrobePhase(0.5, -10, 0.5)
    expect(flat.direction).toBe(-1)
    expect(flat.phase01).toBeLessThan(0.5)
  })

  it('known detune → phase magnitude over 1s matches rate×time', () => {
    const cents = 25
    const sample = advanceStrobePhase(0, cents, 1)
    expect(sample.rateHz).toBeCloseTo(cents * STROBE_HZ_PER_CENT, 6)
    expect(sample.phase01).toBeCloseTo(wrap(sample.rateHz), 6)
  })

  it('stripe offsets wrap within width', () => {
    const offs = strobeStripeOffsets(0.25, 4, 100)
    expect(offs).toHaveLength(4)
    for (const o of offs) {
      expect(o).toBeGreaterThanOrEqual(0)
      expect(o).toBeLessThan(100)
    }
  })
})

function wrap(v: number): number {
  const r = v % 1
  return r < 0 ? r + 1 : r
}
