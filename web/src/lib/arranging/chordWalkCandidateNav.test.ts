/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import type { HarmonizeCandidate } from '../../domain/arranging/harmonize'
import { indexAfterSpreadToggle, indexAfterVoicingStep } from './chordWalkCandidateNav'

function cand(
  partial: Pick<HarmonizeCandidate, 'rootPc' | 'natureId' | 'voicing' | 'spread'> & {
    label?: string
  },
): HarmonizeCandidate {
  return {
    rootPc: partial.rootPc,
    natureId: partial.natureId,
    voicing: partial.voicing,
    spread: partial.spread,
    layer: 'primary',
    scfGroup: null,
    midi: { tenor: 60, lead: 55, bari: 52, bass: 43 },
    score: 1,
    ruleTags: [],
    label: partial.label ?? 'x',
  }
}

describe('chordWalkCandidateNav', () => {
  const list = [
    cand({ rootPc: 0, natureId: 'major', voicing: 'root', spread: false }),
    cand({ rootPc: 0, natureId: 'major', voicing: 'root', spread: true }),
    cand({ rootPc: 0, natureId: 'major', voicing: '1st', spread: false }),
    cand({ rootPc: 0, natureId: 'major', voicing: '1st', spread: true }),
    cand({ rootPc: 2, natureId: 'seventh', voicing: 'root', spread: false }),
  ]

  it('steps unique voicings within the same chord, preferring spread match', () => {
    expect(indexAfterVoicingStep(list, 0, 1)).toBe(2) // root closed → 1st closed
    expect(indexAfterVoicingStep(list, 1, 1)).toBe(3) // root wide → 1st wide
    expect(indexAfterVoicingStep(list, 2, -1)).toBe(0)
  })

  it('toggles Closed/Wide for the same voicing', () => {
    expect(indexAfterSpreadToggle(list, 0)).toBe(1)
    expect(indexAfterSpreadToggle(list, 1)).toBe(0)
    expect(indexAfterSpreadToggle(list, 4)).toBeNull()
  })
})
