/**
 * Path Optimize engine — Fill / Revoice / Rechord / Full with multi-pass windows.
 *
 * Run: overlapping windows + multi-pass score chase (up to hundreds of passes).
 * Try again: same full search, but the first pass samples near-best alternates
 * so the refine loop climbs a different ridge toward "best".
 */
import type { ArrangementProject, MelodyEvent } from '../types'
import {
  applyCandidateAtNote,
  candidatesForMoment,
  hasKnownStack,
  pickExploreCandidate,
  stackAtTick,
  type PathOptimizeDeps,
} from './candidates'
import { preferCadenceSeeds, type CadenceSeed } from './cadenceSeeds'
import { scorePath } from './objective'
import type { HarmonizeCandidate } from '../harmonize'
import type { VoicingPitches } from '../chords'
import { overlappingWindows } from './windows'
import { leapsWithinCaps, partJumpCost } from './partLeaps'
import {
  weightsFromRisk,
  type PathOptimizeMode,
  type PathOptimizeOpts,
  type PathOptimizeProgress,
  type PathOptimizeReport,
  type PathOptimizeWeights,
} from './types'

export const ALL_MODES: PathOptimizeMode[] = ['fill', 'revoice', 'rechord', 'full']
export const EXPLORE_PROBE_SEEDS = [3, 17, 42, 99] as const

export function yieldToUi(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0)
  })
}

export function reportProgress(
  onProgress: PathOptimizeOpts['onProgress'],
  p: PathOptimizeProgress,
): void {
  try {
    onProgress?.(p)
  } catch {
    /* UI progress must never break optimize */
  }
}

export function mergeWeights(partial?: Partial<PathOptimizeWeights>): PathOptimizeWeights {
  const risk =
    typeof partial?.risk === 'number'
      ? partial.risk
      : typeof partial?.voiceLeading === 'number'
        ? 1 - partial.voiceLeading
        : undefined
  return weightsFromRisk(risk ?? 0.2, partial)
}

/** Stable path signature for comparing dry-runs (ignores stack ids). */
export function pathContentFingerprint(
  project: ArrangementProject,
  moments: readonly MelodyEvent[],
): string {
  return moments
    .map((m) => {
      const s = stackAtTick(project, m.startTick)
      if (!s?.midi) return `${m.startTick}:_`
      return `${m.startTick}:${s.rootPc}:${s.natureId}:${s.voicing}:${s.spread ? 1 : 0}:${s.midi.bass},${s.midi.bari},${s.midi.lead},${s.midi.tenor}`
    })
    .join('|')
}

function stackFingerprint(project: ArrangementProject, tick: number): string | null {
  const s = stackAtTick(project, tick)
  if (!s?.midi) return null
  return `${s.id}:${s.rootPc}:${s.natureId}:${s.voicing}:${s.midi.bass},${s.midi.bari},${s.midi.lead},${s.midi.tenor}`
}

export function changedIdsBetween(
  before: ArrangementProject,
  after: ArrangementProject,
  moments: readonly MelodyEvent[],
): string[] {
  const ids: string[] = []
  for (const m of moments) {
    const a = stackAtTick(after, m.startTick)
    if (!a) continue
    const bf = stackFingerprint(before, m.startTick)
    const af = stackFingerprint(after, m.startTick)
    if (bf !== af) ids.push(a.id)
  }
  return [...new Set(ids)]
}

/**
 * Prefer tenor/bass-legal leaps (bari flexible; bass octave OK).
 * Keep ranker score as the primary order — jump-only sort was wiping song-final
 * major homes whenever a smoother-leap I7 shell existed.
 */
