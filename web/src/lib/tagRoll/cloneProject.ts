/**
 * Deep-clone a Tag Roll project as a new library entry (fresh id / timestamps).
 */
import { newTagRollProjectId } from './ids'
import { normalizeTagRollProject } from './normalize'
import type { TagRollProject } from './types'

export function cloneTagRollProject(
  source: TagRollProject,
  opts?: { title?: string; now?: number },
): TagRollProject | null {
  const now = opts?.now ?? Date.now()
  const title =
    opts?.title?.trim() ||
    (source.title?.trim() ? `${source.title.trim()} (copy)` : 'Untitled (copy)')
  const raw = structuredClone(source) as TagRollProject
  return normalizeTagRollProject({
    ...raw,
    id: newTagRollProjectId(),
    title,
    localEntryId: null,
    createdAt: now,
    updatedAt: now,
  })
}
