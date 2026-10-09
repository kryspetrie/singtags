/**
 * Path score + reject gate: part-aware jumpiness, ring, unresolved dominants, lint.
 */
import { TTBB_BASS_MIN, TTBB_BASS_PREF_MIN, type VoicingPitches } from '../chords'
import { ringTier } from '../contestProfile'
import { lintArrangement } from '../qa'
import {
  isDominantNature,
  resolutionScore,
} from '../tensionRelease'
import type { ArrangementProject, ChordStack } from '../types'
import type { PathOptimizeWeights } from './types'
import { triadDoubleKind } from '../harmonize/candidateRanker'
import { ttbbPartsDistinct } from '../chords'
import {
  leapCapsForRisk,
  maxCriticalLeap,
  outlierJumpPenalty,
  pathJumpiness,
} from './partLeaps'
import {
  pathHazardousLeapCost,
  pathPostLeapDirectionCost,
  pathUpperTrioOpenCost,
} from '../partWritingCosts'

/**
 * Soft leap preference while building (semitones) — legacy alias for tenor-ish cap.
 * Prefer leapCapsForRisk + part-aware filters.
 */
export const ABS_MAX_HARMONY_LEAP = 9

export function stackMidiSeq(
  stacks: readonly ChordStack[],
): VoicingPitches[] {
  return [...stacks]
    .filter((s) => s.layer !== 'embellishment' && s.midi)
    .sort((a, b) => a.startTick - b.startTick || a.id.localeCompare(b.id))
    .map((s) => s.midi!)
}

/** Legacy equal-weight harmony motion (bari+tenor+bass). Prefer pathJumpiness. */
export function harmonyMotion(seq: readonly VoicingPitches[]): number {
  return pathJumpiness(seq)
}

/** Legacy max leap — now critical parts only (tenor + non-octave bass). */
export function maxHarmonyLeap(seq: readonly VoicingPitches[]): number {
  return maxCriticalLeap(seq)
}

export function errorLintCount(project: ArrangementProject): number {
  return lintArrangement(project).filter((l) => l.severity === 'error').length
}

/**
 * Mean ringing quality (higher = better), matching the ranker's
 * `7 - ringTier` polarity. `ringTier` itself is lower = more ringing.
 */
export function meanRing(stacks: readonly ChordStack[]): number {
  const usable = stacks.filter((s) => s.layer !== 'embellishment' && s.natureId !== 'unknown')
  if (!usable.length) return 0
  let sum = 0
  for (const s of usable) sum += Math.max(0, 7 - ringTier(s.natureId))
  return sum / usable.length
}

/** Soft path penalty when bass sits below the TTBB concert floor. */
export function muddyBassCost(stacks: readonly ChordStack[]): number {
  const usable = stacks.filter((s) => s.layer !== 'embellishment' && s.midi)
  if (!usable.length) return 0
  let sum = 0
  for (const s of usable) {
    const bass = s.midi!.bass
    if (bass < TTBB_BASS_MIN) sum += 8
    else if (bass < TTBB_BASS_PREF_MIN) sum += 2
  }
  return sum / usable.length
}

/**
 * Penalize BS7/9 that do not resolve into the next stack (3↑ / ♭7↓),
 * especially across a phrase gap (pickup / new phrase).
 */
