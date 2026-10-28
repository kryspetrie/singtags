/**
 * Add chosen Lilly / golden-song seeds to the Tag Studio library.
 * Skips charts already stored so a load does not replace edits.
 */
import lillyMarleneV2 from '../../lib/tagRoll/defaultProjects/lillyMarleneV2.json'
import {
  LILLY_LIBRARY_SEED_ID,
  librarySeedInLibrary,
  type LibrarySeedOffer,
} from '../../lib/tagRoll/librarySeeds'
import { normalizeTagRollProject } from '../../lib/tagRoll/normalize'
import { markTagRollLibraryInitialized, undismissTagRollSeed } from '../../lib/tagRoll/seedLibraryPrefs'
import type { TagRollProject } from '../../lib/tagRoll/types'
import type { Clock } from '../../ports/Clock'
import type { TagRollRepository } from '../../ports/TagRollRepository'
import { putNewTagRoll } from './persist'

export type ImportLibrarySeedsResult = {
  imported: string[]
  skipped: string[]
  errors: string[]
}

async function fetchJson(url: string): Promise<unknown | null> {
  try {
    const res = await fetch(url, { cache: 'no-cache' })
    if (!res.ok) return null
    return (await res.json()) as unknown
  } catch {
    return null
  }
}

export async function importSelectedLibrarySeeds(
  repository: TagRollRepository,
  clock: Clock,
  offers: readonly LibrarySeedOffer[],
  selectedIds: readonly string[],
  loadJson: (url: string) => Promise<unknown | null> = fetchJson,
): Promise<ImportLibrarySeedsResult> {
  const wanted = new Set(selectedIds)
  const result: ImportLibrarySeedsResult = { imported: [], skipped: [], errors: [] }
  const summaries = await repository.list()
  const now = clock.now()

  for (const offer of offers) {
    if (!wanted.has(offer.id)) continue
    if (librarySeedInLibrary(summaries, offer)) {
      result.skipped.push(offer.label)
      continue
    }
    const raw = await rawForOffer(offer, loadJson)
    if (!raw) {
      result.errors.push(`Could not load ${offer.label}`)
      continue
    }
    const project = normalizeTagRollProject({
      ...raw,
      id: offer.id,
      localEntryId: null,
      createdAt: now,
      updatedAt: now,
    })
    if (!project?.notes.length) {
      result.errors.push(`${offer.label} is not a playable chart`)
      continue
    }
    try {
      await putNewTagRoll(repository, project as TagRollProject, clock)
      undismissTagRollSeed(offer.id)
      summaries.push({
        id: project.id,
        title: project.title,
        updatedAt: project.updatedAt,
        noteCount: project.notes.length,
        bpm: project.bpm,
      })
      result.imported.push(offer.label)
    } catch (e) {
      result.errors.push(
        `${offer.label}: ${e instanceof Error ? e.message : 'import failed'}`,
      )
    }
  }

  if (result.imported.length) markTagRollLibraryInitialized()
  return result
}

async function rawForOffer(
  offer: LibrarySeedOffer,
  loadJson: (url: string) => Promise<unknown | null>,
): Promise<Record<string, unknown> | null> {
  if (offer.id === LILLY_LIBRARY_SEED_ID) {
    return lillyMarleneV2 as Record<string, unknown>
  }
  if (!offer.fileUrl) return null
  const raw = await loadJson(offer.fileUrl)
  if (!raw || typeof raw !== 'object') return null
  return raw as Record<string, unknown>
}
