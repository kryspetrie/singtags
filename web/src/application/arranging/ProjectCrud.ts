import {
  createEmptyArrangement,
  type ArrangementProject,
} from '../../domain/arranging/types'
import type { ArrangementRepository } from '../../ports/ArrangementRepository'
import type { Clock } from '../../ports/Clock'
import type { IdGenerator } from '../../ports/IdGenerator'

export function createProject(
  title: string,
  deps: { idGen: IdGenerator; clock: Clock },
): ArrangementProject {
  return createEmptyArrangement(title, {
    id: deps.idGen.next('arr'),
    now: deps.clock.now(),
  })
}

export async function persistProjects(
  projects: readonly ArrangementProject[],
  repository: ArrangementRepository,
): Promise<void> {
  await repository.saveAll(projects)
}

export async function loadProjects(
  repository: ArrangementRepository,
): Promise<ArrangementProject[]> {
  return repository.loadAll()
}

export async function deleteProject(
  id: string,
  projects: readonly ArrangementProject[],
  repository: ArrangementRepository,
): Promise<ArrangementProject[]> {
  const next = projects.filter((p) => p.id !== id)
  if (repository.remove) await repository.remove(id)
  else await repository.saveAll(next)
  return next
}
