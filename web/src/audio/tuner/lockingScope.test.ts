import { describe, expect, it } from 'vitest'
import {
  advanceScopePhase,
  centsToScopeDirection,
  centsToScopeRateHz,
  scopeWavePoints,
  scopeWaveY,
} from './lockingScope'

describe('lockingScope', () => {
  it('maps cents to signed scroll rate', () => {
    expect(centsToScopeRateHz(0)).toBe(0)
    expect(centsToScopeRateHz(10)).toBeGreaterThan(0)
    expect(centsToScopeRateHz(-10)).toBeLessThan(0)
  })

  it('freezes phase when within deadband (locked)', () => {
    const a = advanceScopePhase(0.25, 0.2, 1)
    expect(a.locked).toBe(true)
    expect(a.phase01).toBeCloseTo(0.25, 6)
    expect(a.direction).toBe(0)
  })

  it('advances phase when sharp', () => {
    const a = advanceScopePhase(0, 20, 1)
    expect(a.locked).toBe(false)
    expect(a.direction).toBe(1)
    expect(a.phase01).toBeGreaterThan(0)
  })

  it('advances opposite when flat', () => {
    expect(centsToScopeDirection(-8)).toBe(-1)
    const a = advanceScopePhase(0.5, -20, 0.5)
    expect(a.direction).toBe(-1)
    expect(a.phase01).not.toBeCloseTo(0.5, 3)
  })

  it('samples a continuous sine across the plot', () => {
    expect(scopeWaveY(0, 0)).toBeCloseTo(0, 6)
    const pts = scopeWavePoints(0, 9)
    expect(pts).toHaveLength(9)
    expect(pts[0]!.x01).toBe(0)
    expect(pts[8]!.x01).toBe(1)
    // Midpoint of first half-cycle of a 2.5-cycle wave is nonzero.
    expect(Math.abs(pts[2]!.y)).toBeGreaterThan(0.1)
  })
})
