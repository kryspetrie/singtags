import { describe, expect, it } from 'vitest'
import {
  co5EdgeCost,
  decodeStrongHomesCo5Beam,
  decodeStrongHomesCo5UnderLocks,
} from './strongRootCo5'

describe('strongRootCo5', () => {
  it('cheapens II→V→I circle edges', () => {
    expect(co5EdgeCost(2, 7)).toBeLessThan(co5EdgeCost(2, 5))
    expect(co5EdgeCost(7, 0)).toBeLessThan(co5EdgeCost(7, 5))
  })

  it('beam prefers II→V→I when Lead fits the highway', () => {
    // Synthetic: ^2 → ^7 → ^1 with preferred already II V I
    const degs = decodeStrongHomesCo5Beam([
      { scaleDegree: 2, preferredDeg: 2, phraseEdge: 'start' },
      { scaleDegree: 7, preferredDeg: 7, phraseEdge: null },
      { scaleDegree: 0, preferredDeg: 0, phraseEdge: 'end' },
    ])
    expect(degs).toEqual([2, 7, 0])
  })

  it('penalizes illegal jumps harder than Co5 edges', () => {
    expect(co5EdgeCost(2, 9)).toBeGreaterThan(co5EdgeCost(2, 7))
  })

  it('decodeUnderLocks forces locked homes (C6)', () => {
    const notes = [
      { scaleDegree: 0, preferredDeg: 0, phraseEdge: 'start' as const },
      { scaleDegree: 2, preferredDeg: 2, phraseEdge: null },
      { scaleDegree: 7, preferredDeg: 7, phraseEdge: null },
      { scaleDegree: 0, preferredDeg: 0, phraseEdge: 'end' as const },
    ]
    const locks = new Map<number, number>([
      [0, 0],
      [3, 0],
    ])
    const degs = decodeStrongHomesCo5UnderLocks(notes, locks)
    expect(degs[0]).toBe(0)
    expect(degs[3]).toBe(0)
    expect(degs).toHaveLength(4)
  })
})
