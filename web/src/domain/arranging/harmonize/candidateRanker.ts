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
import { degreeOf } from '../secondaryDominant'
import {
  hazardousLeapPenalty,
  postLeapDirectionPenalty,
  upperTrioCloseBias,
} from '../partWritingCosts'
import { DEFAULT_RANKING_WEIGHTS, type RankingWeights } from './rankingWeights'
import type { HarmonizeCandidate, UnscoredCandidate } from './types'
import type { RuleTag } from '../types'
import type { VoicingPitches } from '../chords'

function sameChordAsPrev(c: UnscoredCandidate): boolean {
  return (
    c.prevRootPc != null &&
    c.prevNatureId != null &&
    c.prevRootPc === c.rootPc &&
    c.prevNatureId === c.natureId
  )
}

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

function isFinalTonicArrival(c: UnscoredCandidate, deps: RankerDeps): boolean {
  const role = deps.cadenceContext?.phraseRole
  if (role !== 'cadence' && role !== 'tag') return false
  const tonality = deps.cadenceContext?.tonality
  if (tonality == null) return !!c.towardPillar
  return ((c.rootPc % 12) + 12) % 12 === ((tonality % 12) + 12) % 12
}

/** Last onset of the phrase/song — no following melody to resolve into. */
function isTrueSongFinal(deps: RankerDeps): boolean {
  const ctx = deps.cadenceContext
  if (!ctx) return false
  const role = ctx.phraseRole
  if (role !== 'cadence' && role !== 'tag') return false
  return ctx.nextMelodyMidi == null && ctx.nextPillarRoot == null
}

/**
 * Classical diatonic gravity (same shape as Detected `functionWeight`).
 * Major: I > V > IV > vi > ii > iii … with V7/ii7 preferred over bare exotic roots.
 */
function diatonicFunctionBias(
  c: UnscoredCandidate,
  w: RankingWeights,
  deps: RankerDeps,
): number {
  if (w.diatonicFunction <= 0) return 0
  const tonality = deps.cadenceContext?.tonality
  if (tonality == null) return 0
  const mode = rankingMode(deps)
  const deg = degreeOf(c.rootPc, tonality)
  const leadRole = leadRoleOf(c)
  let fw = 1
  if (mode === 'minor') {
    if (deg === 0) fw = 10
    else if (deg === 7) fw = 9
    else if (deg === 5) fw = 8
    else if (deg === 8) fw = 6
    else if (deg === 3) fw = 5
    else if (deg === 10) fw = 4
    else if (deg === 2) fw = 2
    else fw = 1
  } else {
    if (deg === 0) fw = 10
    else if (deg === 7) fw = 9
    else if (deg === 5) fw = 8
    else if (deg === 9) fw = 6
    else if (deg === 2) fw = 5
    else if (deg === 4) fw = 4
    else if (deg === 11) fw = 3.5
    else fw = 1
  }
  // Prefer the textbook natures on those degrees (I major, V7, ii7, …).
  let natureFit = 0.55
  if (deg === 0) {
    if (mode === 'minor') {
      // i / i7 — Mm7 on tonic is not a minor-key home.
      natureFit =
        c.natureId === 'minor' || c.natureId === 'm7'
          ? 1
          : c.natureId === 'seventh'
            ? 0.25
            : 0.45
    } else if (c.natureId === 'major') {
      natureFit = 1
    } else if (c.natureId === 'seventh') {
      // I7 when Lead carries 3/♭7; otherwise prefer plain I (polecat pillars).
      natureFit = leadRole === 3 || leadRole === 7 ? 1 : 0.55
    } else if (c.natureId === 'sixth') {
      // I6 when Lead is the 6th (Honey / Dream); else soft color.
      natureFit = leadRole === 6 ? 1 : 0.35
    }
  } else if (deg === 7) {
    // V7 is the highway; bare V major is a hymn substitute.
    // Dom9 stays legal (Flinn Lead-on-5-of-G9); slight soft prefer plain V7.
    natureFit =
      c.natureId === 'seventh'
        ? 1
        : c.natureId === 'ninth'
          ? leadRole === 9
            ? 1
            : 0.85
          : c.natureId === 'major'
            ? 0.45
            : 0.35
  } else if (deg === 5) {
    if (c.natureId === 'major' || c.natureId === 'seventh') natureFit = 0.95
    else if (c.natureId === 'sixth') natureFit = leadRole === 6 ? 1 : 0.35
  } else if (deg === 2) {
    // ii / ii7 diatonic, or II7 (= V7/V) circle highway — both are polecat staples.
    // Prefer II7 over II7(9) for sequence tokens (polecat gold uses Mm7).
    if (c.natureId === 'm7' || c.natureId === 'minor') natureFit = 1
    else if (c.natureId === 'seventh') natureFit = 1
    else if (c.natureId === 'ninth') natureFit = leadRole === 9 ? 0.9 : 0.3
    else if (c.natureId === 'major') natureFit = 0.55
  } else if (deg === 9) {
    // VI7 (= V7/ii) circle color vs diatonic vi/vi7 — polecat gold often uses VI7.
    if (c.natureId === 'seventh' || c.natureId === 'ninth') natureFit = 1
    else if (c.natureId === 'minor' || c.natureId === 'm7') natureFit = 0.75
  } else if (deg === 4) {
    // Mediant: Lead-on-7 → III7 (Honey); else iii triad (Irish Rose).
    if (c.natureId === 'seventh') natureFit = leadRole === 7 ? 1 : 0.5
    else if (c.natureId === 'minor') natureFit = leadRole === 7 ? 0.55 : 1
    else if (c.natureId === 'm7') natureFit = leadRole === 7 ? 1 : 0.55
  } else if (deg === 11) {
    // VII7 (Mm7 on leading tone) vs vii°/vii7 — polecat Irish Rose uses VII7.
    if (c.natureId === 'seventh' || c.natureId === 'ninth') natureFit = 1
    else if (c.natureId === 'm7' || c.natureId === 'minor') natureFit = 0.45
  }
  // Soft bump when Lead is a clear chord tone of that function.
  const roleFit =
    leadRole === 1 || leadRole === 3 || leadRole === 5 || leadRole === 7 || leadRole === 9
      ? 1
      : 0.7
  // Non-diatonic / weak degrees get pulled down hard (chromatic roots → fw=1).
  // When centered < 0, higher natureFit must *lessen* the demotion (else preferred
  // iii/VII7 natures were punished harder than the exotic alternatives).
  const centered = fw - 5.5
  const natureScale = centered >= 0 ? natureFit : 2 - natureFit
  return w.diatonicFunction * centered * natureScale * roleFit * 0.35
}

