import { strengthenStacks } from '../../domain/arranging/strengthen'
import type { ArrangementProject } from '../../domain/arranging/types'
import type { AutoHarmonizeDeps } from './AutoHarmonize'

export function strengthenArrangement(
  project: ArrangementProject,
  deps: AutoHarmonizeDeps = {},
): ArrangementProject {
  return {
    ...project,
    stacks: strengthenStacks(project, {
      idGen: deps.idGen,
      rankerDeps: deps.rankerDeps,
    }),
  }
}
