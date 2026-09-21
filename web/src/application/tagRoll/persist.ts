import type { Clock } from '../../ports/Clock'
import type { TagRollRepository } from '../../ports/TagRollRepository'
import type { TagRollHistoryRecord } from '../../lib/tagRoll/history'
import type { TagRollProject } from '../../lib/tagRoll/types'

/** Use-case: persist the open project through the repository port. */
export async function persistTagRoll(
  repository: TagRollRepository,
  project: TagRollProject,
  clock: Clock,
): Promise<TagRollProject> {
  const next = {
    ...project,
    updatedAt: clock.now(),
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

/** Use-case: delete a project (and its history) through the repository port. */
export async function deleteTagRoll(
  repository: TagRollRepository,
  id: string,
): Promise<void> {
  await repository.remove(id)
}

/** Use-case: persist undo/redo stacks through the repository port. */
export async function persistTagRollHistory(
  repository: TagRollRepository,
  record: Omit<TagRollHistoryRecord, 'updatedAt'> & { updatedAt?: number },
  clock: Clock,
): Promise<void> {
  await repository.putHistory({
    ...record,
    updatedAt: record.updatedAt ?? clock.now(),
  })
}

/** Use-case: first save of a new/imported project + empty history. */
export async function putNewTagRoll(
  repository: TagRollRepository,
  project: TagRollProject,
  clock: Clock,
): Promise<TagRollProject> {
  const now = clock.now()
  const next = {
    ...project,
    createdAt: project.createdAt || now,
    updatedAt: now,
  }
  await repository.put(next)
  await repository.putHistory({
    projectId: next.id,
    undo: [],
    redo: [],
    updatedAt: now,
  })
  return next
}
