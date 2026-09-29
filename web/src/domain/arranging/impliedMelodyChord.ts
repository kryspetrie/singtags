/**
 * Key-based implied chords for bare melody notes (no TBB sounding).
 * Heuristic only — not an Apply/Coach commitment.
 * Prefers clear diatonic homes (I/IV/V major, etc.); light BS7 color when the
 * melody sits on 3 or 7 — not full Coach SCF/passing catalogs.
 * Classic cadences come from domain/cadences (shared with Coach).
 * Interest levels (Basic / Mild / Bold) re-rank Detected without writing Sketch.
 */
import { BARBERSHOP_CHORDS, chordContainsLead, leadRoleInChord, type ChordToneRole } from './chords/chords'
import {
  phraseRoleAtMelodyIndex,
  scoreCadenceFit,
  type CadenceBias,
  type CadenceContext,
  type CadenceHint,
  type PhraseRole,
} from './cadences'
import { diatonicChords } from './keyChangeShared'
import { degreeOf } from './secondaryDominant'
import type { ChordStack, TonalityMode } from './types'
import type { DetectedInterestLevel } from '../../lib/tagRoll/detectedInterestPrefs'
import { beatTicks } from '../../lib/tagRoll/tempoMap'
import type { TagRollTimeSignature } from '../../lib/tagRoll/types'
import {
  DEFAULT_DETECTED_SCORE_TWEAKS,
  type DetectedScoreTweaks,
} from './detectedScoreTweaks'

export type { DetectedInterestLevel, DetectedScoreTweaks }

export type ImpliedMelodyChord = {
  rootPc: number
  natureId: string
  roman: string
  confidence: number
  leadRole: ChordToneRole
  /** Best matching classic cadence for UI tooltips / Coach. */
  cadenceHint?: CadenceHint
}

export type ForcedImpliedChord = {
  rootPc: number
  natureId: string
  roman: string
}

export type BareMelodyMoment = {
  startTick: number
  durationTicks: number
  midi: number
  /** Strong / Passing bias from Tag Roll Roles (optional). */
  melodyRole?: 'pmn' | 'smn' | 'unknown'
  /**
   * When set (held-note cadence split), Detected uses this chord instead of ranking.
   * Alt lists still come from normal inference at this onset.
   */
  forceImplied?: ForcedImpliedChord
}

export type MelodyRoleBias = 'pmn' | 'smn' | 'unknown' | null | undefined

/** Cadences that must not be undone by Strong→triad / Passing→seventh reorder. */
const CADENCE_PROTECTED_IDS = new Set([
  'auth_v7_i',
  'lead_tone_v7',
  'circle_ii_v_i',
  'tag_penult',
])

/** Mild/Bold: ii7 preparing V should survive Strong→triad reorder even without a hint id. */
const MILD_STRONG_KEEP_NATURES = new Set(['m7', 'seventh', 'ninth'])

function isCadenceProtected(hint?: CadenceHint): boolean {
  return !!hint && CADENCE_PROTECTED_IDS.has(hint.id)
}

function interestAtLeastMild(interest?: DetectedInterestLevel | null): boolean {
  return interest === 'mild' || interest === 'bold'
}

/** Reorder implied chords: Strong → home triads; Passing → color / sevenths.
 * Keeps a protected cadence top-pick pinned (Bonnie openings stay V7 under Strong).
 * Mild/Bold: also pin ii7 / V7 when they prepare the next dominant or tonic.
 */
export function reorderImpliedByMelodyRole<
  T extends { natureId: string; cadenceHint?: CadenceHint; rootPc?: number },
