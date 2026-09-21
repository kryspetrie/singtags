import {
  applyRoleLabels,
  labelMelodyRoles,
} from '../../domain/arranging/melodyRoles'
import type { ArrangementProject } from '../../domain/arranging/types'

export function autoLabelMelodyRoles(
  project: ArrangementProject,
  opts: { force?: boolean } = {},
): ArrangementProject {
  const labels = labelMelodyRoles({
    melody: project.melody,
    pillars: project.pillars,
    force: opts.force,
  })
  return {
    ...project,
    melody: applyRoleLabels(project.melody, labels),
  }
}
