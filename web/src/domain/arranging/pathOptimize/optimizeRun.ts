/**
 * Path Optimize orchestration: stages, windows, and the try-again probe.
 * Slice runners stay in optimize.ts.
 */
import type { ArrangementProject } from '../types'
import {
  hasKnownStack,
  mulberry32,
  revoiceStacksForMoments,
  type PathOptimizeDeps,
} from './candidates'
import { cadenceSeedsByTick } from './cadenceSeeds'
import { resolveOptimizeMoments } from './moments'
import { rejectGate, scorePath } from './objective'
import {
  ALL_MODES,
  EXPLORE_PROBE_SEEDS,
  changedIdsBetween,
  makeReport,
  mergeWeights,
  pathContentFingerprint,
  reportProgress,
  runFillSlice,
  runRechordSlice,
  runWindowedPasses,
  yieldToUi,
  type SliceOpts,
} from './optimize'
import {
  clampPathOptimizePasses,
  type PathOptimizeMode,
  type PathOptimizeOpts,
  type PathOptimizeProgress,
  type PathOptimizeReport,
  type PathOptimizeResult,
} from './types'

/**
 * Run Path Optimize (multi-pass overlapping windows for fill / rechord;
 * revoice is one full-scope Viterbi pass). Does not mutate `project`.
 * Yields between passes so the UI can paint progress.
 */
export async function pathOptimize(
  project: ArrangementProject,
  opts: PathOptimizeOpts,
  deps?: PathOptimizeDeps,
): Promise<PathOptimizeResult> {
  const weights = mergeWeights(opts.weights)
  const topK = Math.min(24, Math.max(4, opts.topK ?? 12))
  const moments = resolveOptimizeMoments(project, opts.scope)
  const scoreBefore = scorePath(project, weights)
  const explore = !!opts.explore
  const temperature = opts.temperature ?? 0.85
  const rand = mulberry32(opts.seed ?? 1)
  const maxPasses = clampPathOptimizePasses(opts.maxPasses)
  const windowWidth = opts.windowWidth ?? 8
  const windowHop = opts.windowHop ?? 3
  const improveEps = opts.improveEpsilon ?? 0.2
  const stopEarly = opts.stopEarly !== false

  if (!moments.length) {
    return {
      project,
      report: makeReport({
        mode: opts.mode,
        scope: opts.scope,
        applied: false,
        rejected: false,
        changedStackIds: [],
        changedCount: 0,
        scoreBefore,
        scoreAfter: scoreBefore,
        passes: 0,
        message: 'Nothing in scope to optimize.',
      }),
    }
  }

  const seedsByTick = cadenceSeedsByTick(project, moments, weights.cadenceBias)
  let next = project
  let totalPasses = 0
  let revoiceChanged: string[] = []

  // Try again on a filled chart: Fill alone is a no-op — escalate to Rechord
  // so different seeds can change natures / voicings, then still multi-pass.
  const emptyInScope = moments.filter((m) => !hasKnownStack(project, m.startTick)).length
  let mode = opts.mode
  if (explore && mode === 'fill' && emptyInScope === 0) {
    mode = 'rechord'
  }

  const sliceBase: Omit<
    SliceOpts,
    'stochastic' | 'loosenLeaps' | 'reverse' | 'refineExisting'
  > = {
    weights,
    topK,
    deps,
    rand,
    temperature,
    seedsByTick,
  }

  // Try again: one stochastic seed pass on the first stage that runs, then
  // every later pass (and later stages) greedily chase the best score.
  let seedPassPending = explore

  const stages: PathOptimizeProgress['stage'][] = []
  if (mode === 'fill' || mode === 'full') stages.push('fill')
  if (mode === 'rechord' || mode === 'full') stages.push('rechord')
  if (mode === 'revoice' || mode === 'full') stages.push('revoice')
  const stageCount = Math.max(1, stages.length)
  let stageIndex = 0

  if (mode === 'fill' || mode === 'full') {
    const filled = await runWindowedPasses(next, moments, {
      maxPasses,
      windowWidth,
      windowHop,
      improveEps,
      stopEarly,
      weights,
      explore: seedPassPending,
      fillStyle: true,
      applySlice: runFillSlice,
      sliceBase,
      progress: {
        stage: 'fill',
        stageIndex: stageIndex++,
        stageCount,
        onProgress: opts.onProgress,
      },
    })
    next = filled.project
    totalPasses += filled.passes
    seedPassPending = false
  }

  if (mode === 'rechord' || mode === 'full') {
    const rechorded = await runWindowedPasses(next, moments, {
      maxPasses,
      windowWidth,
      windowHop,
      improveEps,
      stopEarly,
      weights,
      explore: seedPassPending,
      applySlice: runRechordSlice,
      sliceBase,
      progress: {
        stage: 'rechord',
        stageIndex: stageIndex++,
        stageCount,
        onProgress: opts.onProgress,
      },
    })
    next = rechorded.project
    totalPasses += rechorded.passes
    seedPassPending = false
  }

  if (mode === 'revoice' || mode === 'full') {
    // One full-scope Viterbi pass — windowed revoice broke T/B continuity.
    reportProgress(opts.onProgress, {
      stage: 'revoice',
      stageIndex: stageIndex++,
      stageCount,
      pass: 1,
      maxPasses: 1,
    })
    await yieldToUi()
    const { project: out, changedIds } = revoiceStacksForMoments(next, moments, {
      risk: weights.risk ?? 0.2,
      profile: opts.voicingProfile,
      exploreSeed: opts.explore ? (opts.seed ?? 1) : undefined,
      allowSingle: moments.length === 1,
    })
    next = out
    revoiceChanged = changedIds
    totalPasses += 1
  }

  if (!totalPasses) totalPasses = 1

  const changedStackIds = [
    ...new Set([
      ...changedIdsBetween(project, next, moments),
      ...revoiceChanged,
    ]),
  ]
  const scoreAfter = scorePath(next, weights)

  if (!changedStackIds.length) {
    const empty = makeReport({
      mode: opts.mode,
      scope: opts.scope,
      applied: false,
      rejected: false,
      changedStackIds: [],
      changedCount: 0,
      scoreBefore,
      scoreAfter: scoreBefore,
      passes: totalPasses,
      message:
        explore && emptyInScope === 0 && opts.mode === 'fill'
          ? 'Run again (as Rechord) found no alternate stacks — widen scope, raise Risk, or allow worsen.'
          : undefined,
    })
    return {
      project,
      report: opts.skipProbe
        ? empty
        : await withProbe(project, project, empty, opts, deps),
    }
  }

  const gate = rejectGate(project, next, {
    explore,
    risk: weights.risk,
    allowWorsen: !!opts.allowWorsen,
  })
  if (!gate.ok) {
    const rejected = makeReport({
      mode: opts.mode,
      scope: opts.scope,
      applied: false,
      rejected: true,
      rejectReason: gate.reason,
      changedStackIds: [],
      changedCount: 0,
      scoreBefore,
      scoreAfter: scoreBefore,
      passes: totalPasses,
    })
    return {
      project,
      report: opts.skipProbe
        ? rejected
        : await withProbe(project, project, rejected, opts, deps),
    }
  }

  const applied = makeReport({
    mode: opts.mode,
    scope: opts.scope,
    applied: true,
    rejected: false,
    changedStackIds,
    changedCount: changedStackIds.length,
    scoreBefore,
    scoreAfter,
    passes: totalPasses,
  })
  return {
    project: next,
    report: opts.skipProbe
      ? applied
      : await withProbe(project, next, applied, opts, deps),
  }
}