export function unresolvedDominantCost(project: ArrangementProject): number {
  const stacks = [...project.stacks]
    .filter((s) => s.layer !== 'embellishment' && s.midi)
    .sort((a, b) => a.startTick - b.startTick || a.id.localeCompare(b.id))
  const tonic = ((project.tonality % 12) + 12) % 12
  let cost = 0
  for (let i = 0; i < stacks.length; i++) {
    const cur = stacks[i]!
    if (!isDominantNature(cur.natureId) || !cur.midi) continue
    // Tonic I7 / home Mm7 is a release sonority, not an unresolved dominant.
    if (((cur.rootPc % 12) + 12) % 12 === tonic) continue
    const next = stacks[i + 1]
    if (!next?.midi) {
      // Hanging V7 (etc.) as the chart's last chord — much worse than a mid-path miss.
      cost += i === stacks.length - 1 ? 28 : 5
      continue
    }
    const res = resolutionScore(
      { rootPc: cur.rootPc, natureId: cur.natureId, midi: cur.midi },
      next.midi,
    )
    const curEnd = cur.startTick + Math.max(1, cur.durationTicks || 1)
    const gap = next.startTick - curEnd
    if (res < 0.45) cost += 4
    else if (res < 0.7) cost += 1.5
    if (res < 0.65 && gap >= 240) cost += 5
    const rootDrop = (((cur.rootPc - next.rootPc) % 12) + 12) % 12
    if (res < 0.55 && rootDrop !== 7 && rootDrop !== 5 && rootDrop !== 0) {
      cost += 2
    }
  }
  return cost
}

/** Soft preference for simpler natures when risk is low (Basic). */
export function simplicityCost(
  stacks: readonly ChordStack[],
  risk: number,
): number {
  const usable = stacks.filter((s) => s.layer !== 'embellishment' && s.natureId !== 'unknown')
  if (!usable.length) return 0
  // Basic (risk→0) heavily penalizes high ring tiers; Risky ignores.
  const bias = Math.max(0, 1 - risk) * 2.2
  if (bias <= 0.05) return 0
  let sum = 0
  for (const s of usable) {
    const tier = ringTier(s.natureId)
    // major/seventh tier 1 → 0; aug/dim → higher
    sum += Math.max(0, tier - 1.2)
  }
  return (sum / usable.length) * bias
}

/**
 * Path cost for tonic finales. Rylander: ~99% end on a major triad with a
 * legal double (root preferred). I7 is allowed but slightly costly; doubled
 * major 3rds are expensive.
 */
export function incompleteFinalCost(project: ArrangementProject): number {
  const stacks = [...project.stacks]
    .filter((s) => s.layer !== 'embellishment' && s.midi && s.natureId !== 'unknown')
    .sort((a, b) => a.startTick - b.startTick || a.id.localeCompare(b.id))
  if (!stacks.length) return 0
  const last = stacks[stacks.length - 1]!
  const tonic = ((project.tonality % 12) + 12) % 12
  if (((last.rootPc % 12) + 12) % 12 !== tonic) return 0
  const kind = triadDoubleKind(last.midi!, last.rootPc, last.natureId)
  if (last.natureId === 'major' || last.natureId === 'minor') {
    if (kind === 'root') return 0
    if (kind === 'fifth') return 1.5
    if (kind === 'third' && last.natureId === 'minor') return 1.2
    if (kind === 'third') return 8
    return 5
  }
  // Complete I7 / i7 close — legal, but manuals prefer the triad ending.
  // Keep this clearly above typical VL gains from staying on a BS7 shell.
  if (kind === 'complete' && (last.natureId === 'seventh' || last.natureId === 'm7')) return 9
  // Incomplete tetrad / thin Dom9, etc.
  return 12
}

/**
 * Soft path penalty for 3-PC (doubled) stacks. Manuals: double the root on
 * major triads; doubled major 3rds are strongly discouraged.
 * Root doubles are the legal home — do not let this cost push Basic onto I7.
 */
export function incompleteVoicingCost(
  stacks: readonly ChordStack[],
  risk = 0.2,
): number {
  const usable = stacks.filter((s) => s.layer !== 'embellishment' && s.midi && s.natureId !== 'unknown')
  if (!usable.length) return 0
  const basic = Math.max(0, 1 - risk)
  let sum = 0
  for (const s of usable) {
    const kind = triadDoubleKind(s.midi!, s.rootPc, s.natureId)
    if (kind === 'complete') continue
    if (kind === 'root') sum += 0.25 + (1 - basic) * 1.0
    else if (kind === 'fifth') sum += 2.8
    else if (kind === 'third' && (s.natureId === 'minor' || s.natureId === 'm7' || s.natureId === 'madd6')) {
      sum += 1.8
    } else if (kind === 'third') sum += 6.5
    else sum += 5.5
  }
  return sum / usable.length
}

