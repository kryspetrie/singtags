/**
 * Precise goldens for melody-aware voiceLeadScore + ranker preference.
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import { voiceLeadScore, commonToneScore } from '../theoryScores'
import {
  explainRankingBreakdown,
  rankCandidates,
} from './candidateRanker'
import type { UnscoredCandidate } from './types'
import type { VoicingPitches } from '../chords'

const PREV: VoicingPitches = { bass: 48, bari: 52, lead: 60, tenor: 67 }

const VL_ONLY = {
  motion: 0,
  primaryLayer: 0,
  seventh: 0,
  closedVoicing: 0,
  ring: 0,
  secondaryDominant: 0,
  augDimPrimaryPenalty: 0,
  harmonicity: 0,
  voiceLead: 1,
  strongVoice: 0,
  dim5Down: 0,
  tensionRelease: 0,
  resolution: 0,
  spacing: 0,
  contrary: 0,
  commonTone: 0,
  parallelPenalty: 0,
} as const

function baseCand(midi: VoicingPitches, id = 'c'): UnscoredCandidate {
  return {
    rootPc: 0,
    natureId: 'major',
    voicing: '1531',
    spread: false,
    layer: 'primary',
    scfGroup: null,
    midi,
    ruleTags: [],
    label: id,
    motionScore: 0,
    towardPillar: true,
    nextPillarRoot: null,
    prevMidi: PREV,
    prevRootPc: 0,
  }
}

describe('voiceLeadScore (melody-aware)', () => {
  it('null prev → neutral 0.5', () => {
    expect(voiceLeadScore(null, PREV)).toBe(0.5)
    expect(voiceLeadScore(undefined, PREV)).toBe(0.5)
  })

  it('harmony static → 1.0 even when lead leaps', () => {
    const next = { ...PREV, lead: PREV.lead + 5 }
    expect(voiceLeadScore(PREV, next)).toBe(1)
  })

  it('all harmony held → 1.0', () => {
    expect(voiceLeadScore(PREV, { ...PREV })).toBe(1)
  })

  it('harmony total abs motion 18 → 0', () => {
    // bass +6, bari +6, tenor +6
    const next = { bass: 54, bari: 58, lead: 60, tenor: 73 }
    expect(voiceLeadScore(PREV, next)).toBe(0)
  })

  it('partial harmony motion scales linearly', () => {
    // bari +9 only → 1 - 9/18 = 0.5
    const next = { ...PREV, bari: PREV.bari + 9 }
    expect(voiceLeadScore(PREV, next)).toBe(0.5)
  })

  it('melodyVoice tenor excludes tenor motion instead of lead', () => {
    const tenorLeap = { ...PREV, tenor: PREV.tenor + 12 }
    const leadLeap = { ...PREV, lead: PREV.lead + 12 }
    expect(voiceLeadScore(PREV, tenorLeap, { melodyVoice: 'tenor' })).toBe(1)
    expect(voiceLeadScore(PREV, leadLeap, { melodyVoice: 'tenor' })).toBeLessThan(1)
  })
})

describe('commonToneScore melody exclusion (ranking)', () => {
  it('without opts, lead PC change can dilute ratio', () => {
    // All hold except lead moves to a new PC not in prev harmony
    const next = { bass: 48, bari: 52, lead: 61, tenor: 67 }
    const full = commonToneScore(PREV, next)
    const harmonyOnly = commonToneScore(PREV, next, { melodyVoice: 'lead' })
    // Harmony voices all hold → harmonyOnly = 1; full includes lead miss
    expect(harmonyOnly).toBe(1)
    expect(full).toBeLessThan(1)
  })
})

describe('rankCandidates prefers smoother harmony VL', () => {
  it('smoother bari/tenor ranks above leaping harmony when only voiceLead weighs', () => {
    const smooth = baseCand({ ...PREV, lead: 62 }, 'smooth')
    const leap = baseCand(
      { bass: 48, bari: 64, lead: 62, tenor: 79 },
      'leap',
    )
    const ranked = rankCandidates([leap, smooth], {
      weights: { ...VL_ONLY },
      harmonicity: null,
    })
    expect(ranked[0]!.label).toBe('smooth')
    expect(ranked[0]!.score).toBeGreaterThan(ranked[1]!.score)
  })

  it('lead-only leap does not lower voiceLead vs static lead', () => {
    const heldLead = baseCand({ ...PREV }, 'held')
    const leapingLead = baseCand({ ...PREV, lead: PREV.lead + 7 }, 'leadLeap')
    const ranked = rankCandidates([heldLead, leapingLead], {
      weights: { ...VL_ONLY },
      harmonicity: null,
    })
    expect(ranked[0]!.score).toBe(ranked[1]!.score)
    expect(ranked.every((c) => c.score === 1)).toBe(true)
  })

  it('explainRankingBreakdown reports known voiceLead value', () => {
    // bari +9 → voiceLeadScore 0.5; weight 1 → contribution 0.5
    const c = baseCand({ ...PREV, bari: PREV.bari + 9 })
    const parts = explainRankingBreakdown(c, {
      weights: { ...VL_ONLY },
      harmonicity: null,
    })
    const vl = parts.find((p) => p.label === 'voiceLead')
    expect(vl?.value).toBe(0.5)
  })
})