>(
  inferred: readonly T[],
  melodyRole?: MelodyRoleBias,
  interest?: DetectedInterestLevel | null,
): T[] {
  if (!inferred.length) return []
  const mildPlus = interestAtLeastMild(interest)
  const pinCadence =
    isCadenceProtected(inferred[0]?.cadenceHint) ||
    (mildPlus &&
      melodyRole === 'pmn' &&
      MILD_STRONG_KEEP_NATURES.has(inferred[0]!.natureId) &&
      (inferred[0]!.cadenceHint != null || inferred[0]!.natureId === 'm7'))
  const head = pinCadence ? inferred[0]! : null
  const rest = pinCadence ? inferred.slice(1) : [...inferred]

  let ordered: T[]
  if (melodyRole === 'smn') {
    ordered = [...rest].sort((a, b) => {
      const score = (n: string) =>
        n === 'seventh' || n === 'm7' || n === 'ninth' || n === 'half-dim' ? 0 : 1
      return score(a.natureId) - score(b.natureId)
    })
  } else if (melodyRole === 'pmn') {
    ordered = [...rest].sort((a, b) => {
      const score = (n: string) =>
        n === 'major' || n === 'minor' || n === 'sixth' ? 0 : 1
      return score(a.natureId) - score(b.natureId)
    })
  } else {
    ordered = rest
  }
  return head ? [head, ...ordered] : ordered
}

function pickImpliedByMelodyRole(
  pool: readonly ImpliedMelodyChord[],
  melodyRole?: MelodyRoleBias,
  interest?: DetectedInterestLevel | null,
): ImpliedMelodyChord | undefined {
  return reorderImpliedByMelodyRole(pool, melodyRole, interest)[0]
}

const ROLE_SCORE: Partial<Record<ChordToneRole, number>> = {
  1: 4,
  3: 3.5,
  5: 2.5,
  7: 3.2,
  9: 1.4,
  6: 1.2,
}

function functionWeight(rootDeg: number, mode: TonalityMode): number {
  if (mode === 'minor') {
    if (rootDeg === 0) return 10
    if (rootDeg === 7) return 9
    if (rootDeg === 5) return 8
    if (rootDeg === 8) return 6
    if (rootDeg === 3) return 5
    if (rootDeg === 10) return 4
    if (rootDeg === 2) return 2
    return 1
  }
  if (rootDeg === 0) return 10
  if (rootDeg === 7) return 9
  if (rootDeg === 5) return 8
  if (rootDeg === 9) return 6
  if (rootDeg === 2) return 5
  if (rootDeg === 4) return 4
  if (rootDeg === 11) return 2
  return 1
}

function romanForDiatonic(
  baseRoman: string,
  natureId: string,
  mode: TonalityMode,
): string {
  if (natureId === 'seventh' || natureId === 'ninth') {
    if (baseRoman === 'I' || baseRoman === 'i') return `${mode === 'minor' ? 'i' : 'I'}7`
    if (baseRoman === 'V') return natureId === 'ninth' ? 'V7(9)' : 'V7'
    if (baseRoman === 'IV' || baseRoman === 'iv') return `${mode === 'minor' ? 'iv' : 'IV'}7`
    if (baseRoman === 'ii' || baseRoman === 'II') {
      return natureId === 'ninth' ? 'V7(9)/V' : 'V7/V'
    }
    return `${baseRoman}7`
  }
  if (natureId === 'm7') {
    if (baseRoman === 'ii') return 'ii7'
    if (baseRoman === 'vi' || baseRoman === 'VI') return `${baseRoman.toLowerCase()}7`
    if (baseRoman === 'iii') return 'iii7'
    if (baseRoman === 'i' || baseRoman === 'iv') return `${baseRoman}7`
  }
  return baseRoman
}

function nextMelodyDeg(ctx: CadenceContext, tonality: number): number | null {
  if (ctx.nextMelodyMidi == null) return null
  return degreeOf((((ctx.nextMelodyMidi % 12) + 12) % 12), tonality)
}

function nextSupportsTonic(ctx: CadenceContext, tonality: number): boolean {
  if (ctx.nextPillarRoot != null && degreeOf(ctx.nextPillarRoot, tonality) === 0) return true
  const d = nextMelodyDeg(ctx, tonality)
  // I chord tones: ^1, ^3, ^5
  return d === 0 || d === 4 || d === 7
}

function nextSupportsDominant(ctx: CadenceContext, tonality: number): boolean {
  if (ctx.nextPillarRoot != null && degreeOf(ctx.nextPillarRoot, tonality) === 7) return true
  const d = nextMelodyDeg(ctx, tonality)
  // Chord tones of V: ^5, ^7, ^2
  return d === 7 || d === 11 || d === 2
}

