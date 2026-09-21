import type { ArrangementProject } from '../domain/arranging/types'

/** Port: persist / load arrangement projects (async for IndexedDB parity with SingTags). */
export interface ArrangementRepository {
  loadAll(): Promise<ArrangementProject[]>
  saveAll(projects: readonly ArrangementProject[]): Promise<void>
  remove?(id: string): Promise<void>
}