/**
 * True final: must be tonic home. Hanging V7 / ii7 / random roots lose badly.
 * Rylander: ~99% end on a major triad — prefer I/i unless Lead forces ♭7.
 */
function songFinalHomeBias(
  c: UnscoredCandidate,
  w: RankingWeights,
  deps: RankerDeps,
): number {
  if (w.songFinalHome <= 0 || !isTrueSongFinal(deps)) return 0
  const tonality = deps.cadenceContext?.tonality
  if (tonality == null) return 0
  const tonic = ((tonality % 12) + 12) % 12
  const root = ((c.rootPc % 12) + 12) % 12
  const leadRole = leadRoleOf(c)
  const mode = rankingMode(deps)
  if (root === tonic) {
    if (leadRole === 7) {
      // Melody on ♭7 forces I7 / i7.
      if (mode === 'minor') {
        return c.natureId === 'm7' ? w.songFinalHome : w.songFinalHome * 0.35
      }
      return c.natureId === 'seventh' ? w.songFinalHome : w.songFinalHome * 0.35
    }
    if (mode === 'minor') {
      if (c.natureId === 'minor') return w.songFinalHome
      if (c.natureId === 'm7') return w.songFinalHome * 0.4
      return w.songFinalHome * 0.25
    }
    if (c.natureId === 'major') return w.songFinalHome
    if (c.natureId === 'seventh') return w.songFinalHome * 0.4
    // Unforced i / i7 under a major tonic close — not a legal home.
    if (c.natureId === 'minor' || c.natureId === 'm7') return -w.songFinalHome * 0.55
    return w.songFinalHome * 0.15
  }
  // Non-tonic ending — especially hanging dominants — are junk for a close.
  const deg = degreeOf(c.rootPc, tonality)
  if (deg === 7 && (c.natureId === 'seventh' || c.natureId === 'ninth' || c.natureId === 'major')) {
    return -w.songFinalHome * 1.8
  }
  if (deg === 2) return -w.songFinalHome * 1.2
  return -w.songFinalHome * 1.4
}

