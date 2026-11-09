/**
 * Score-part breakdown for Why? and coach explanations.
 * The ranker that produces the order stays in candidateRanker.ts.
 */
import { ringTier } from '../contestProfile'
import { stackRingPrior } from '../harmonicity/stackRingScore'
import { theoryRankBonuses, voiceLeadScore } from '../theoryScores'
import { medianJumpRankPenalty } from '../medianJumpWindow'
import { scoreCadenceFit } from '../cadences'
import { degreeOf } from '../secondaryDominant'
import {
  hazardousLeapPenalty,
  postLeapDirectionPenalty,
  upperTrioCloseBias,
} from '../partWritingCosts'
import { DEFAULT_RANKING_WEIGHTS, type RankingWeights } from './rankingWeights'
import type { UnscoredCandidate } from './types'
import {
  colorChordPenalty,
  completeFourPartBias,
  diatonicFunctionBias,
  finalCompleteBias,
  homeTriadBias,
  leadRoleOf,
  rankingMode,
  registerHomeBias,
  sameChordAsPrev,
  seventhBias,
  songFinalHomeBias,
  strongVoiceScore,
  unforcedMinorPenalty,
  type RankerDeps,
} from './candidateRanker'

/** Expose score parts for Why? / coach explanations (UI render only). */
export function explainRankingBreakdown(
  c: UnscoredCandidate,
  deps: RankerDeps = {},
): { label: string; value: number; teachingId?: string }[] {
  const w: RankingWeights = { ...DEFAULT_RANKING_WEIGHTS, ...deps.weights }
  const melodyVoice = deps.melodyVoice ?? 'lead'
  const mode = rankingMode(deps)
  const leadRole = leadRoleOf(c)
  const isSecDom =
    c.nextPillarRoot != null &&
    (c.natureId === 'seventh' || c.natureId === 'ninth') &&
    (c.rootPc - c.nextPillarRoot + 12) % 12 === 7
  let secDom = 0
  if (isSecDom) {
    const ninthTax = c.natureId === 'ninth' && leadRole !== 9 ? 0.75 : 1
    const tonality = deps.cadenceContext?.tonality
    const deg = tonality == null ? null : degreeOf(c.rootPc, tonality)
    const circleHwy = deg === 2 || deg === 9
    if (leadRole === 3 || leadRole === 7) secDom = w.secondaryDominant * ninthTax
    else if (leadRole === 9 && c.natureId === 'ninth') secDom = w.secondaryDominant
    else if (leadRole === 1 && circleHwy) secDom = w.secondaryDominant * 0.7 * ninthTax
    else if (leadRole === 1) secDom = w.secondaryDominant * 0.12 * ninthTax
    else secDom = w.secondaryDominant * 0.45 * ninthTax
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
    { label: 'seventh', value: seventhBias(c, w, leadRole, deps) },
    { label: 'homeTriad', value: homeTriadBias(c, w, leadRole, mode, deps) },
    { label: 'completeFourPart', value: completeFourPartBias(c, w, deps) },
    { label: 'finalComplete', value: finalCompleteBias(c, w, deps) },
    { label: 'diatonicFunction', value: diatonicFunctionBias(c, w, deps) },
    { label: 'songFinalHome', value: songFinalHomeBias(c, w, deps) },
    { label: 'registerHome', value: registerHomeBias(c, w) },
    { label: 'colorChord', value: -colorChordPenalty(c, w, leadRole) },
    {
      label: 'unforcedMinor',
      value: -unforcedMinorPenalty(c, w, leadRole, mode),
    },
    {
      label: 'closed',
      value: !c.spread
        ? w.closedVoicing +
          (() => {
            const outer = c.midi.tenor - c.midi.bass
            if (outer <= 12) return w.closedVoicing * 0.7
            if (outer <= 16) return w.closedVoicing * 0.05
            if (outer <= 21) return -w.closedVoicing * 0.35
            return -w.closedVoicing * 0.55
          })()
        : 0,
    },
    {
      label: 'upperTrio',
      value: w.upperTrioClose * upperTrioCloseBias(c.midi),
      teachingId: 'close_open_voicing',
    },
    {
      label: 'hazardousLeap',
      value: -w.hazardousLeap * hazardousLeapPenalty(c.prevMidi, c.midi, { sameChord: sameChordAsPrev(c) }),
    },
    {
      label: 'postLeapDir',
      value:
        -w.postLeapDirection *
        postLeapDirectionPenalty(c.prevPrevMidi, c.prevMidi, c.midi, {
          sameChord: sameChordAsPrev(c),
        }),
    },
    { label: 'ring', value: w.ring * Math.max(0, 7 - ringTier(c.natureId)) },
    {
      label: 'stackRing',
      value: w.stackRing * stackRingPrior(c.natureId, c.voicing),
      teachingId: 'lock_ring',
    },
    { label: 'secondaryDominant', value: secDom, teachingId: 'secondary_dom' },
    {
      label: 'voiceLead',
      value: w.voiceLead * voiceLeadScore(c.prevMidi, c.midi, { melodyVoice }),
    },
    {
      label: 'medianJump',
      value: -w.voiceLead * medianJumpRankPenalty(c.prevPrevMidi, c.prevMidi, c.midi),
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
