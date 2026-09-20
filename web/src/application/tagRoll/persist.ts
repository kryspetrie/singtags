import type { Clock } from '../../ports/Clock'
import type { TagRollRepository } from '../../ports/TagRollRepository'
import type { TagRollProject } from '../../lib/tagRoll/types'

/** Use-case: persist the open project through the repository port. */
export async function persistTagRoll(
  repository: TagRollRepository,
  project: TagRollProject,
  clock?: Clock,
): Promise<TagRollProject> {
  const next = {
    ...project,
    updatedAt: clock?.now() ?? Date.now(),
  }
  await repository.put(next)
  return next
}

/** Use-case: load a project by id through the repository port. */
export async function openTagRoll(
  repository: TagRollRepository,
  id: string,
): Promise<TagRollProject | null> {
  return repository.get(id)
}

/** Use-case: list project summaries through the repository port. */
export async function listTagRolls(repository: TagRollRepository) {
  return repository.list()
}
