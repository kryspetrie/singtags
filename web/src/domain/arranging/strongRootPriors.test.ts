import { describe, expect, it } from 'vitest'
import {
  bareMajorHomeDeg,
  lookupStrongRootPrior,
  STRONG_ROOT_PRIOR_TABLE,
} from './strongRootPriors'

describe('strongRootPriors', () => {
  it('ships a non-empty fitted table', () => {
    expect(Object.keys(STRONG_ROOT_PRIOR_TABLE).length).toBeGreaterThan(40)
  })

  it('bare map: ^1/^4/^2 → I/IV/V', () => {
    expect(bareMajorHomeDeg(0)).toBe(0)
    expect(bareMajorHomeDeg(5)).toBe(5)
    expect(bareMajorHomeDeg(2)).toBe(7)
  })

  it('lookup returns a diatonic home for common after-I contexts', () => {
    const deg = lookupStrongRootPrior({
      scaleDegree: 4,
      prevHomeDeg: 0,
      nextBareDeg: null,
      phraseEdge: null,
      beatInBar: 0,
      durationBucket: 'q',
      intervalClass: 's',
      barsFromPhraseStart: '1',
    })
    expect(deg == null || [0, 2, 5, 7, 9].includes(deg)).toBe(true)
  })
})
