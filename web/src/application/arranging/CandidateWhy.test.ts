import { describe, expect, it } from 'vitest'
import type { HarmonizeCandidate } from '../../domain/arranging/harmonize/types'
import { whyViewForCandidate } from './CandidateWhy'

const cand = (over: Partial<HarmonizeCandidate> = {}): HarmonizeCandidate => ({
  rootPc: 7,
  natureId: 'seventh',
  voicing: '1513',
  spread: false,
  layer: 'primary',
  scfGroup: null,
  midi: { bass: 50, bari: 55, lead: 67, tenor: 74 },
  score: 12.5,
  ruleTags: ['R1_p5'],
  label: 'G7',
  harmonicity: 0.82,
  ...over,
})

describe('whyViewForCandidate', () => {
  it('plain-languages jargon bullets and omits raw score in summary path', () => {
    const view = whyViewForCandidate(cand())
    expect(view.headline).toBeTruthy()
    expect(view.bullets.some((b) => /home chord|lock-and-ring|Strong root/i.test(b.label))).toBe(
      true,
    )
    expect(view.bullets.every((b) => b.whyItMatters.length > 10)).toBe(true)
    expect(view.summary.toLowerCase()).not.toMatch(/0\.82/)
  })

  it('maps harmonicity bullet to rings-in-tune', () => {
    const view = whyViewForCandidate(cand({ harmonicity: 0.9 }))
    const hit = view.bullets.find((b) => /Rings in tune/i.test(b.label))
    expect(hit?.whyItMatters).toMatch(/Partials|locks/i)
  })
})
