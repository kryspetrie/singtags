/**
 * Rank unscored candidates with injectable weights + optional HarmonicityScorer.
 */
import { ringTier } from '../contestProfile'
import type { HarmonicityScorer } from '../harmonicity/harmonicityScore'
import { createHarmonicityScorer } from '../harmonicity/harmonicityScore'
import { theoryRankBonuses, voiceLeadScore } from '../theoryScores'
import { DEFAULT_RANKING_WEIGHTS, type RankingWeights } from './rankingWeights'
import type { HarmonizeCandidate, UnscoredCandidate } from './types'
import type { RuleTag } from '../types'
import type { VoicingPitches } from '../chords'

export type RankerDeps = {
  weights?: Partial<RankingWeights>
  harmonicity?: HarmonicityScorer | null
  /** Melody-carrying part excluded from VL / ranking common-tone. Default lead. */
  melodyVoice?: keyof VoicingPitches
}

function strongVoiceScore(c: UnscoredCandidate): number {
  const leadRole = Number(c.voicing[2])
  if (!Number.isFinite(leadRole)) return 0
  if (c.natureId === 'seventh' || c.natureId === 'ninth' || c.natureId === 'm7') {
    return leadRole === 3 || leadRole === 7 ? 1 : leadRole === 1 || leadRole === 5 ? 0 : 0.4
  }
  if (c.natureId === 'major' || c.natureId === 'minor') {
    return leadRole === 3 ? 1 : leadRole === 1 ? 0.6 : 0.25
  }
  return 0.5
}

export function rankCandidates(
  candidates: readonly UnscoredCandidate[],
  deps: RankerDeps = {},
): HarmonizeCandidate[] {
  const w: RankingWeights = { ...DEFAULT_RANKING_WEIGHTS, ...deps.weights }
  const harm = deps.harmonicity === undefined ? createHarmonicityScorer() : deps.harmonicity
  const melodyVoice = deps.melodyVoice ?? 'lead'

  const scored: HarmonizeCandidate[] = candidates.map((c) => {
    let score = w.motion * c.motionScore
    if (c.layer === 'primary') score += w.primaryLayer
    if (c.natureId === 'seventh') score += w.seventh
    if (!c.spread) score += w.closedVoicing
    score += w.ring * Math.max(0, 7 - ringTier(c.natureId))

    const tags = [...c.ruleTags] as RuleTag[]
    if (
      c.nextPillarRoot != null &&
      c.natureId === 'seventh' &&
      (c.rootPc - c.nextPillarRoot + 12) % 12 === 7
    ) {
      score += w.secondaryDominant
      if (!tags.includes('R1_p5')) tags.push('R1_p5')
    }
    if (c.layer === 'primary' && (c.natureId === 'aug' || c.natureId === 'dim7')) {
      score -= w.augDimPrimaryPenalty
    }

    // Szabo: lowered-degree BS7s often move by dim5 (tritone) — soft bump
    if (
      c.prevRootPc != null &&
      (c.natureId === 'seventh' || c.natureId === 'ninth') &&
      (((c.rootPc - c.prevRootPc) % 12) + 12) % 12 === 6
    ) {
      const fromDeg = ((c.prevRootPc % 12) + 12) % 12
      // Prefer when leaving a chromatic / non-diatonic-ish degree color (1,3,6,8,10)
      if ([1, 3, 6, 8, 10].includes(fromDeg)) {
        score += w.dim5Down
      }
    }

    score += w.voiceLead * voiceLeadScore(c.prevMidi, c.midi, { melodyVoice })
    score += w.strongVoice * strongVoiceScore(c)

    const bonuses = theoryRankBonuses({
      midi: c.midi,
      prevMidi: c.prevMidi,
      natureId: c.natureId,
      rootPc: c.rootPc,
      layer: c.layer,
      nextPillarRoot: c.nextPillarRoot,
      towardPillar: c.towardPillar,
      prevDominant: c.prevDominant ?? null,
      melodyVoice,
    })
    score += w.tensionRelease * bonuses.tensionRelease
    score += w.resolution * bonuses.resolution
    score += w.spacing * bonuses.spacing
    score += w.contrary * bonuses.contrary
    score += w.commonTone * bonuses.commonTone
    score -= w.parallelPenalty * bonuses.parallelPenalty

    let harmonicityNorm: number | undefined
    if (harm) {
      const raw = harm.score({
        midi: c.midi,
        natureId: c.natureId,
        rootPc: c.rootPc,
        voicing: c.voicing,
        useJust: true,
      })
      harmonicityNorm = harm.normalize(raw)
      score += w.harmonicity * harmonicityNorm
    }

    return {
      rootPc: c.rootPc,
      natureId: c.natureId,
      voicing: c.voicing,
      spread: c.spread,
      layer: c.layer,
      scfGroup: c.scfGroup,
      midi: c.midi,
      score,
      ruleTags: tags,
      label: c.label,
      harmonicity: harmonicityNorm,
    }
  })

  scored.sort((a, b) => b.score - a.score)
  return scored
}