type DoublingInfo = {
  distinctPcs: number
  /** A harmony voice shares the Lead’s pitch class. */
  doublesLead: boolean
  /** Some non-lead pitch class is doubled (bari/bass/tenor among themselves). */
  doubledNonLead: boolean
  /** Pitch classes that appear more than once (empty when complete 4-part). */
  doubledPcs: number[]
}

/** Which chord-tone role is doubled in a 3-PC stack (manuals: prefer root). */
export type TriadDoubleKind = 'complete' | 'root' | 'fifth' | 'third' | 'other'

/** Analyze TTBB pitch-class doubling (Lead is index 2 in bass/bari/lead/tenor). */
export function voicingDoublingInfo(midi: {
  bass: number
  bari: number
  lead: number
  tenor: number
}): DoublingInfo {
  const pcs = [midi.bass, midi.bari, midi.lead, midi.tenor].map(
    (m) => ((m % 12) + 12) % 12,
  )
  const leadPc = pcs[2]!
  const distinct = new Set(pcs)
  if (distinct.size >= 4) {
    return { distinctPcs: 4, doublesLead: false, doubledNonLead: false, doubledPcs: [] }
  }
  const counts = new Map<number, number>()
  for (const pc of pcs) counts.set(pc, (counts.get(pc) ?? 0) + 1)
  let doublesLead = false
  let doubledNonLead = false
  const doubledPcs: number[] = []
  for (const [pc, n] of counts) {
    if (n < 2) continue
    doubledPcs.push(pc)
    if (pc === leadPc) doublesLead = true
    else doubledNonLead = true
  }
  return { distinctPcs: distinct.size, doublesLead, doubledNonLead, doubledPcs }
}

function thirdOffsetForNature(natureId: string): number {
  if (
    natureId === 'minor' ||
    natureId === 'm7' ||
    natureId === 'madd6' ||
    natureId === 'dim' ||
    natureId === 'dim7' ||
    natureId === 'half-dim'
  ) {
    return 3
  }
  return 4
}

function fifthOffsetForNature(natureId: string): number {
  if (natureId === 'aug') return 8
  if (natureId === 'dim' || natureId === 'dim7' || natureId === 'half-dim') return 6
  return 7
}

/** Classify the doubled tone of a triad voicing (Flinn/BAM/Prietto/Rylander). */
export function triadDoubleKind(
  midi: { bass: number; bari: number; lead: number; tenor: number },
  rootPc: number,
  natureId: string,
): TriadDoubleKind {
  const info = voicingDoublingInfo(midi)
  if (info.distinctPcs >= 4) return 'complete'
  const root = ((rootPc % 12) + 12) % 12
  const third = (root + thirdOffsetForNature(natureId)) % 12
  const fifth = (root + fifthOffsetForNature(natureId)) % 12
  // Prefer the most "structural" label if multiple doubles.
  if (info.doubledPcs.includes(root)) return 'root'
  if (info.doubledPcs.includes(fifth)) return 'fifth'
  if (info.doubledPcs.includes(third)) return 'third'
  return 'other'
}

/**
 * Prefer true 4-part (4 distinct PCs). When a triad must double, prefer the
 * root (manuals); demote doubled major 3rds hard (Rylander “ugly”).
 * Optional Mm7 with Lead on 1/5 does not get a full 4-PC bonus — otherwise it
 * steals every tonic/IV home from a legal root-doubled triad.
 */
function completeFourPartBias(
  c: UnscoredCandidate,
  w: RankingWeights,
  deps: RankerDeps = {},
): number {
  if (w.completeFourPart <= 0) return 0
  const kind = triadDoubleKind(c.midi, c.rootPc, c.natureId)
  if (kind === 'complete') {
    const leadRole = leadRoleOf(c)
    if (
      (c.natureId === 'seventh' || c.natureId === 'ninth') &&
      (leadRole === 1 || leadRole === 5) &&
      c.layer === 'primary'
    ) {
      // I7/IV7 with Lead on 1/5: no 4-PC reward (else they outrun root-doubled
      // major homes). V7 keeps the full complete bonus — Lead often sits on V's root.
      const tonality = deps.cadenceContext?.tonality
      if (tonality == null) return 0
      const deg = degreeOf(c.rootPc, tonality)
      if (deg === 0 || deg === 5) return 0
    }
    return w.completeFourPart
  }
  const isMinorFamily =
    c.natureId === 'minor' || c.natureId === 'm7' || c.natureId === 'madd6'
  // Major root doubles are the legal home (Flinn/BAM/Prietto) — small reward so
  // registerHome/closed on a tight fifth-double cannot erase the preference
  // when the root-double shell is a wider (span ~24) Lead-on-3 voicing.
  // Minor: keep a soft cost so mid-phrase i7 (4-PC) can still win over i.
  if (kind === 'root') {
    return isMinorFamily ? -w.completeFourPart * 0.15 : w.completeFourPart * 0.35
  }
  if (isMinorFamily && kind === 'third') return -w.completeFourPart * 0.4
  if (kind === 'fifth') return -w.completeFourPart * 1.25
  if (kind === 'third') return -w.completeFourPart * 1.65
  return -w.completeFourPart * 1.4
}