function filterLeapSafe(
  cands: readonly HarmonizeCandidate[],
  prevMidi: VoicingPitches | null,
  nextMidi: VoicingPitches | null,
  risk: number,
  explore = false,
): HarmonizeCandidate[] {
  if (!cands.length) return []
  if (!prevMidi && !nextMidi) return [...cands]
  const byScoreThenJump = (pool: HarmonizeCandidate[]): HarmonizeCandidate[] => {
    return [...pool].sort((a, b) => {
      const sa = a.score ?? 0
      const sb = b.score ?? 0
      if (Math.abs(sb - sa) > 2) return sb - sa
      if (!explore && prevMidi && a.midi && b.midi) {
        const ja = partJumpCost(prevMidi, a.midi)
        const jb = partJumpCost(prevMidi, b.midi)
        if (Math.abs(ja - jb) > 0.5) return ja - jb
      }
      return sb - sa
    })
  }
  const safe = cands.filter(
    (c) => c.midi && leapsWithinCaps(prevMidi, c.midi, risk, nextMidi, explore),
  )
  if (safe.length) return byScoreThenJump(safe)
  // Never dump the full unsafe pool — loosen caps once, then re-rank.
  const loosened = cands.filter(
    (c) =>
      c.midi &&
      leapsWithinCaps(prevMidi, c.midi, Math.min(1, risk + 0.35), nextMidi, true),
  )
  if (loosened.length) return byScoreThenJump(loosened)
  const withMidi = cands.filter((c) => c.midi)
  if (!withMidi.length) return []
  if (!prevMidi) return withMidi.slice(0, 1)
  // Basic: do not admit catastrophic leaps — keep score leaders within a
  // hard absolute ceiling (melody octave moves may need ~10–12).
  const basic = risk <= 0.35 && !explore
  const hardCeiling = basic ? 12 : 99
  const capped = withMidi.filter((c) => {
    const t = Math.abs(c.midi!.tenor - prevMidi.tenor)
    const b = Math.abs(c.midi!.bass - prevMidi.bass)
    const bassDescOk = c.midi!.bass < prevMidi.bass && b <= 16
    return t <= hardCeiling && (b === 12 || b <= hardCeiling || bassDescOk)
  })
  const pool = capped.length ? capped : basic ? [] : withMidi
  if (!pool.length) return []
  return byScoreThenJump(pool).slice(0, Math.min(8, pool.length))
}

function prevMidiBefore(
  project: ArrangementProject,
  moments: readonly MelodyEvent[],
  index: number,
): VoicingPitches | null {
  for (let i = index - 1; i >= 0; i--) {
    const s = stackAtTick(project, moments[i]!.startTick)
    if (s?.midi) return s.midi
  }
  return null
}

function nextMidiAfter(
  project: ArrangementProject,
  moments: readonly MelodyEvent[],
  index: number,
): VoicingPitches | null {
  for (let i = index + 1; i < moments.length; i++) {
    const s = stackAtTick(project, moments[i]!.startTick)
    if (s?.midi) return s.midi
  }
  return null
}

function knownStackCount(
  project: ArrangementProject,
  moments: readonly MelodyEvent[],
): number {
  let n = 0
  for (const m of moments) {
    if (hasKnownStack(project, m.startTick)) n++
  }
  return n
}

function pickCandidate(
  cands: ReturnType<typeof candidatesForMoment>,
  seeds: readonly CadenceSeed[] | undefined,
  stochastic: boolean,
  rand: () => number,
  temperature: number,
  prevMidi: VoicingPitches | null,
  nextMidi: VoicingPitches | null,
  risk: number,
  avoid?: { rootPc: number; natureId: string; voicing: string } | null,
  loosenLeaps = false,
) {
  const leapSafe = filterLeapSafe(cands, prevMidi, nextMidi, risk, loosenLeaps)
  const ordered = preferCadenceSeeds(leapSafe, seeds, { risk })
  if (!ordered.length) return null
  if (stochastic) {
    return pickExploreCandidate(ordered, {
      temperature: Math.max(temperature, 1.1),
      rand,
      floorRatio: 0.4,
      avoid,
    })
  }
  return ordered[0]!
}

export type SliceOpts = {
  weights: PathOptimizeWeights
  topK: number
  deps: PathOptimizeDeps | undefined
  /** Sample near-best instead of taking #1 (Try again first pass). */
  stochastic: boolean
  /** Whole Try again stage: slightly looser tenor/bass caps so refine does not snap back. */
  loosenLeaps: boolean
  rand: () => number
  temperature: number
  seedsByTick: Map<number, CadenceSeed[]>
  /**
   * Fill: also re-pick existing stacks when neighbors give better context.
   * Rechord always rewrites known stacks.
   */
  refineExisting: boolean
  /** Walk the slice right→left so right-hand context lands first on even passes. */
  reverse: boolean
}

/**
 * Fill empties (and optionally refine already-filled stacks) inside a moment slice.
 * Uses prev + next sounding MIDI so windows can fill from surrounding context.
 */
