import type { TagRollHistoryRecord } from '../lib/tagRoll/history'
import type { TagRollProject } from '../lib/tagRoll/types'

export type TagRollProjectSummary = {
  id: string
  title: string
  updatedAt: number
  noteCount: number
  bpm: number
}

/** Port: persist / load Tag Studio projects (IndexedDB today). */
export interface TagRollRepository {
  list(): Promise<TagRollProjectSummary[]>
  get(id: string): Promise<TagRollProject | null>
  put(project: TagRollProject): Promise<void>
  remove(id: string): Promise<void>
  getHistory(projectId: string): Promise<TagRollHistoryRecord>
  putHistory(record: TagRollHistoryRecord): Promise<void>
}