function scoreCandidate(
  rootPc: number,
  natureId: string,
  leadRole: ChordToneRole,
  tonality: number,
  mode: TonalityMode,
  cadenceCtx: CadenceContext,
  bias: CadenceBias,
  interest: DetectedInterestLevel,
  tweaks: DetectedScoreTweaks,
): { score: number; cadenceHint?: CadenceHint } {
  const deg = degreeOf(rootPc, tonality)
  let score = functionWeight(deg, mode) * 10 + (ROLE_SCORE[leadRole] ?? 1)
  const mildPlus = interestAtLeastMild(interest)
  const bold = interest === 'bold'
  const tw = tweaks

  // Prefer plain I / IV / V majors when the melody is the root (or fifth).
  if ((natureId === 'major' || natureId === 'minor') && (leadRole === 1 || leadRole === 5)) {
    if (deg === 0 || deg === 5 || deg === 7) score += tw.triadHomeBoost
  }
  // Strongly prefer triad over I7 / IV7 when melody is the chord root.
  if (natureId === 'seventh' && leadRole === 1 && (deg === 0 || deg === 5)) {
    score -= tw.seventhOnIOrIvRootPenalty
  }
  // Barbershop color: V7 (and light I7) when lead sits on 3 or 7 — not as the default home.
  if (natureId === 'seventh' && (leadRole === 3 || leadRole === 7)) {
    if (deg === 7) score += tw.v7LeadOn3Or7Boost
    if (deg === 0) score += tw.i7LeadOn3Or7Boost
  }
  // Phrase-end / tag: prefer plain tonic over springboard I7 (next phrase's ^4 is not IV here).
  if (
    (cadenceCtx.phraseRole === 'cadence' || cadenceCtx.phraseRole === 'tag') &&
    natureId === 'seventh' &&
    deg === 0
  ) {
    score -= tw.phraseEndI7Penalty
  }

  // Classic cadences (V7→I, ^7→^1, II7→V7→I, I7→IV, …) — shared with Coach.
  const cad = scoreCadenceFit(
    { rootPc, natureId },
    cadenceCtx,
    { maxPriority: 2, bias },
  )
  score += cad.boost

  // Mild/Bold: prefer V7 over plain V when Lead is 5 of V and next supports tonic.
  if (mildPlus && deg === 7 && nextSupportsTonic(cadenceCtx, tonality)) {
    if (natureId === 'seventh' && leadRole === 5) score += tw.mild.v7OverVWhenLeadOn5Boost
    if (natureId === 'major' && leadRole === 5) score -= tw.mild.plainVWhenLeadOn5Demote
  }
  // Mild/Bold: boost ii7 when next leans V (circle drive). Lead on ^2 is often
  // heard as 5-of-V; demote parking on V so Cm7 can win (Bonnie).
  if (mildPlus && natureId === 'm7' && deg === 2) {
    score += nextSupportsDominant(cadenceCtx, tonality)
      ? tw.mild.ii7CircleBoost
      : tw.mild.ii7BaseBoost
  }
  if (
    mildPlus &&
    deg === 7 &&
    leadRole === 5 &&
    nextSupportsDominant(cadenceCtx, tonality) &&
    !nextSupportsTonic(cadenceCtx, tonality)
  ) {
    // Preparing V (next is V-ish) — don't land on V early under ^2.
    if (natureId === 'major' || natureId === 'seventh') score -= tw.mild.earlyVDemote
  }
  // Bold: V7/V / Dom9 stay in the pool, but only lift ★ when preparing V and Lead
  // is a characteristic tone — never an unconditional +huge that steals Mild picks.
  if (
    bold &&
    deg === 2 &&
    (natureId === 'seventh' || natureId === 'ninth') &&
    nextSupportsDominant(cadenceCtx, tonality)
  ) {
    const characteristic =
      leadRole === 1 ||
      leadRole === 3 ||
      leadRole === 7 ||
      (natureId === 'ninth' && leadRole === 9)
    if (characteristic) {
      score += tw.bold.secondaryBaseBoost + tw.bold.secondaryCircleBoost
    } else {
      score += tw.bold.secondaryCircleBoost
    }
  }

  // Keep Dom9 / add6 out of the top Detected pick unless Bold (or nothing else fits).
  if (natureId === 'ninth' || natureId === 'sixth' || natureId === 'add9' || natureId === 'madd6') {
    if (natureId === 'ninth' && bold && leadRole === 9) {
      score += tw.bold.dom9OnNineBoost
    } else if (natureId === 'ninth' && bold) {
      score -= tw.bold.dom9SoftPenalty
    } else {
      score -= tw.bold.exoticPenalty
    }
  }
  return { score, cadenceHint: cad.hint ?? undefined }
}

