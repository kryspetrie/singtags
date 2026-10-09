import { describe, expect, it } from 'vitest'
import {
  decodeStrongHomesViterbi,
  pathScore,
  rerankStrongHomesCadence,
} from './strongRootCadence'

describe('decodeStrongHomesViterbi', () => {
  it('prefers V→I at phrase end', () => {
    const degs = decodeStrongHomesViterbi([
      { scaleDegree: 7, preferredDeg: 7, phraseEdge: 'start' },
      { scaleDegree: 0, preferredDeg: 0, phraseEdge: 'end' },
    ])
    expect(degs).toEqual([7, 0])
  })

  it('prefers II→V→I over mediant thrash', () => {
    const degs = decodeStrongHomesViterbi([
      { scaleDegree: 2, preferredDeg: 2, phraseEdge: 'start' },
      { scaleDegree: 7, preferredDeg: 7, phraseEdge: null },
      { scaleDegree: 0, preferredDeg: 0, phraseEdge: 'end' },
    ])
    expect(degs[0]).toBe(2)
    expect(degs[1]).toBe(7)
    expect(degs[2]).toBe(0)
  })

  it('Irish-Rose-like open V→I then mid I→V→I', () => {
    const degs = decodeStrongHomesViterbi([
      { scaleDegree: 7, preferredDeg: 7, phraseEdge: 'start' },
      { scaleDegree: 0, preferredDeg: 0, phraseEdge: null },
      { scaleDegree: 7, preferredDeg: 7, phraseEdge: null },
      { scaleDegree: 0, preferredDeg: 0, phraseEdge: 'end' },
    ])
    expect(degs[0]).toBe(7)
    expect(degs[degs.length - 1]).toBe(0)
  })

  it('Sweetheart-like I→V→I holds tonic edges', () => {
    const degs = decodeStrongHomesViterbi([
      { scaleDegree: 0, preferredDeg: 0, phraseEdge: 'start' },
      { scaleDegree: 7, preferredDeg: 7, phraseEdge: null },
      { scaleDegree: 0, preferredDeg: 0, phraseEdge: 'end' },
    ])
    expect(degs[0]).toBe(0)
    expect(degs[1]).toBe(7)
    expect(degs[2]).toBe(0)
  })

  it('^5 after I can resolve as V then I (not smear I)', () => {
    // Bare prior maps ^5→I; phrase path should allow I→V→I.
    const notes = [
      { scaleDegree: 0, preferredDeg: 0, phraseEdge: 'start' as const },
      { scaleDegree: 7, preferredDeg: 0, phraseEdge: null },
      { scaleDegree: 0, preferredDeg: 0, phraseEdge: 'end' as const },
    ]
    const degs = decodeStrongHomesViterbi(notes)
    expect(degs[0]).toBe(0)
    expect(degs[1]).toBe(7)
    expect(degs[2]).toBe(0)
    expect(pathScore(notes, degs)).toBeGreaterThanOrEqual(pathScore(notes, [0, 0, 0]))
  })
})

describe('rerankStrongHomesCadence', () => {
  it('matches Viterbi at default beam width', () => {
    const notes = [
      { scaleDegree: 2, preferredDeg: 2, phraseEdge: 'start' as const },
      { scaleDegree: 7, preferredDeg: 7, phraseEdge: null },
      { scaleDegree: 0, preferredDeg: 0, phraseEdge: 'end' as const },
    ]
    expect(rerankStrongHomesCadence(notes)).toEqual(decodeStrongHomesViterbi(notes))
  })
})
