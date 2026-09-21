import {
  createFixRegistry,
  type ArrangementLint,
  type FixContext,
  type FixRegistry,
} from '../../domain/arranging/qa'
import type { ArrangementProject } from '../../domain/arranging/types'

export function applyFix(
  project: ArrangementProject,
  lint: ArrangementLint,
  registry: FixRegistry = createFixRegistry(),
  ctx?: FixContext,
): ArrangementProject | null {
  return registry.applyToProject(lint, project, ctx)
}

export function applyAllSafeFixes(
  project: ArrangementProject,
  lints: readonly ArrangementLint[],
  registry: FixRegistry = createFixRegistry(),
  ctx?: FixContext,
): { project: ArrangementProject; applied: string[] } {
  return registry.applyAllSafe(project, lints, ctx)
}

export function canApplyFix(
  project: ArrangementProject,
  lint: ArrangementLint,
  registry: FixRegistry = createFixRegistry(),
): boolean {
  return registry.canFix(lint, project)
}
