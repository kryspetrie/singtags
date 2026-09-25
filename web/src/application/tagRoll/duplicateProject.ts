/**
 * Duplicate a Tag Roll project as a new library entry.
 */
import { cloneTagRollProject } from '../../lib/tagRoll/cloneProject'
import type { TagRollProject } from '../../lib/tagRoll/types'
import type { TagRollRepository } from '../../ports/TagRollRepository'
import type { Clock } from '../../ports/Clock'
import { openTagRoll, putNewTagRoll } from './persist'

export async function duplicateTagRoll(
  repository: TagRollRepository,
  clock: Clock,
  id: string,
): Promise<TagRollProject> {
  const src = await openTagRoll(repository, id)
  if (!src) throw new Error('Project not found')
  const copy = cloneTagRollProject(src, { now: clock.now() })
  if (!copy) throw new Error('Failed to duplicate project')
  return putNewTagRoll(repository, copy, clock)
}