/**
 * Cadence/tag tonic: Rylander ~99% major endings — prefer I/i with a legal
 * double unless Lead is on ♭7 (forces I7 / i7).
 */
function finalCompleteBias(
  c: UnscoredCandidate,
  w: RankingWeights,
  deps: RankerDeps,
): number {
  if (w.finalComplete <= 0 || !isFinalTonicArrival(c, deps)) return 0
  const leadRole = leadRoleOf(c)
  const mode = rankingMode(deps)
  const kind = triadDoubleKind(c.midi, c.rootPc, c.natureId)
  let score = 0

  if (leadRole === 7) {
    // Melody forces the seventh tone — prefer complete I7 / i7.
    if (mode === 'minor') {
      if (c.natureId === 'm7') score += w.finalComplete
      else if (c.natureId === 'minor') score -= w.finalComplete * 0.7
    } else if (c.natureId === 'seventh') {
      score += w.finalComplete
    } else if (c.natureId === 'major') {
      score -= w.finalComplete * 0.7
    }
    if (kind === 'complete') score += w.finalComplete * 0.5
    else score -= w.finalComplete * 0.6
    return score
  }

  // Lead on 1 / 3 / 5 (or color): prefer plain tonic triad home.
  if (mode === 'minor') {
    if (c.natureId === 'minor') score += w.finalComplete
    else if (c.natureId === 'm7') score -= w.finalComplete * 0.85
  } else if (c.natureId === 'major') {
    score += w.finalComplete
  } else if (c.natureId === 'seventh') {
    score -= w.finalComplete * 0.9
  }

  if (kind === 'root') score += w.finalComplete * 0.35
  else if (kind === 'complete' && (c.natureId === 'seventh' || c.natureId === 'm7')) {
    // Complete I7 is legal but not the preferred close when Lead isn't on ♭7.
    score -= w.finalComplete * 0.15
  } else if (kind === 'third' && c.natureId === 'major') {
    score -= w.finalComplete * 0.9
  } else if (kind === 'fifth') {
    score += w.finalComplete * 0.1
  }
  return score
}

/**
 * BS7 color when the lead is 3 or 7; avoid automatic I7/IV7 when the lead is the root.
 * At cadence/tag tonic, demote I7 unless Lead is on ♭7 (Rylander major endings).
 */
function seventhBias(
  c: UnscoredCandidate,
  w: RankingWeights,
  leadRole: number,
  deps: RankerDeps = {},
): number {
  const isBs7 = c.natureId === 'seventh' || c.natureId === 'ninth'
  if (!isBs7) return 0
  if (isFinalTonicArrival(c, deps)) {
    if (leadRole === 7) return w.seventh * 1.15
    // Root/3rd/5th at a tonic close → prefer major triad, not I7.
    return -w.seventh * 0.85
  }
  // Flinn: Dom9 when Lead is the 9th (voicing role 9) — full BS7 bump.
  // Lead often sits on 5 of a Dom9 shell (corpus D under G9); don't treat that as unforced color here.
  if (leadRole === 9 && c.natureId === 'ninth') return w.seventh * 1.05
  if (leadRole === 3 || leadRole === 7) return w.seventh
  // Demote I7/IV7 when Lead is on 1/5 — not V7 (Lead often sings V's root).
  const tonality = deps.cadenceContext?.tonality
  const deg = tonality == null ? null : degreeOf(c.rootPc, tonality)
  const homeSeventh = deg === 0 || deg === 5
  if (homeSeventh && leadRole === 1 && c.layer === 'primary') return -w.seventh * 0.85
  if (homeSeventh && (leadRole === 1 || leadRole === 5)) return -w.seventh * 0.45
  if (leadRole === 1 || leadRole === 5) return w.seventh * 0.2
  return w.seventh * 0.25
}