export function createCandidateRanker(deps: RankerDeps = {}) {
  return {
    rank(candidates: readonly UnscoredCandidate[], limit?: number): HarmonizeCandidate[] {
      const ranked = rankCandidates(candidates, deps)
      return limit != null ? ranked.slice(0, limit) : ranked
    },
  }
}

/** Expose score parts for Why? / coach explanations (UI render only). */
export function explainRankingBreakdown(
  c: UnscoredCandidate,
  deps: RankerDeps = {},
): { label: string; value: number; teachingId?: string }[] {
  const w: RankingWeights = { ...DEFAULT_RANKING_WEIGHTS, ...deps.weights }
  const melodyVoice = deps.melodyVoice ?? 'lead'
  const isSecDom =
    c.nextPillarRoot != null &&
    c.natureId === 'seventh' &&
    (c.rootPc - c.nextPillarRoot + 12) % 12 === 7
  const bonuses = theoryRankBonuses({
    midi: c.midi,
    prevMidi: c.prevMidi,
    natureId: c.natureId,
    rootPc: c.rootPc,
    layer: c.layer,
    nextPillarRoot: c.nextPillarRoot,
    towardPillar: c.towardPillar,
    prevDominant: c.prevDominant ?? null,
    melodyVoice,
  })
  const parts: { label: string; value: number; teachingId?: string }[] = [
    { label: 'motion', value: w.motion * c.motionScore },
    { label: 'primary', value: c.layer === 'primary' ? w.primaryLayer : 0 },
    { label: 'seventh', value: c.natureId === 'seventh' ? w.seventh : 0 },
    { label: 'closed', value: !c.spread ? w.closedVoicing : 0 },
    { label: 'ring', value: w.ring * Math.max(0, 7 - ringTier(c.natureId)) },
    { label: 'secondaryDominant', value: isSecDom ? w.secondaryDominant : 0, teachingId: 'secondary_dom' },
    {
      label: 'voiceLead',
      value: w.voiceLead * voiceLeadScore(c.prevMidi, c.midi, { melodyVoice }),
    },
    { label: 'strongVoice', value: w.strongVoice * strongVoiceScore(c) },
    {
      label: 'tensionRelease',
      value: w.tensionRelease * bonuses.tensionRelease,
      teachingId: 'tension_release',
    },
    {
      label: 'resolution',
      value: w.resolution * bonuses.resolution,
      teachingId: 'tension_release',
    },
    {
      label: 'spacing',
      value: w.spacing * bonuses.spacing,
      teachingId: 'harmonic_series_spacing',
    },
    {
      label: 'contrary',
      value: w.contrary * bonuses.contrary,
      teachingId: 'contrary_motion',
    },
    {
      label: 'commonTone',
      value: w.commonTone * bonuses.commonTone,
      teachingId: 'common_tone',
    },
    {
      label: 'parallelPenalty',
      value: -w.parallelPenalty * bonuses.parallelPenalty,
      teachingId: 'parallel_5_8',
    },
  ]
  return parts.filter((p) => p.value !== 0)
}
