/**
 * Application use-case: default Strong/Passing on unlabeled melody notes.
 */
import {
  assignMelodyRoles,
  labelMelodyRoles,
  applyRoleLabels,
} from '../../domain/arranging/melodyRoles'
import type { ArrangementProject } from '../../domain/arranging/types'

export function autoLabelMelodyRoles(
  project: ArrangementProject,
  opts: { force?: boolean } = {},
): ArrangementProject {
  return {
    ...project,
    melody: assignMelodyRoles(
      project.melody,
      {
        ppq: project.ppq,
        tonality: project.tonality,
        promoteChangePoints: true,
        promoteCoverage: true,
      },
      { force: opts.force },
    ),
  }
}

/** Label results only (for diagnostics / UI reasons). */
export function labelMelodyRolesForProject(
  project: ArrangementProject,
  opts: { force?: boolean } = {},
) {
  return labelMelodyRoles({
    melody: project.melody,
    pillars: project.pillars,
    force: opts.force,
    meter: { ppq: project.ppq },
  })
}

export { applyRoleLabels }