/**
 * Penalize upward register ratchet vs the path’s opening stack (inversion climb).
 * Basic paths should ease back toward the opening bass/tenor band.
 */
export function registerDriftCost(stacks: readonly ChordStack[]): number {
  const usable = stacks
    .filter((s) => s.layer !== 'embellishment' && s.midi && s.natureId !== 'unknown')
    .sort((a, b) => a.startTick - b.startTick || a.id.localeCompare(b.id))
  if (usable.length < 2) return 0
  const b0 = usable[0]!.midi!.bass
  const t0 = usable[0]!.midi!.tenor
  let sum = 0
  for (const s of usable) {
    const bass = s.midi!.bass
    const tenor = s.midi!.tenor
    sum += Math.max(0, bass - b0 - 2) * 0.55
    sum += Math.max(0, tenor - t0 - 2) * 0.7
  }
  return sum / usable.length
}

/** Hard path cost for stacks that still contain part unisons. */
export function unisonVoicingCost(stacks: readonly ChordStack[]): number {
  const usable = stacks.filter((s) => s.layer !== 'embellishment' && s.midi && s.natureId !== 'unknown')
  if (!usable.length) return 0
  let bad = 0
  for (const s of usable) {
    if (!ttbbPartsDistinct(s.midi!)) bad += 1
  }
  return (bad / usable.length) * 10
}

/**
 * Penalize endings that are not tonic home (hanging V7 / ii7 / random roots).
 * Complements unresolvedDominantCost with a root-function check.
 */
export function nonTonicFinalCost(project: ArrangementProject): number {
  const stacks = [...project.stacks]
    .filter((s) => s.layer !== 'embellishment' && s.midi && s.natureId !== 'unknown')
    .sort((a, b) => a.startTick - b.startTick || a.id.localeCompare(b.id))
  if (!stacks.length) return 0
  const last = stacks[stacks.length - 1]!
  const tonic = ((project.tonality % 12) + 12) % 12
  if (((last.rootPc % 12) + 12) % 12 === tonic) return 0
  if (isDominantNature(last.natureId)) return 22
  return 14
}

/** Higher is better. Weights blend VL (low jumpiness) with ring + Basic simplicity. */
export function scorePath(
  project: ArrangementProject,
  weights: PathOptimizeWeights,
): number {
  const seq = stackMidiSeq(project.stacks)
  const jump = pathJumpiness(seq)
  const leap = maxCriticalLeap(seq)
  const outlier = outlierJumpPenalty(seq)
  const ring = meanRing(project.stacks)
  const errors = errorLintCount(project)
  const unresolved = unresolvedDominantCost(project)
  const simple = simplicityCost(project.stacks, weights.risk ?? 0.2)
  const muddy = muddyBassCost(project.stacks)
  const incompleteFinal = incompleteFinalCost(project)
  const nonTonicFinal = nonTonicFinalCost(project)
  const incompleteVoicing = incompleteVoicingCost(project.stacks, weights.risk ?? 0.2)
  const registerDrift = registerDriftCost(project.stacks)
  const unisonVoicing = unisonVoicingCost(project.stacks)
  const stacks = [...project.stacks]
    .filter((s) => s.layer !== 'embellishment' && s.midi && s.natureId !== 'unknown')
    .sort((a, b) => a.startTick - b.startTick || a.id.localeCompare(b.id))
  const sameChordAt = (i: number) => {
    const a = stacks[i - 1]
    const b = stacks[i]
    return !!a && !!b && a.rootPc === b.rootPc && a.natureId === b.natureId
  }
  const upperTrioOpen = pathUpperTrioOpenCost(seq)
  const hazardousLeaps = pathHazardousLeapCost(seq, sameChordAt)
  const postLeapDir = pathPostLeapDirectionCost(seq, sameChordAt)
  // Jumpiness: tenor/bass-weighted motion + outlier leaps + critical max leap.
  const vl = Math.max(0, 40 - jump * 0.35 - leap * 2.8 - outlier * 0.45)
  // meanRing is already "higher = better" (aligned with ranker).
  const ringPart = ring * 2
  const basic = Math.max(0, 1 - (weights.risk ?? 0.2))
  const issue =
    (errors * 8 +
      unresolved * 1.2 +
      simple +
      muddy * 1.4 +
      incompleteFinal +
      nonTonicFinal +
      incompleteVoicing +
      registerDrift * (1.2 + basic * 1.8) +
      unisonVoicing * 2 +
      upperTrioOpen * (1.0 + basic * 1.5) +
      hazardousLeaps * (0.9 + basic * 1.1) +
      postLeapDir * (1.0 + basic * 1.3)) *
    weights.issuePenalty
  return weights.voiceLeading * vl + weights.ring * ringPart - issue
}