export function runFillSlice(
  project: ArrangementProject,
  moments: readonly MelodyEvent[],
  opts: SliceOpts,
): ArrangementProject {
  let p = project
  const order = opts.reverse
    ? [...moments.keys()].reverse()
    : [...moments.keys()]
  for (const localIdx of order) {
    const note = moments[localIdx]!
    // Indices into this slice for neighbor lookup within the window + project.
    const known = hasKnownStack(p, note.startTick)
    if (known && !opts.refineExisting) continue
    const cur = known ? stackAtTick(p, note.startTick)! : null
    const prevMidi = prevMidiBefore(p, moments, localIdx)
    const nextMidi = nextMidiAfter(p, moments, localIdx)
    const cands = candidatesForMoment(p, note, {
      topK: opts.topK,
      weights: opts.weights,
      deps: opts.deps,
    })
    const risk = opts.weights.risk ?? 0.2
    const pick = pickCandidate(
      cands,
      opts.seedsByTick.get(note.startTick),
      opts.stochastic,
      opts.rand,
      opts.temperature,
      prevMidi,
      nextMidi,
      risk,
      cur
        ? { rootPc: cur.rootPc, natureId: cur.natureId, voicing: cur.voicing }
        : null,
      opts.loosenLeaps,
    )
    if (!pick) continue
    if (cur) {
      const ordered = preferCadenceSeeds(
        filterLeapSafe(cands, prevMidi, nextMidi, risk, opts.loosenLeaps),
        opts.seedsByTick.get(note.startTick),
        { risk },
      )
      const curMatch = ordered.find(
        (c) => c.rootPc === cur.rootPc && c.natureId === cur.natureId,
      )
      const curScore = curMatch?.score ?? Number.NEGATIVE_INFINITY
      if (!opts.stochastic) {
        // Try again refine: keep the seeded stack unless greedy is clearly better.
        const margin = opts.loosenLeaps
          ? Math.max(0.4, opts.weights.stayPutEpsilon)
          : -Math.max(0.15, opts.weights.stayPutEpsilon)
        if (pick.score < curScore + margin) continue
      }
      if (
        pick.rootPc === cur.rootPc &&
        pick.natureId === cur.natureId &&
        pick.voicing === cur.voicing &&
        !!pick.spread === !!cur.spread
      ) {
        continue
      }
    }
    p = applyCandidateAtNote(p, note, pick, opts.deps)
  }
  return p
}

export function runRechordSlice(
  project: ArrangementProject,
  moments: readonly MelodyEvent[],
  opts: SliceOpts,
): ArrangementProject {
  let p = project
  const order = opts.reverse
    ? [...moments.keys()].reverse()
    : [...moments.keys()]
  for (const localIdx of order) {
    const note = moments[localIdx]!
    if (!hasKnownStack(p, note.startTick)) continue
    const cur = stackAtTick(p, note.startTick)!
    const prevMidi = prevMidiBefore(p, moments, localIdx)
    const nextMidi = nextMidiAfter(p, moments, localIdx)
    const risk = opts.weights.risk ?? 0.2
    const cands = filterLeapSafe(
      candidatesForMoment(p, note, {
        topK: opts.topK,
        weights: opts.weights,
        deps: opts.deps,
      }),
      prevMidi,
      nextMidi,
      risk,
      opts.loosenLeaps,
    )
    if (!cands.length) continue
    const seeds = opts.seedsByTick.get(note.startTick)
    const ordered = preferCadenceSeeds(cands, seeds, { risk })
    const curMatch = ordered.find(
      (c) => c.rootPc === cur.rootPc && c.natureId === cur.natureId,
    )
    const curScore = curMatch?.score ?? Number.NEGATIVE_INFINITY
    const pick = opts.stochastic
      ? pickExploreCandidate(ordered, {
          temperature: Math.max(opts.temperature, 1.1),
          rand: opts.rand,
          floorRatio: 0.4,
          avoid: {
            rootPc: cur.rootPc,
            natureId: cur.natureId,
            voicing: cur.voicing,
          },
        })
      : ordered[0]!
    if (!pick) continue
    if (!opts.stochastic) {
      // Try again refine: keep seeded stack unless greedy is clearly better.
      const margin = opts.loosenLeaps
        ? Math.max(0.4, opts.weights.stayPutEpsilon)
        : -Math.max(0.15, opts.weights.stayPutEpsilon)
      if (pick.score < curScore + margin) continue
    }
    if (
      pick.rootPc === cur.rootPc &&
      pick.natureId === cur.natureId &&
      pick.voicing === cur.voicing &&
      !!pick.spread === !!cur.spread
    ) {
      continue
    }
    p = applyCandidateAtNote(p, note, pick, opts.deps)
  }
  return p
}

type WindowPassResult = {
  project: ArrangementProject
  passes: number
  changedIds: string[]
}

/**
 * Overlapping-window multi-pass chase. First pass may be stochastic (Try again);
 * later passes are greedy and keep only score improvements.
 */
