/**
 * Rank unscored candidates with injectable weights + optional HarmonicityScorer.
 */
import { ringTier } from '../contestProfile'
import type { HarmonicityScorer } from '../harmonicity/harmonicityScore'
import { createHarmonicityScorer } from '../harmonicity/harmonicityScore'
import { theoryRankBonuses, voiceLeadScore } from '../theoryScores'
import {
  scoreCadenceFit,
  type CadenceBias,
  type CadenceContext,
} from '../cadences'
import { DEFAULT_RANKING_WEIGHTS, type RankingWeights } from './rankingWeights'
import type { HarmonizeCandidate, UnscoredCandidate } from './types'
import type { RuleTag } from '../types'
import type { VoicingPitches } from '../chords'

export type RankerDeps = {
  weights?: Partial<RankingWeights>
  harmonicity?: HarmonicityScorer | null
  /** Melody-carrying part excluded from VL / ranking common-tone. Default lead. */
  melodyVoice?: keyof VoicingPitches
  /** Shared cadence context for this ranking moment (Detected + Coach). */
  cadenceContext?: CadenceContext | null
  /** Strong (default) / Moderate / Off — scales cadenceFit. */
  cadenceBias?: CadenceBias
}

function leadRoleOf(c: UnscoredCandidate): number {
  const leadRole = Number(c.voicing[2])
  return Number.isFinite(leadRole) ? leadRole : 0
}

function strongVoiceScore(c: UnscoredCandidate): number {
  const leadRole = leadRoleOf(c)
  if (!leadRole) return 0
  if (c.natureId === 'seventh' || c.natureId === 'ninth' || c.natureId === 'm7') {
    return leadRole === 3 || leadRole === 7 ? 1 : leadRole === 1 || leadRole === 5 ? 0 : 0.4
  }
  if (c.natureId === 'major' || c.natureId === 'minor') {
    return leadRole === 3 ? 1 : leadRole === 1 ? 0.85 : leadRole === 5 ? 0.55 : 0.25
  }
  return 0.5
}

/**
 * BS7 color when the lead is 3 or 7; avoid automatic I7/IV7 when the lead is the root.
 * Secondary-dominant / tension still wins via dedicated weights when the lead supports it.
 */
function seventhBias(c: UnscoredCandidate, w: RankingWeights, leadRole: number): number {
  const isBs7 = c.natureId === 'seventh' || c.natureId === 'ninth'
  if (!isBs7) return 0
  if (leadRole === 3 || leadRole === 7) return w.seventh
  if (leadRole === 1 && c.layer === 'primary') return -w.seventh * 0.85
  if (leadRole === 1 || leadRole === 5) return -w.seventh * 0.35
  return w.seventh * 0.25
}

function homeTriadBias(c: UnscoredCandidate, w: RankingWeights, leadRole: number): number {
  if (c.layer !== 'primary') return 0
  if (c.natureId !== 'major' && c.natureId !== 'minor') return 0
  if (leadRole === 1 || leadRole === 5) return w.homeTriad
  return 0
}

function colorChordPenalty(c: UnscoredCandidate, w: RankingWeights, leadRole: number): number {
  if (
    c.natureId !== 'ninth' &&
    c.natureId !== 'sixth' &&
    c.natureId !== 'add9' &&
    c.natureId !== 'madd6'
  ) {
    return 0
  }
  // Lead is the color tone itself — allow Dom9 / 6 without the soft demotion.
  if (leadRole === 9 || leadRole === 6) return 0
  return w.colorChordPenalty
}

