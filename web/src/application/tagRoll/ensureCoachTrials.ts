/**
 * Fetch bundled Coach trial Tag Studio projects and sync the library.
 * Files live under ``/tag-studio/coach-trials/``.
 *
 * Imports missing trial seeds only — never overwrites on ordinary reload.
 * Keeps user-owned projects untouched.
 */
import type { Clock } from '../../ports/Clock'
import type { TagRollRepository } from '../../ports/TagRollRepository'
import { isTagRollSeedDismissed } from '../../lib/tagRoll/seedLibraryPrefs'
import { normalizeTagRollProject } from '../../lib/tagRoll/normalize'
import type { TagRollProject } from '../../lib/tagRoll/types'
import { deleteTagRoll, putNewTagRoll } from './persist'

const INDEX_URL = '/tag-studio/coach-trials/index.json'
const SEED_PREFIX = 'seed-coach-trial-'

export type CoachTrialIndexEntry = {
  id: string
  title: string
  file: string
}

export type CoachTrialIndex = {
  projects: CoachTrialIndexEntry[]
  count: number
}

export type ImportCoachTrialResult = {
  imported: number
  skipped: number
  refreshed: number
  removed: number
  errors: string[]
}

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { cache: 'no-cache' })
    if (!res.ok) return null
    return (await res.json()) as T
  } catch {
    return null
  }
}

/**
 * Sync Coach trial seeds on Tag Studio list refresh.
 */
export async function ensureCoachTrialProjects(
  repository: TagRollRepository,
  clock: Clock,
): Promise<ImportCoachTrialResult> {
  const index = await fetchJson<CoachTrialIndex>(INDEX_URL)
  const result: ImportCoachTrialResult = {
    imported: 0,
    skipped: 0,
    refreshed: 0,
    removed: 0,
    errors: [],
  }
  if (!index?.projects) return result

  const wanted = new Set(
    index.projects.map((e) => e.id).filter((id): id is string => Boolean(id)),
  )
  const summaries = await repository.list()
  const existing = new Set(summaries.map((s) => s.id))

  for (const s of summaries) {
    if (!s.id.startsWith(SEED_PREFIX)) continue
    if (wanted.has(s.id)) continue
    try {
      await deleteTagRoll(repository, s.id)
      existing.delete(s.id)
      result.removed += 1
    } catch (e) {
      result.errors.push(
        `remove ${s.id}: ${e instanceof Error ? e.message : 'failed'}`,
      )
    }
  }

  const now = clock.now()
  for (const entry of index.projects) {
    if (!entry?.id || !entry.file) continue
    const had = existing.has(entry.id)
    // Never overwrite an existing trial on ordinary list refresh / reload.
    if (had) {
      result.skipped += 1
      continue
    }
    // User deleted this seed — do not resurrect on every list refresh.
    if (isTagRollSeedDismissed(entry.id)) {
      result.skipped += 1
      continue
    }
    const raw = await fetchJson<unknown>(`/tag-studio/coach-trials/${entry.file}`)
    if (!raw) {
      result.errors.push(`Missing ${entry.file}`)
      continue
    }
    const rawObj = raw as Record<string, unknown>
    const project = normalizeTagRollProject({
      ...rawObj,
      id: entry.id,
      localEntryId: null,
      createdAt: now,
      updatedAt: now,
    })
    if (!project || !project.notes.length) {
      result.errors.push(`Invalid ${entry.file}`)
      continue
    }
    try {
      await putNewTagRoll(repository, project as TagRollProject, clock)
      existing.add(entry.id)
      result.imported += 1
    } catch (e) {
      result.errors.push(
        `${entry.file}: ${e instanceof Error ? e.message : 'import failed'}`,
      )
    }
  }
  return result
}