/**
 * Ranked diatonic (+ light BS7 color) chords that contain this melody tone.
 * Mild re-ranks the same pool; Bold also adds V7/V and Dom9 when Lead fits.
 */
export function inferImpliedChordsFromMelody(opts: {
  melodyMidi: number
  tonality: number
  mode?: TonalityMode
  limit?: number
  /** Next melody pitch — enables cadence biases (V7→I, etc.). */
  nextMelodyMidi?: number | null
  prevMelodyMidi?: number | null
  prevRootPc?: number | null
  prevNatureId?: string | null
  nextPillarRoot?: number | null
  pillarRoot?: number | null
  phraseRole?: PhraseRole
  cadenceBias?: CadenceBias
  interest?: DetectedInterestLevel
  /** Scoring weight Tweaks (defaults = shipped table). */
  tweaks?: DetectedScoreTweaks
}): ImpliedMelodyChord[] {
  const mode = opts.mode ?? 'major'
  const limit = Math.max(1, opts.limit ?? 3)
  const bias = opts.cadenceBias ?? 'strong'
  const interest = opts.interest ?? 'basic'
  const tweaks = opts.tweaks ?? DEFAULT_DETECTED_SCORE_TWEAKS
  const diatonic = diatonicChords(opts.tonality, mode)
  type Cand = ImpliedMelodyChord & { score: number }
  const cands: Cand[] = []
  const cadenceCtx: CadenceContext = {
    tonality: opts.tonality,
    mode,
    melodyMidi: opts.melodyMidi,
    nextMelodyMidi: opts.nextMelodyMidi ?? null,
    prevMelodyMidi: opts.prevMelodyMidi ?? null,
    prevRootPc: opts.prevRootPc ?? null,
    prevNatureId: opts.prevNatureId ?? null,
    nextPillarRoot: opts.nextPillarRoot ?? null,
    pillarRoot: opts.pillarRoot ?? null,
    phraseRole: opts.phraseRole,
  }

  const push = (rootPc: number, natureId: string, baseRoman: string) => {
    const chord = BARBERSHOP_CHORDS.find((c) => c.id === natureId)
    if (!chord) return
    const leadRole = leadRoleInChord(chord, rootPc, opts.melodyMidi)
    if (leadRole == null) return
    const { score, cadenceHint } = scoreCandidate(
      rootPc,
      natureId,
      leadRole,
      opts.tonality,
      mode,
      cadenceCtx,
      bias,
      interest,
      tweaks,
    )
    cands.push({
      rootPc,
      natureId,
      roman: romanForDiatonic(baseRoman, natureId, mode),
      confidence: Math.min(1, score / 110),
      leadRole,
      score,
      cadenceHint,
    })
  }

  for (const d of diatonic) {
    push(d.rootPc, d.natureId, d.roman)
    // Common color extensions when the melody still fits (ranked below triads for I/IV roots).
    if (d.natureId === 'major' && (d.deg === 0 || d.deg === 5 || d.deg === 7)) {
      push(d.rootPc, 'seventh', d.roman)
    }
    if (d.natureId === 'minor' && (d.deg === 2 || d.deg === 9 || d.deg === 0 || d.deg === 5)) {
      push(d.rootPc, 'm7', d.roman)
    }
    if (d.natureId === 'dim') {
      push(d.rootPc, 'half-dim', d.roman)
    }
  }

  // Bold: secondary dominant on ^2 (V7/V) and Dom9 when Lead fits.
  if (interest === 'bold') {
    const vOfVRoot = (opts.tonality + 2) % 12
    push(vOfVRoot, 'seventh', 'II')
    push(vOfVRoot, 'ninth', 'II')
  }

  cands.sort((a, b) => b.score - a.score)
  const out: ImpliedMelodyChord[] = []
  const seen = new Set<string>()
  for (const c of cands) {
    const key = `${c.rootPc}:${c.natureId}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push({
      rootPc: c.rootPc,
      natureId: c.natureId,
      roman: c.roman,
      confidence: c.confidence,
      leadRole: c.leadRole,
      cadenceHint: c.cadenceHint,
    })
    if (out.length >= limit) break
  }
  return out
}

/** True when a harmony stack already accounts for this melody onset. */
export function melodyOnsetCoveredByStack(
  startTick: number,
  stacks: readonly ChordStack[],
): boolean {
  return stacks.some(
    (s) =>
      !!s.midi &&
      s.startTick <= startTick &&
      startTick < s.startTick + Math.max(1, s.durationTicks),
  )
}

function natureById(id: string) {
  return BARBERSHOP_CHORDS.find((c) => c.id === id) ?? null
}

function leadFits(rootPc: number, natureId: string, midi: number): boolean {
  const chord = natureById(natureId)
  return !!chord && chordContainsLead(chord, rootPc, midi)
}

type HeldRecipeStep = ForcedImpliedChord & { fraction: number }

/**
 * Split long bare Lead holds into tension→resolve cadence stacks when the
 * held pitch is a common tone of every step. Basic never splits.
 */
export function expandHeldMomentsForCadences(
  moments: readonly BareMelodyMoment[],
  opts: {
    interest?: DetectedInterestLevel | null
    tonality: number
    mode?: TonalityMode
    ppq: number
    timeSignature: TagRollTimeSignature
    /** Minimum hold length in beats (default from Tweaks). */
    minBeats?: number
    tweaks?: DetectedScoreTweaks
  },
): BareMelodyMoment[] {
  const interest = opts.interest ?? 'basic'
  if (!interestAtLeastMild(interest)) return [...moments]
  const tweaks = opts.tweaks ?? DEFAULT_DETECTED_SCORE_TWEAKS
  const mode = opts.mode ?? 'major'
  const bt = beatTicks(opts.timeSignature, opts.ppq)
  const minDur = Math.max(1, Math.round((opts.minBeats ?? tweaks.held.minBeats) * bt))
  const tonic = ((opts.tonality % 12) + 12) % 12
  const vRoot = (tonic + 7) % 12
  const iiRoot = (tonic + 2) % 12

  const out: BareMelodyMoment[] = []
  for (const m of moments) {
    if (m.forceImplied || m.durationTicks < minDur) {
      out.push(m)
      continue
    }
    // Skip single tonic-arrival Strong holds with no dominant context.
    if (m.melodyRole === 'pmn' && degreeOf((((m.midi % 12) + 12) % 12), tonic) === 0) {
      out.push(m)
      continue
    }

    let recipe: HeldRecipeStep[] | null = null

    const v7ToI: HeldRecipeStep[] = [
      { rootPc: vRoot, natureId: 'seventh', roman: 'V7', fraction: 0.5 },
      { rootPc: tonic, natureId: 'major', roman: mode === 'minor' ? 'i' : 'I', fraction: 0.5 },
    ]
    const ii7ToV7: HeldRecipeStep[] = [
      { rootPc: iiRoot, natureId: 'm7', roman: 'ii7', fraction: 0.5 },
      { rootPc: vRoot, natureId: 'seventh', roman: 'V7', fraction: 0.5 },
    ]
    // Bold: V7/V→V7 under a hold when Lead is a common tone of both (typically ^2).
    // Full V7/V→V7→I under one pitch is impossible in major (empty ∩ of all three).
    const vOfVToV7: HeldRecipeStep[] = [
      { rootPc: iiRoot, natureId: 'seventh', roman: 'V7/V', fraction: 0.5 },
      { rootPc: vRoot, natureId: 'seventh', roman: 'V7', fraction: 0.5 },
    ]

    const fitsAll = (steps: HeldRecipeStep[]) =>
      steps.every((s) => leadFits(s.rootPc, s.natureId, m.midi))

    if (interest === 'bold' && fitsAll(vOfVToV7)) {
      recipe = vOfVToV7
    } else if (fitsAll(v7ToI)) {
      recipe = v7ToI
    } else if (fitsAll(ii7ToV7)) {
      recipe = ii7ToV7
    }

    if (!recipe) {
      out.push(m)
      continue
    }

    // Snap split points to the beat grid under the hold.
    const end = m.startTick + m.durationTicks
    let cursor = m.startTick
    for (let i = 0; i < recipe.length; i++) {
      const step = recipe[i]!
      const isLast = i === recipe.length - 1
      let stepEnd: number
      if (isLast) {
        stepEnd = end
      } else {
        const ideal =
          m.startTick +
          Math.round(
            m.durationTicks * recipe.slice(0, i + 1).reduce((a, s) => a + s.fraction, 0),
          )
        const beatsFromStart = Math.round((ideal - m.startTick) / bt)
        stepEnd = Math.min(end - bt, Math.max(m.startTick + bt, m.startTick + beatsFromStart * bt))
        if (stepEnd <= cursor) stepEnd = Math.min(end - 1, cursor + bt)
      }
      const dur = Math.max(1, stepEnd - cursor)
      out.push({
        startTick: cursor,
        durationTicks: dur,
        midi: m.midi,
        melodyRole: m.melodyRole,
        forceImplied: {
          rootPc: step.rootPc,
          natureId: step.natureId,
          roman: step.roman,
        },
      })
      cursor = cursor + dur
      if (cursor >= end) break
    }
  }
  return out
}

/**
 * Synthetic analysis-only stacks for bare melody moments (midi null, not locked).
 */
export function impliedStacksForBareMelody(opts: {
  moments: readonly BareMelodyMoment[]
  existingStacks: readonly ChordStack[]
  tonality: number
  mode?: TonalityMode
  idPrefix?: string
  cadenceBias?: CadenceBias
  /** Exclusive-ish end of chart / selection for phrase-role heuristics. */
  songEndTick?: number
  interest?: DetectedInterestLevel
  ppq?: number
  timeSignature?: TagRollTimeSignature
  tweaks?: DetectedScoreTweaks
}): ChordStack[] {
  const mode = opts.mode ?? 'major'
  const prefix = opts.idPrefix ?? 'implied'
  const interest = opts.interest ?? 'basic'
  const tweaks = opts.tweaks ?? DEFAULT_DETECTED_SCORE_TWEAKS
  const out: ChordStack[] = []
  let n = 0

  const expandOpts = {
    interest,
    tonality: opts.tonality,
    mode,
    tweaks,
    ppq: opts.ppq ?? 480,
    timeSignature: opts.timeSignature ?? { numerator: 4, denominator: 4 },
  }
  const expanded =
    opts.ppq != null && opts.timeSignature
      ? expandHeldMomentsForCadences(opts.moments, expandOpts)
      : interestAtLeastMild(interest)
        ? expandHeldMomentsForCadences(opts.moments, expandOpts)
        : [...opts.moments]

  const sorted = [...expanded].sort((a, b) => a.startTick - b.startTick)
  const last = sorted[sorted.length - 1]
  const songEndTick =
    opts.songEndTick ??
    (last ? last.startTick + Math.max(1, last.durationTicks) : 0)

  const stackAtOrBefore = (tick: number): ChordStack | undefined => {
    let best: ChordStack | undefined
    for (const s of opts.existingStacks) {
      if (s.natureId === 'unknown') continue
      if (s.startTick > tick) continue
      if (!best || s.startTick > best.startTick) best = s
    }
    for (const s of out) {
      if (s.startTick > tick) continue
      if (!best || s.startTick > best.startTick) best = s
    }
    return best
  }

  const isTonicPick = (rootPc: number, natureId: string): boolean => {
    if (degreeOf(rootPc, opts.tonality) !== 0) return false
    return natureId === 'major' || natureId === 'minor' || natureId === 'seventh'
  }

  const provisionalPick = (
    m: BareMelodyMoment,
    i: number,
  ): ImpliedMelodyChord | undefined => {
    if (m.forceImplied) {
      return {
        rootPc: m.forceImplied.rootPc,
        natureId: m.forceImplied.natureId,
        roman: m.forceImplied.roman,
        confidence: 1,
        leadRole: 1,
      }
    }
    const next = sorted[i + 1]
    const prev = sorted[i - 1]
    const prevStack = stackAtOrBefore(m.startTick - 1)
    const phraseRole = phraseRoleAtMelodyIndex(sorted, i, songEndTick)
    const pool = inferImpliedChordsFromMelody({
      melodyMidi: m.midi,
      tonality: opts.tonality,
      mode,
      limit: 4,
      nextMelodyMidi: next?.midi ?? null,
      prevMelodyMidi: prev?.midi ?? null,
      prevRootPc: prevStack?.rootPc ?? null,
      prevNatureId: prevStack?.natureId ?? null,
      phraseRole,
      cadenceBias: opts.cadenceBias,
      interest,
      tweaks,
    })
    return pickImpliedByMelodyRole(pool, m.melodyRole, interest)
  }

  const tonic = ((opts.tonality % 12) + 12) % 12
  const vRoot = (tonic + 7) % 12

  for (let i = 0; i < sorted.length; i++) {
    const m = sorted[i]!
    if (melodyOnsetCoveredByStack(m.startTick, opts.existingStacks)) continue
    if (opts.existingStacks.some((s) => s.startTick === m.startTick && s.natureId !== 'unknown')) {
      continue
    }

    if (m.forceImplied) {
      out.push({
        id: `${prefix}_${n++}_${m.startTick}`,
        startTick: m.startTick,
        durationTicks: Math.max(1, m.durationTicks),
        rootPc: m.forceImplied.rootPc,
        natureId: m.forceImplied.natureId,
        voicing: '',
        spread: false,
        layer: 'primary',
        scfGroup: null,
        pillarId: null,
        midi: null,
        ruleTags: [],
      })
      continue
    }

    const next = sorted[i + 1]
    const prev = sorted[i - 1]
    const prevStack = stackAtOrBefore(m.startTick - 1)
    const phraseRole = phraseRoleAtMelodyIndex(sorted, i, songEndTick)
    const nextProv = next ? provisionalPick(next, i + 1) : undefined
    const pool = inferImpliedChordsFromMelody({
      melodyMidi: m.midi,
      tonality: opts.tonality,
      mode,
      limit: 4,
      nextMelodyMidi: next?.midi ?? null,
      prevMelodyMidi: prev?.midi ?? null,
      prevRootPc: prevStack?.rootPc ?? null,
      prevNatureId: prevStack?.natureId ?? null,
      nextPillarRoot: nextProv?.rootPc ?? null,
      phraseRole,
      cadenceBias: opts.cadenceBias,
      interest,
      tweaks,
    })
    let best = pickImpliedByMelodyRole(pool, m.melodyRole, interest)
    if (!best) continue

    // Mild+: first of consecutive I–I → V7 when Lead is a V7 common tone (^5).
    if (
      interestAtLeastMild(interest) &&
      nextProv &&
      isTonicPick(best.rootPc, best.natureId) &&
      isTonicPick(nextProv.rootPc, nextProv.natureId) &&
      leadFits(vRoot, 'seventh', m.midi)
    ) {
      best = {
        rootPc: vRoot,
        natureId: 'seventh',
        roman: 'V7',
        confidence: best.confidence,
        leadRole: best.leadRole,
      }
    }

    out.push({
      id: `${prefix}_${n++}_${m.startTick}`,
      startTick: m.startTick,
      durationTicks: Math.max(1, m.durationTicks),
      rootPc: best.rootPc,
      natureId: best.natureId,
      voicing: '',
      spread: false,
      layer: 'primary',
      scfGroup: null,
      pillarId: null,
      midi: null,
      ruleTags: [],
    })
  }
  return out
}
