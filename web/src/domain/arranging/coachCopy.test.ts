import { describe, expect, it } from 'vitest'
import { explainCandidate } from './coachCopy'
import type { HarmonizeCandidate } from './harmonize/types'

describe('coachCopy explainCandidate', () => {
  it('builds bullets from tags and harmonicity', () => {
    const c: HarmonizeCandidate = {
      rootPc: 0,
      natureId: 'seventh',
      voicing: '1735',
      spread: false,
      layer: 'primary',
      scfGroup: null,
      midi: { bass: 48, bari: 58, lead: 64, tenor: 67 },
      score: 12,
      ruleTags: ['R1_p5'],
      label: 'x',
      harmonicity: 0.8,
    }
    const why = explainCandidate(c)
    expect(why.bullets.some((b) => b.includes('Primary'))).toBe(true)
    expect(why.bullets.some((b) => b.includes('harmonicity'))).toBe(true)
    expect(why.ruleTags).toContain('R1_p5')
  })
})
