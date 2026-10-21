/**
 * Fetch bundled gold-standard polecat pitch Tag Studio projects and sync the library.
 * Files live under ``/tag-studio/polecat-pitch-reviews/`` (see polecats/stacks_to_tag_studio.py).
 *
 * Imports missing gold seeds only (never overwrites on reload). Removes other
 * ``seed-polecat-pitch-*`` auto-seeds that are no longer in the index
 * (keeps user-owned projects untouched). Use ``force`` for explicit resync.
 */
import type { Clock } from '../../ports/Clock'
import type { TagRollRepository } from '../../ports/TagRollRepository'
import { isTagRollSeedDismissed } from '../../lib/tagRoll/seedLibraryPrefs'
import { normalizeTagRollProject } from '../../lib/tagRoll/normalize'
import type { TagRollProject } from '../../lib/tagRoll/types'
import { deleteTagRoll, putNewTagRoll } from './persist'

const INDEX_URL = '/tag-studio/polecat-pitch-reviews/index.json'
const SEED_PREFIX = 'seed-polecat-pitch-'

export type PolecatPitchIndexEntry = {
  id: string
  tagId: number
  title: string
  file: string
}

export type PolecatPitchIndex = {
  projects: PolecatPitchIndexEntry[]
  count: number
  gold?: number[]
}

export type ImportPolecatPitchResult = {
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

export type EnsurePolecatPitchOpts = {
  /** Re-import every index entry even when notes/bpm match (dev resync). */
  force?: boolean
}

/**
 * Sync gold polecat seeds on every Tag Studio list refresh.
 */
export async function ensurePolecatPitchReviewProjects(
  repository: TagRollRepository,
  clock: Clock,
  opts?: EnsurePolecatPitchOpts,
): Promise<ImportPolecatPitchResult> {
  const force = opts?.force === true
  const index = await fetchJson<PolecatPitchIndex>(INDEX_URL)
  const result: ImportPolecatPitchResult = {
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
    // Never overwrite an existing seed on ordinary list refresh / reload.
    if (had && !force) {
      result.skipped += 1
      continue
    }
    // User deleted this seed — do not resurrect on every list refresh.
    if (!force && !had && isTagRollSeedDismissed(entry.id)) {
      result.skipped += 1
      continue
    }
    const raw = await fetchJson<unknown>(`/tag-studio/polecat-pitch-reviews/${entry.file}`)
    if (!raw) {
      result.errors.push(`Missing ${entry.file}`)
      continue
    }
    const rawObj = raw as Record<string, unknown>
    const prev = had ? await repository.get(entry.id) : null
    const project = normalizeTagRollProject({
      ...rawObj,
      id: entry.id,
      localEntryId: null,
      // Keep the user's mixer (mute/volume/pan) across seed content refreshes.
      mix: prev?.mix ?? rawObj.mix,
      // Keep Sketch / Declared map if a forced refresh still runs.
      harmonySketch: prev?.harmonySketch ?? rawObj.harmonySketch,
      createdAt: prev?.createdAt ?? now,
      updatedAt: now,
    })
    if (!project || !project.notes.length) {
      result.errors.push(`Invalid ${entry.file}`)
      continue
    }
    try {
      if (had) await deleteTagRoll(repository, entry.id)
      await putNewTagRoll(repository, project as TagRollProject, clock)
      existing.add(entry.id)
      if (had) result.refreshed += 1
      else result.imported += 1
    } catch (e) {
      result.errors.push(
        `${entry.file}: ${e instanceof Error ? e.message : 'import failed'}`,
      )
    }
  }
  return result
}