export function rankCandidates(
  candidates: readonly UnscoredCandidate[],
  deps: RankerDeps = {},
): HarmonizeCandidate[] {
  const w: RankingWeights = { ...DEFAULT_RANKING_WEIGHTS, ...deps.weights }
  const harm = deps.harmonicity === undefined ? createHarmonicityScorer() : deps.harmonicity
  const melodyVoice = deps.melodyVoice ?? 'lead'

  const scored: HarmonizeCandidate[] = candidates.map((c) => {
    const leadRole = leadRoleOf(c)
    let score = w.motion * c.motionScore
    if (c.layer === 'primary') score += w.primaryLayer
    else score -= w.passingSoftPenalty
    score += seventhBias(c, w, leadRole)
    score += homeTriadBias(c, w, leadRole)
    score -= colorChordPenalty(c, w, leadRole)
    if (!c.spread) score += w.closedVoicing
    score += w.ring * Math.max(0, 7 - ringTier(c.natureId))

    const tags = [...c.ruleTags] as RuleTag[]
    const isSecDom =
      c.nextPillarRoot != null &&
      (c.natureId === 'seventh' || c.natureId === 'ninth') &&
      (c.rootPc - c.nextPillarRoot + 12) % 12 === 7
    if (isSecDom) {
      // Full secondary-dominant bump only when the lead carries dominant color (3/7).
      // Root-position "I7 because next is IV" should not beat a plain I major home.
      if (leadRole === 3 || leadRole === 7) score += w.secondaryDominant
      else if (leadRole === 1) score += w.secondaryDominant * 0.12
      else score += w.secondaryDominant * 0.45
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

    let cadenceFitValue = 0
    if (deps.cadenceContext) {
      const cad = scoreCadenceFit(
        { rootPc: c.rootPc, natureId: c.natureId, layer: c.layer },
        {
          ...deps.cadenceContext,
          prevRootPc: deps.cadenceContext.prevRootPc ?? c.prevRootPc ?? null,
          nextPillarRoot: deps.cadenceContext.nextPillarRoot ?? c.nextPillarRoot,
        },
        { includeColor: true, bias: deps.cadenceBias },
      )
      cadenceFitValue = cad.boost
      score += w.cadenceFit * cadenceFitValue
    }

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
  const leadRole = leadRoleOf(c)
  const isSecDom =
    c.nextPillarRoot != null &&
    (c.natureId === 'seventh' || c.natureId === 'ninth') &&
    (c.rootPc - c.nextPillarRoot + 12) % 12 === 7
  let secDom = 0
  if (isSecDom) {
    if (leadRole === 3 || leadRole === 7) secDom = w.secondaryDominant
    else if (leadRole === 1) secDom = w.secondaryDominant * 0.12
    else secDom = w.secondaryDominant * 0.45
  }
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
  let cadenceFitValue = 0
  let cadenceTeach: string | undefined
  if (deps.cadenceContext) {
    const cad = scoreCadenceFit(
      { rootPc: c.rootPc, natureId: c.natureId, layer: c.layer },
      {
        ...deps.cadenceContext,
        prevRootPc: deps.cadenceContext.prevRootPc ?? c.prevRootPc ?? null,
        nextPillarRoot: deps.cadenceContext.nextPillarRoot ?? c.nextPillarRoot,
      },
      { includeColor: true, bias: deps.cadenceBias },
    )
    cadenceFitValue = cad.boost
    cadenceTeach = cad.hint?.teach
  }
  const parts: { label: string; value: number; teachingId?: string }[] = [
    { label: 'motion', value: w.motion * c.motionScore },
    { label: 'primary', value: c.layer === 'primary' ? w.primaryLayer : -w.passingSoftPenalty },
    { label: 'seventh', value: seventhBias(c, w, leadRole) },
    { label: 'homeTriad', value: homeTriadBias(c, w, leadRole) },
    { label: 'colorChord', value: -colorChordPenalty(c, w, leadRole) },
    { label: 'closed', value: !c.spread ? w.closedVoicing : 0 },
    { label: 'ring', value: w.ring * Math.max(0, 7 - ringTier(c.natureId)) },
    { label: 'secondaryDominant', value: secDom, teachingId: 'secondary_dom' },
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
      label: 'cadenceFit',
      value: w.cadenceFit * cadenceFitValue,
      teachingId: 'classic_cadences',
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
  // Attach teach sentence on the factor when present (UI may show as subtitle).
  if (cadenceTeach) {
    const cadPart = parts.find((p) => p.label === 'cadenceFit')
    if (cadPart && cadPart.value !== 0) {
      ;(cadPart as { label: string; value: number; teachingId?: string; detail?: string }).detail =
        cadenceTeach
    }
  }
  return parts.filter((p) => p.value !== 0)
}
