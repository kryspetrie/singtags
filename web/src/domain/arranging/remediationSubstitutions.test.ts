import { describe, expect, it } from 'vitest'
import { listSubstitutionBranches } from './substitutions'
import { secondaryDominantRootOf } from './secondaryDominant'

describe('remediation: substitution ladder', () => {
  it('orders PCF before secondary-dom before relative/SCF', () => {
    // Lead E (64) under C pillar, next pillar G — fits C major/7 and D7
    const branches = listSubstitutionBranches({
      leadMidi: 64,
      pillarRoot: 0,
      tonality: 0,
      nextPillarRoot: 7,
    })
    expect(branches.length).toBeGreaterThan(1)
    expect(branches[0]!.strategy).toBe('pillar_pcf')
    const strategies = branches.map((b) => b.strategy)
    expect(strategies).toContain('secondary_dom')
    const sec = branches.find((b) => b.strategy === 'secondary_dom')!
    expect(sec.rootPc).toBe(secondaryDominantRootOf(7))
    // ranks non-decreasing
    for (let i = 1; i < branches.length; i++) {
      expect(branches[i]!.rank).toBeGreaterThanOrEqual(branches[i - 1]!.rank)
    }
  })

  it('includes relative-minor branch when lead fits', () => {
    // Lead C (60) under C — also root of Am relative? Am = 9: A C E — C fits
    const branches = listSubstitutionBranches({
      leadMidi: 60,
      pillarRoot: 0,
      tonality: 0,
    })
    expect(branches.some((b) => b.strategy === 'relative_minor')).toBe(true)
  })

  it('minor mode labels V7/iv approach', () => {
    const branches = listSubstitutionBranches({
      leadMidi: 64, // E
      pillarRoot: 9, // A
      tonality: 9,
      mode: 'minor',
      nextPillarRoot: 9,
    })
    const sub = branches.find((b) => b.strategy === 'subdominant_approach')
    if (sub) expect(sub.label).toContain('iv')
  })
})
