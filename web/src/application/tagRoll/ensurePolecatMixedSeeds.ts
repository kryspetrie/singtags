/**
 * Fetch bundled mixed-polecat MusicXML Tag Studio projects and sync the library.
 * Files live under ``/tag-studio/polecat-mixed-seeds/``
 * (see ``publishPolecatMixedSeeds.test.ts`` / polecats/mixed-musicxml/).
 *
 * Imports missing seeds only (never overwrites on reload). Removes other
 * ``seed-polecat-mixed-*`` auto-seeds that are no longer in the index
 * (keeps user-owned projects untouched). Use ``force`` for explicit resync.
 */
import type { Clock } from '../../ports/Clock'
import type { TagRollRepository } from '../../ports/TagRollRepository'
import { isTagRollSeedDismissed } from '../../lib/tagRoll/seedLibraryPrefs'
import { normalizeTagRollProject } from '../../lib/tagRoll/normalize'
import type { TagRollProject } from '../../lib/tagRoll/types'
import { deleteTagRoll, putNewTagRoll } from './persist'

const INDEX_URL = '/tag-studio/polecat-mixed-seeds/index.json'
const SEED_PREFIX = 'seed-polecat-mixed-'

export type PolecatMixedIndexEntry = {
  id: string
  tagId: number
  title: string
  file: string
}

export type PolecatMixedIndex = {
  projects: PolecatMixedIndexEntry[]
  count: number
}

export type ImportPolecatMixedResult = {
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

export type EnsurePolecatMixedOpts = {
  /** Re-import every index entry even when notes/bpm match (dev resync). */
  force?: boolean
}

/**
 * Sync mixed polecat MusicXML seeds on Tag Studio list refresh.
 */
export async function ensurePolecatMixedSeedProjects(
  repository: TagRollRepository,
  clock: Clock,
  opts?: EnsurePolecatMixedOpts,
): Promise<ImportPolecatMixedResult> {
  const force = opts?.force === true
  const index = await fetchJson<PolecatMixedIndex>(INDEX_URL)
  const result: ImportPolecatMixedResult = {
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
    // Explicit force (resync helper) is the only path that re-imports.
    if (had && !force) {
      result.skipped += 1
      continue
    }
    if (!force && !had && isTagRollSeedDismissed(entry.id)) {
      result.skipped += 1
      continue
    }
    const raw = await fetchJson<unknown>(`/tag-studio/polecat-mixed-seeds/${entry.file}`)
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