function rankingMode(deps: RankerDeps): 'major' | 'minor' {
  return deps.cadenceContext?.mode === 'minor' ? 'minor' : 'major'
}

function homeTriadBias(
  c: UnscoredCandidate,
  w: RankingWeights,
  leadRole: number,
  mode: 'major' | 'minor',
  deps: RankerDeps = {},
): number {
  if (c.layer !== 'primary') return 0
  const finalTonic = isFinalTonicArrival(c, deps)
  // At finals Lead-on-♭7 skips triad home (I7 wins via finalComplete).
  if (finalTonic && leadRole === 7) return 0
  if (leadRole !== 1 && leadRole !== 5 && !(finalTonic && leadRole === 3)) return 0
  // Home-triad gravity is for I (and plagal IV) — not V major under a V pillar
  // (corpus: V7→I highway; bare V triad reads as hymn, not barbershop).
  const tonality = deps.cadenceContext?.tonality
  if (tonality != null) {
    const deg = degreeOf(c.rootPc, tonality)
    if (deg === 7) return 0
    if (deg !== 0 && deg !== 5 && !finalTonic) return 0
  }
  const scale = finalTonic ? 1.35 : 0.65
  if (mode === 'major') return c.natureId === 'major' ? w.homeTriad * scale : 0
  // Minor: mid-phrase may prefer i7 (4-PC); finals prefer i triad.
  if (finalTonic) {
    if (c.natureId === 'minor') return w.homeTriad * scale
    if (c.natureId === 'm7') return w.homeTriad * 0.25
    return 0
  }
  if (c.natureId === 'm7') return w.homeTriad * 0.95
  if (c.natureId === 'minor') return w.homeTriad * 0.55
  return 0
}

/**
 * Prefer a stable mid register and resist upward ratchet vs prevMidi.
 * Octave doubles are fine; this does not re-check unisons (generator rejects those).
 */