export async function runWindowedPasses(
  project: ArrangementProject,
  moments: readonly MelodyEvent[],
  args: {
    maxPasses: number
    windowWidth: number
    windowHop: number
    improveEps: number
    /** When false, always run maxPasses; keep best score (no diminishing-gain stop). */
    stopEarly: boolean
    weights: PathOptimizeWeights
    /** When true, pass 0 samples alternates; remaining passes chase best. */
    explore: boolean
    applySlice: (
      p: ArrangementProject,
      slice: readonly MelodyEvent[],
      sliceOpts: SliceOpts,
    ) => ArrangementProject
    sliceBase: Omit<SliceOpts, 'stochastic' | 'loosenLeaps' | 'reverse' | 'refineExisting'>
    /** Fill: pass 0 empties-only; later passes refine with neighbor context. */
    fillStyle?: boolean
    progress?: {
      stage: PathOptimizeProgress['stage']
      stageIndex: number
      stageCount: number
      onProgress?: PathOptimizeOpts['onProgress']
    }
  },
): Promise<WindowPassResult> {
  const windows = overlappingWindows(moments.length, args.windowWidth, args.windowHop)
  let best = project
  let bestScore = scorePath(best, args.weights)
  let usedPasses = 0
  const beforeFp = pathContentFingerprint(project, moments)
  const stopEarly = args.stopEarly

  for (let pass = 0; pass < args.maxPasses; pass++) {
    usedPasses++
    if (args.progress) {
      reportProgress(args.progress.onProgress, {
        stage: args.progress.stage,
        stageIndex: args.progress.stageIndex,
        stageCount: args.progress.stageCount,
        pass: pass + 1,
        maxPasses: args.maxPasses,
      })
      await yieldToUi()
    }
    const stochastic = args.explore && pass === 0
    const reverse = pass % 2 === 1
    // Fill: only write empties (and explore diversify). Do not "refine" filled
    // stacks — path-score chase was overwriting V7 highways with plain I.
    const refineExisting = args.fillStyle ? stochastic : true
    let passProject = best
    const wins = reverse ? [...windows].reverse() : windows
    for (const win of wins) {
      const slice = moments.slice(win.start, win.end)
      passProject = args.applySlice(passProject, slice, {
        ...args.sliceBase,
        stochastic,
        loosenLeaps: args.explore,
        reverse,
        refineExisting,
      })
    }
    const sc = scorePath(passProject, args.weights)

    // Explore first pass: always accept the diversifying seed path, then refine.
    if (stochastic) {
      best = passProject
      bestScore = sc
      continue
    }

    // Fill: an empty chart often "scores" higher than a real path (no motion
    // yet). Prefer covering more moments; only then chase path score.
    if (args.fillStyle) {
      const beforeN = knownStackCount(best, moments)
      const afterN = knownStackCount(passProject, moments)
      if (afterN > beforeN) {
        best = passProject
        bestScore = sc
        continue
      }
      if (afterN < beforeN) {
        if (stopEarly) break
        continue
      }
    }

    if (sc >= bestScore) {
      const gain = sc - bestScore
      best = passProject
      bestScore = sc
      // Diminishing gains: improvement below ε after the first real pass.
      if (
        stopEarly &&
        gain <= args.improveEps &&
        pass > (args.explore ? 1 : 0)
      ) {
        break
      }
      continue
    }

    // Score dropped vs best.
    if (stopEarly) {
      if (sc < bestScore - args.improveEps) break
      break
    }
    // stopEarly off: keep searching; best stays as-is.
  }

  const changedIds =
    pathContentFingerprint(best, moments) === beforeFp
      ? []
      : changedIdsBetween(project, best, moments)

  return { project: best, passes: usedPasses, changedIds }
}

function modeLabel(mode: PathOptimizeOpts['mode']): string {
  switch (mode) {
    case 'fill':
      return 'Fill empty'
    case 'revoice':
      return 'Revoice'
    case 'rechord':
      return 'Rechord'
    case 'full':
      return 'Full path'
  }
}

export function makeReport(
  partial: Omit<PathOptimizeReport, 'message' | 'viableModes' | 'canTryAgain'> & {
    message?: string
    viableModes?: PathOptimizeMode[]
    canTryAgain?: boolean
  },
): PathOptimizeReport {
  const changed = partial.changedCount
  let message = partial.message
  if (!message) {
    if (partial.rejected) {
      message = partial.rejectReason
        ? `Rejected: ${partial.rejectReason}. Chart unchanged.`
        : 'Rejected — chart unchanged.'
    } else if (!partial.applied || changed === 0) {
      message = `${modeLabel(partial.mode)} left stacks unchanged.`
    } else {
      const passNote =
        partial.passes > 1 ? ` (${partial.passes} passes)` : ''
      message = `${modeLabel(partial.mode)} updated ${changed} stack${changed === 1 ? '' : 's'}${passNote}. Audition the path.`
    }
  }
  return {
    ...partial,
    message,
    viableModes: partial.viableModes ?? [],
    canTryAgain: partial.canTryAgain ?? false,
  }
}

export { pathOptimize } from './optimizeRun'