export type RejectGateResult =
  | { ok: true }
  | { ok: false; reason: string }

export type RejectGateOpts = {
  /** Explore / Run again — allow more motion slack so alternates can apply. */
  explore?: boolean
  risk?: number
  /** Skip all reject checks; apply even if the path worsens. */
  allowWorsen?: boolean
}

/**
 * Reject only clear regressions vs baseline (or catastrophic new leaps on empty→fill).
 * Critical leaps = tenor + non-octave bass (bari ignored for the hard gate).
 */
export function rejectGate(
  before: ArrangementProject,
  after: ArrangementProject,
  opts: RejectGateOpts = {},
): RejectGateResult {
  if (opts.allowWorsen) return { ok: true }

  const beforeSeq = stackMidiSeq(before.stacks)
  const afterSeq = stackMidiSeq(after.stacks)
  if (afterSeq.length < 2) return { ok: true }

  const risk = opts.risk ?? 0.2
  const caps = leapCapsForRisk(risk)
  const afterLeap = maxCriticalLeap(afterSeq)
  const beforeLeap = beforeSeq.length >= 2 ? maxCriticalLeap(beforeSeq) : 0
  const explore = !!opts.explore

  if (beforeSeq.length < 2) {
    // Empty → filled: only block truly catastrophic tenor / non-octave bass leaps.
    // First-pass register placement often needs a larger single step.
    if (afterLeap > Math.max(14, caps.tenor + 6)) {
      return {
        ok: false,
        reason: `Tenor/bass leap of ${afterLeap} semitones is too large for a new path`,
      }
    }
    return { ok: true }
  }

  const leapCeiling =
    Math.max(beforeLeap, caps.tenor) + (explore ? Math.max(4, Math.round(risk * 4)) : 1)
  if (afterLeap > leapCeiling) {
    return {
      ok: false,
      reason: `Tenor/bass leaps would worsen (${afterLeap} > ${leapCeiling})`,
    }
  }

  const beforeJump = pathJumpiness(beforeSeq)
  const afterJump = pathJumpiness(afterSeq)
  // Explore needs headroom vs smooth Basic baselines (closed + bass floor).
  const motionSlack = explore
    ? Math.max(42, beforeJump * 0.9 + 16)
    : Math.max(6, beforeJump * 0.15)
  if (afterJump > beforeJump + motionSlack) {
    return {
      ok: false,
      reason: 'Tenor/bass jumpiness would worsen sharply',
    }
  }

  const beforeOut = outlierJumpPenalty(beforeSeq)
  const afterOut = outlierJumpPenalty(afterSeq)
  if (!explore && afterOut > beforeOut + 10) {
    return {
      ok: false,
      reason: 'A sudden tenor/bass jump would stick out of an otherwise smooth path',
    }
  }

  const beforeErr = errorLintCount(before)
  const afterErr = errorLintCount(after)
  if (afterErr > beforeErr) {
    return { ok: false, reason: 'Error lint count would rise' }
  }

  return { ok: true }
}
