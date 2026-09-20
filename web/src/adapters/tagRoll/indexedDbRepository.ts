import {
  deleteTagRollProject,
  getTagRollHistory,
  getTagRollProject,
  listTagRollProjects,
  putTagRollHistory,
  putTagRollProject,
} from '../../offline/tagRollDb'
import type { TagRollRepository } from '../../ports/TagRollRepository'

/** Adapter: IndexedDB Tag Studio repository. */
export function createIndexedDbTagRollRepository(): TagRollRepository {
  return {
    list: listTagRollProjects,
    get: getTagRollProject,
    put: putTagRollProject,
    remove: deleteTagRollProject,
    getHistory: getTagRollHistory,
    putHistory: putTagRollHistory,
  }
}
