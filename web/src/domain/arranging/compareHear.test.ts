import { describe, expect, it } from 'vitest'
import { compareEqualVsJust, compareHearTopTwo } from './compareHear'
import type { HarmonizeCandidate } from './harmonize/types'

function cand(partial: Partial<HarmonizeCandidate> & Pick<HarmonizeCandidate, 'label'>): HarmonizeCandidate {
  return {
    rootPc: 0,
    natureId: 'seventh',
    voicing: '1735',
    spread: false,
    layer: 'primary',
    scfGroup: null,
    midi: { bass: 48, bari: 58, lead: 64, tenor: 67 },
    score: 10,
    ruleTags: [],
    ...partial,
  }
}

describe('compareHear', () => {
  it('builds ET vs JI pair with different cents', () => {
    const pair = compareEqualVsJust(cand({ label: 'a' }))
    expect(pair.a.cents.lead).toBe(0)
    expect(pair.b.cents.bass).toBe(0)
    // Just M3/P5/7th move bari/tenor off ET
    expect(pair.a.cents).not.toEqual(pair.b.cents)
  })

  it('returns null for fewer than 2 candidates', () => {
    expect(compareHearTopTwo([cand({ label: 'only' })])).toBeNull()
  })

  it('returns top two', () => {
    const pair = compareHearTopTwo([
      cand({ label: 'a', score: 12 }),
      cand({ label: 'b', score: 11, natureId: 'major', voicing: '1351', midi: { bass: 48, bari: 52, lead: 60, tenor: 67 } }),
    ])
    expect(pair?.a.label).toContain('a')
    expect(pair?.b.label).toContain('b')
  })
})
