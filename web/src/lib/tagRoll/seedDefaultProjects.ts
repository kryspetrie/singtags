/**
 * Bundled Tag Studio starter projects for first-time (empty library) users.
 * Swap or extend {@link TAG_ROLL_DEFAULT_PROJECT_TEMPLATES} when demos change.
 */
import lillyMarleneV2 from './defaultProjects/lillyMarleneV2.json'
import { newTagRollProjectId } from './ids'
import { normalizeTagRollProject } from './normalize'
import type { TagRollProject } from './types'

/** Checked-in project snapshots (stable template ids). */
export const TAG_ROLL_DEFAULT_PROJECT_TEMPLATES: readonly unknown[] = [lillyMarleneV2]

/**
 * Materialize starter projects for an empty library.
 * Each clone gets a fresh id / timestamps so it behaves like a normal user project.
 */
export function createTagRollDefaultProjects(now = Date.now()): TagRollProject[] {
  const out: TagRollProject[] = []
  for (const raw of TAG_ROLL_DEFAULT_PROJECT_TEMPLATES) {
    const base = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
    const normalized = normalizeTagRollProject({
      ...base,
      id: newTagRollProjectId(),
      localEntryId: null,
      createdAt: now,
      updatedAt: now,
    })
    if (normalized) out.push(normalized)
  }
  return out
}
