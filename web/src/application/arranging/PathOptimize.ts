/**
 * Application use-case: Path Optimize over an arrangement project.
 */
import {
  pathOptimize as pathOptimizeDomain,
  type PathOptimizeDeps,
  type PathOptimizeOpts,
  type PathOptimizeResult,
} from '../../domain/arranging/pathOptimize'

export type { PathOptimizeOpts, PathOptimizeResult, PathOptimizeDeps }
export type {
  PathOptimizeMode,
  PathOptimizeScope,
  PathOptimizeWeights,
  PathOptimizeProgress,
  PathOptimizeReport,
  PathOptimizeTaste,
} from '../../domain/arranging/pathOptimize'
export {
  DEFAULT_PATH_OPTIMIZE_WEIGHTS,
  PATH_OPTIMIZE_MAX_PASSES,
  PATH_OPTIMIZE_DEFAULT_PASSES,
  PATH_OPTIMIZE_TASTE_PRESETS,
  clampPathOptimizePasses,
  clampRisk,
  clampTaste,
  tastePreset,
  weightsFromRisk,
} from '../../domain/arranging/pathOptimize'

export function pathOptimize(
  project: Parameters<typeof pathOptimizeDomain>[0],
  opts: PathOptimizeOpts,
  deps?: PathOptimizeDeps,
): Promise<PathOptimizeResult> {
  return pathOptimizeDomain(project, opts, deps)
}
