import type { ArrangementRepository } from '../../../ports/ArrangementRepository'
import {
  createEmptyArrangement,
  type ArrangementProject,
} from '../../../domain/arranging/types'

const STORAGE_KEY = 'arranging.projects.v1'

function migrate(p: ArrangementProject): ArrangementProject {
  return {
    ...createEmptyArrangement(p.title, { id: p.id, now: p.createdAt }),
    ...p,
    contestProfile: p.contestProfile ?? 'sai11',
    tuningMode: p.tuningMode ?? 'equal',
    tonalityMode: p.tonalityMode ?? 'major',
  }
}

/** Sync localStorage wrapped as async — migration fallback / tests. */
export function createLocalStorageRepository(
  storage: Pick<Storage, 'getItem' | 'setItem'> = localStorage,
): ArrangementRepository {
  return {
    async loadAll(): Promise<ArrangementProject[]> {
      try {
        const raw = storage.getItem(STORAGE_KEY)
        if (!raw) return []
        const parsed = JSON.parse(raw) as ArrangementProject[]
        if (!Array.isArray(parsed)) return []
        return parsed.map(migrate)
      } catch {
        return []
      }
    },
    async saveAll(projects: readonly ArrangementProject[]): Promise<void> {
      storage.setItem(STORAGE_KEY, JSON.stringify(projects))
    },
  }
}

export function createMemoryRepository(
  seed: ArrangementProject[] = [],
): ArrangementRepository {
  let data = [...seed]
  return {
    loadAll: async () => [...data],
    saveAll: async (projects) => {
      data = [...projects]
    },
  }
}