function registerHomeBias(c: UnscoredCandidate, w: RankingWeights): number {
  if (w.registerHome <= 0) return 0
  const { bass, bari, lead, tenor } = c.midi
  let score = 0
  const outer = tenor - bass
  // Comfort bass band (concert): about A2–G3 — but not by divorcing the stack.
  // Mid-register V7 variants (span 21) must not outrank close shells on bass alone.
  if (bass >= 45 && bass <= 55 && outer <= 16) score += 1.1
  else if (bass >= 45 && bass <= 55) score += 0.15
  else if (bass > 55 && bass <= 62 && outer <= 12) score -= (bass - 55) * 0.05
  else if (bass > 55) score -= (bass - 55) * 0.18
  else if (bass < 45) score -= (45 - bass) * 0.12
  // Prefer bass on chord root or 5th (Prietto/BAM) — inferred from voicing string.
  const bassRole = Number(c.voicing[0])
  if (bassRole === 1) score += 0.55
  else if (bassRole === 5) score += 0.35
  else if (bassRole === 3 || bassRole === 7) score -= 0.25
  // Prefer bari below or near lead (not parked high against tenor).
  if (bari < lead) score += 0.45
  else if (bari > lead + 5) score -= 0.35
  // Tenor close above lead.
  const tenorGap = tenor - lead
  if (tenorGap <= 7) score += 0.55
  else if (tenorGap > 12) score -= 0.9
  if (c.prevMidi) {
    const bassUp = bass - c.prevMidi.bass
    const tenorUp = tenor - c.prevMidi.tenor
    const bariUp = bari - c.prevMidi.bari
    if (bassUp > 2) score -= bassUp * 0.22
    if (tenorUp > 2) score -= tenorUp * 0.28
    if (bariUp > 5) score -= (bariUp - 5) * 0.12
    // Reward easing back down after a climb.
    if (bassUp < -1 && c.prevMidi.bass > 55) score += 0.4
    if (tenorUp < -1 && c.prevMidi.tenor > lead + 8) score += 0.35
  }
  return w.registerHome * score
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

/** Minor family without Lead on ♭3 — demote in major keys. */
function unforcedMinorPenalty(
  c: UnscoredCandidate,
  w: RankingWeights,
  leadRole: number,
  mode: 'major' | 'minor',
): number {
  if (mode !== 'major') return 0
  if (c.natureId !== 'minor' && c.natureId !== 'm7' && c.natureId !== 'madd6') return 0
  // Lead singing the ♭3 forces the minor color.
  if (leadRole === 3) return 0
  return w.unforcedMinorPenalty
}

export function rankCandidates(
  candidates: readonly UnscoredCandidate[],
  deps: RankerDeps = {},
): HarmonizeCandidate[] {
  const w: RankingWeights = { ...DEFAULT_RANKING_WEIGHTS, ...deps.weights }
  const harm = deps.harmonicity === undefined ? createHarmonicityScorer() : deps.harmonicity
  const melodyVoice = deps.melodyVoice ?? 'lead'

  const mode = rankingMode(deps)
  const scored: HarmonizeCandidate[] = candidates.map((c) => {
    const leadRole = leadRoleOf(c)
    let score = w.motion * c.motionScore
    if (c.layer === 'primary') score += w.primaryLayer
    else score -= w.passingSoftPenalty
    score += seventhBias(c, w, leadRole, deps)
    score += homeTriadBias(c, w, leadRole, mode, deps)
    score += completeFourPartBias(c, w, deps)
    score += finalCompleteBias(c, w, deps)
    score += diatonicFunctionBias(c, w, deps)
    score += songFinalHomeBias(c, w, deps)
    score += registerHomeBias(c, w)
    score -= colorChordPenalty(c, w, leadRole)
    score -= unforcedMinorPenalty(c, w, leadRole, mode)
    if (!c.spread) {
      score += w.closedVoicing
      // Soft prefer octave-or-tighter shells; allow 10th–12th triad homes without
      // equating them to divorced open stacks (hard cap is TTBB_CLOSE_SPAN_MAX).
      const outer = c.midi.tenor - c.midi.bass
      // Hard cap allows ≤21 so mid-register V7 can place; still strongly prefer
      // octave-or-tighter shells when both exist (Bonnie F7 5713 over span-21).
      if (outer <= 12) score += w.closedVoicing * 0.7
      else if (outer <= 16) score += w.closedVoicing * 0.05
      else if (outer <= 21) score -= w.closedVoicing * 0.35
      else score -= w.closedVoicing * 0.55
    }
    // Ades: close = upper three within an octave (independent of bass–tenor span).
    score += w.upperTrioClose * upperTrioCloseBias(c.midi)
    const sameChord = sameChordAsPrev(c)
    score -= w.hazardousLeap * hazardousLeapPenalty(c.prevMidi, c.midi, { sameChord })
    score -=
      w.postLeapDirection *
      postLeapDirectionPenalty(c.prevPrevMidi, c.prevMidi, c.midi, { sameChord })
    score += w.ring * Math.max(0, 7 - ringTier(c.natureId))

    const tags = [...c.ruleTags] as RuleTag[]
    const isSecDom =
      c.nextPillarRoot != null &&
      (c.natureId === 'seventh' || c.natureId === 'ninth') &&
      (c.rootPc - c.nextPillarRoot + 12) % 12 === 7
    if (isSecDom) {
      // Full secondary-dominant bump only when the lead carries dominant color (3/7).
      // Root-position "I7 because next is IV" should not beat a plain I major home.
      // Soft-prefer Mm7 over Dom9 for highway tokens unless Lead is literally the 9th.
      // Exception: II7 / VI7 circle with Lead on the root is still the polecat highway
      // (Lead often sings ^2 under II7 or ^6 under VI7).
      const ninthTax = c.natureId === 'ninth' && leadRole !== 9 ? 0.75 : 1
      const tonality = deps.cadenceContext?.tonality
      const deg = tonality == null ? null : degreeOf(c.rootPc, tonality)
      const circleHwy = deg === 2 || deg === 9
      if (leadRole === 3 || leadRole === 7) score += w.secondaryDominant * ninthTax
      else if (leadRole === 9 && c.natureId === 'ninth') score += w.secondaryDominant
      else if (leadRole === 1 && circleHwy) score += w.secondaryDominant * 0.7 * ninthTax
      else if (leadRole === 1) score += w.secondaryDominant * 0.12 * ninthTax
      else score += w.secondaryDominant * 0.45 * ninthTax
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
