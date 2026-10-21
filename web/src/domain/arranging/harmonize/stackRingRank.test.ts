/**
 * Stack-ring prior should prefer stronger measured shells among otherwise equal candidates.
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import { STACK_RING_PRIORS } from '../harmonicity/stackRingPriors.generated'
import { rankCandidates } from './candidateRanker'
import type { UnscoredCandidate } from './types'
import type { VoicingPitches } from '../chords'

const MIDI: VoicingPitches = { bass: 52, bari: 60, lead: 67, tenor: 72 }

function cand(voicing: string): UnscoredCandidate {
  return {
    rootPc: 0,
    natureId: 'seventh',
    voicing,
    spread: false,
    layer: 'primary',
    midi: MIDI,
    motionScore: 0,
    towardPillar: true,
    ruleTags: [],
    prevMidi: null,
    prevPrevMidi: null,
    prevRootPc: null,
    prevNatureId: null,
    nextPillarRoot: null,
  }
}

describe('stackRing ranking', () => {
  it('prefers higher measured seventh shells when other factors are equalized', () => {
    const strong = '5371'
    const weak = '5713'
    expect(STACK_RING_PRIORS[`seventh:${strong}`]!).toBeGreaterThan(
      STACK_RING_PRIORS[`seventh:${weak}`]!,
    )
    const ranked = rankCandidates([cand(weak), cand(strong)], {
      weights: {
        motion: 0,
        primaryLayer: 0,
        seventh: 0,
        closedVoicing: 0,
        ring: 0,
        stackRing: 3,
        secondaryDominant: 0,
        augDimPrimaryPenalty: 0,
        harmonicity: 0,
        voiceLead: 0,
        strongVoice: 0,
        dim5Down: 0,
        tensionRelease: 0,
        resolution: 0,
        spacing: 0,
        contrary: 0,
        commonTone: 0,
        parallelPenalty: 0,
        homeTriad: 0,
        colorChordPenalty: 0,
        passingSoftPenalty: 0,
        cadenceFit: 0,
        unforcedMinorPenalty: 0,
        finalComplete: 0,
        diatonicFunction: 0,
        songFinalHome: 0,
        completeFourPart: 0,
        registerHome: 0,
        upperTrioClose: 0,
        postLeapDirection: 0,
        hazardousLeap: 0,
      },
      harmonicity: null,
    })
    expect(ranked[0]!.voicing).toBe(strong)
  })
})