/**
 * Dry-run other modes + explore seeds against the post-run chart so the UI
 * can disable inert chips and enable Try again only when it can diversify.
 */
async function withProbe(
  _before: ArrangementProject,
  after: ArrangementProject,
  report: PathOptimizeReport,
  opts: PathOptimizeOpts,
  deps: PathOptimizeDeps | undefined,
): Promise<PathOptimizeReport> {
  reportProgress(opts.onProgress, {
    stage: 'probe',
    stageIndex: 0,
    stageCount: 1,
    pass: 1,
    maxPasses: 1,
  })
  await yieldToUi()
  const moments = resolveOptimizeMoments(after, opts.scope)
  const baseFp = pathContentFingerprint(after, moments)
  const viableModes: PathOptimizeMode[] = []
  for (const mode of ALL_MODES) {
    const { project: probed, report: pr } = await pathOptimize(
      after,
      {
        ...opts,
        mode,
        explore: false,
        seed: undefined,
        skipProbe: true,
        onProgress: undefined,
        // Keep probes snappy — viability, not a full hundred-pass chase.
        maxPasses: Math.min(3, clampPathOptimizePasses(opts.maxPasses)),
      },
      deps,
    )
    if (!pr.applied && !pr.rejected) {
      continue
    }
    if (pr.rejected) continue
    const fp = pathContentFingerprint(probed, moments)
    if (fp !== baseFp) viableModes.push(mode)
  }

  let canTryAgain = false
  for (const seed of EXPLORE_PROBE_SEEDS) {
    const { project: probed, report: pr } = await pathOptimize(
      after,
      {
        ...opts,
        mode: opts.mode,
        explore: true,
        seed,
        temperature: Math.max(1.25, opts.temperature ?? 0.85),
        skipProbe: true,
        onProgress: undefined,
        maxPasses: Math.min(4, clampPathOptimizePasses(opts.maxPasses)),
      },
      deps,
    )
    if (pr.rejected) continue
    if (pathContentFingerprint(probed, moments) !== baseFp) {
      canTryAgain = true
      break
    }
  }
  if (!canTryAgain && report.applied) {
    canTryAgain =
      opts.mode === 'fill' || opts.mode === 'full' || opts.mode === 'rechord'
  }

  let message = report.message
  if (report.applied && !canTryAgain && !viableModes.length) {
    message = `${report.message} No alternate modes or seeds change this path.`
  } else if (report.applied && !canTryAgain) {
    message = `${report.message} Run again may need a mode change, higher Risk, or Allow worsen.`
  }

  return {
    ...report,
    viableModes,
    canTryAgain,
    message,
  }
}
