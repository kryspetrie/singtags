/**
 * IndexedDB-backed repository with localStorage fallback (SingTags-style offline first).
 * Empty IDB after a successful migrate must NOT re-import legacy localStorage.
 */
import type { ArrangementRepository } from '../../../ports/ArrangementRepository'
import {
  deleteArrangingProject,
  listArrangingProjects,
  putAllArrangingProjects,
} from '../../../offline/arrangingDb'
import { createLocalStorageRepository } from './localStorageRepository'

export const LEGACY_MIGRATE_FLAG_KEY = 'arranging:idb-legacy-migrated'

function legacyMigrated(): boolean {
  try {
    return localStorage.getItem(LEGACY_MIGRATE_FLAG_KEY) === '1'
  } catch {
    return false
  }
}

function markLegacyMigrated(): void {
  try {
    localStorage.setItem(LEGACY_MIGRATE_FLAG_KEY, '1')
  } catch {
    /* private mode */
  }
}

export function createIndexedDbRepository(): ArrangementRepository {
  const fallback = createLocalStorageRepository()
  return {
    async loadAll() {
      try {
        const fromIdb = await listArrangingProjects()
        if (fromIdb.length) {
          markLegacyMigrated()
          return fromIdb
        }
        if (legacyMigrated()) return []
        const legacy = await fallback.loadAll()
        if (legacy.length) {
          await putAllArrangingProjects(legacy)
          markLegacyMigrated()
          return legacy
        }
        return []
      } catch {
        return fallback.loadAll()
      }
    },
    async saveAll(projects) {
      try {
        await putAllArrangingProjects(projects)
        markLegacyMigrated()
      } catch {
        await fallback.saveAll(projects)
      }
    },
    async remove(id) {
      try {
        await deleteArrangingProject(id)
      } catch {
        /* fallback saveAll path will rewrite */
      }
    },
  }
}
