/**
 * Application use-case: Path Optimize over an arrangement project.
 * Ensures Strong/Passing defaults on unlabeled melody before domain runs.
 */
import {
  pathOptimize as pathOptimizeDomain,
  type PathOptimizeDeps,
  type PathOptimizeOpts,
  type PathOptimizeResult,
} from '../../domain/arranging/pathOptimize'
import { assignMelodyRoles } from '../../domain/arranging/melodyRoles'
import { ensureHomesFromStrongNotes } from '../../domain/arranging/proposeStrongRoots'
import type { ArrangementProject } from '../../domain/arranging/types'

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

/** Assign Strong/Passing on unknown melody notes (preserves user overrides). */
export function ensureMelodyRoles(project: ArrangementProject): ArrangementProject {
  const needs = project.melody.some((n) => n.role === 'unknown')
  if (!needs) return project
  return {
    ...project,
    melody: assignMelodyRoles(project.melody, { ppq: project.ppq }),
  }
}

/**
 * Auto path: roles + Strong-note homes when the user has not set pillars.
 * Seed extracts often mark every Lead note Strong — force duration/beat/phrase
 * defaults on Auto so Passing exists. Guided (pillars present) keeps overrides.
 */
export function prepareAutoPathOptimize(
  project: ArrangementProject,
  deps?: PathOptimizeDeps,
): ArrangementProject {
  const auto = project.pillars.length === 0
  const withRoles = auto
    ? {
        ...project,
        melody: assignMelodyRoles(
          project.melody,
          {
            ppq: project.ppq,
            tonality: project.tonality,
            promoteChangePoints: true,
            promoteCoverage: true,
          },
          { force: true },
        ),
      }
    : ensureMelodyRoles(project)
  return ensureHomesFromStrongNotes(withRoles, {
    idGen: deps?.idGen,
    force: auto,
  })
}

export function pathOptimize(
  project: Parameters<typeof pathOptimizeDomain>[0],
  opts: PathOptimizeOpts,
  deps?: PathOptimizeDeps,
): Promise<PathOptimizeResult> {
  return pathOptimizeDomain(prepareAutoPathOptimize(project, deps), opts, deps)
}
