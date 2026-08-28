import { arrangerLastName } from '../search/browse'
import { foldText } from '../search/normalize'
import type { StarredTagRecord } from '../offline/starredDb'

export type StarredSortMode =
  | 'custom'
  | 'starred-new'
  | 'starred-old'
  | 'title'
  | 'arranger'
  | 'arranger-last'
  | 'rating'
  | 'key'
  | 'id'

export const STARRED_SORT_OPTIONS: Array<{ id: StarredSortMode; label: string }> = [
  { id: 'custom', label: 'Custom order' },
  { id: 'starred-new', label: 'Date starred (newest)' },
  { id: 'starred-old', label: 'Date starred (oldest)' },
  { id: 'title', label: 'Title A–Z' },
  { id: 'arranger', label: 'Arranger (First Last)' },
  { id: 'arranger-last', label: 'Arranger (Last, First)' },
  { id: 'rating', label: 'Rating' },
  { id: 'key', label: 'Key' },
  { id: 'id', label: 'Tag #' },
]

function cmpStr(a: string | null | undefined, b: string | null | undefined): number {
  return foldText(a ?? '').localeCompare(foldText(b ?? ''), undefined, { sensitivity: 'base' })
}

/**
 * Sort starred records for a non-custom mode (does not mutate input).
 * `custom` is handled by the view via the persisted order list.
 */
export function sortStarredRecords(
  records: readonly StarredTagRecord[],
  mode: Exclude<StarredSortMode, 'custom'>,
): StarredTagRecord[] {
  const copy = [...records]
  switch (mode) {
    case 'starred-new':
      return copy.sort(
        (a, b) => b.starredAt.localeCompare(a.starredAt) || a.tagId - b.tagId,
      )
    case 'starred-old':
      return copy.sort(
        (a, b) => a.starredAt.localeCompare(b.starredAt) || a.tagId - b.tagId,
      )
    case 'title':
      return copy.sort(
        (a, b) =>
          cmpStr(a.summary.title, b.summary.title) || a.tagId - b.tagId,
      )
    case 'arranger':
      return copy.sort(
        (a, b) =>
          cmpStr(a.summary.arranger, b.summary.arranger) ||
          cmpStr(a.summary.title, b.summary.title) ||
          a.tagId - b.tagId,
      )
    case 'arranger-last':
      return copy.sort(
        (a, b) =>
          cmpStr(arrangerLastName(a.summary.arranger), arrangerLastName(b.summary.arranger)) ||
          cmpStr(a.summary.arranger, b.summary.arranger) ||
          cmpStr(a.summary.title, b.summary.title) ||
          a.tagId - b.tagId,
      )
    case 'rating':
      return copy.sort(
        (a, b) =>
          (b.summary.rating ?? 0) - (a.summary.rating ?? 0) ||
          cmpStr(a.summary.title, b.summary.title) ||
          a.tagId - b.tagId,
      )
    case 'key':
      return copy.sort(
        (a, b) =>
          cmpStr(a.summary.key, b.summary.key) ||
          cmpStr(a.summary.title, b.summary.title) ||
          a.tagId - b.tagId,
      )
    case 'id':
      return copy.sort((a, b) => a.tagId - b.tagId)
    default:
      return copy
  }
}

export function isStarredSortMode(v: unknown): v is StarredSortMode {
  return STARRED_SORT_OPTIONS.some((o) => o.id === v)
}
