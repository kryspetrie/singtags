/**
 * Sort modes and ordering helpers for the Favorites list.
 * Operates on persisted {@link StarredTagRecord} rows; legacy storage ids may use `starred-*`.
 */

import { foldText } from '../search/normalize'
import type { StarredTagRecord } from '../offline/favoritesDb'

/** User-selectable sort order for the Favorites view (custom drag order is separate). */
export type FavoritesSortMode =
  | 'custom'
  | 'favorited-new'
  | 'favorited-old'
  | 'title'
  | 'rating'
  | 'key'
  | 'id'

/** Labels paired with {@link FavoritesSortMode} ids for the sort picker. */
export const FAVORITES_SORT_OPTIONS: Array<{ id: FavoritesSortMode; label: string }> = [
  { id: 'custom', label: 'Custom order' },
  { id: 'favorited-new', label: 'Date favorited (newest)' },
  { id: 'favorited-old', label: 'Date favorited (oldest)' },
  { id: 'title', label: 'Title' },
  { id: 'rating', label: 'Rating' },
  { id: 'key', label: 'Key' },
  { id: 'id', label: 'Tag #' },
]

/** Case- and punctuation-insensitive string compare for title/key sorts. */
function cmpStr(a: string | null | undefined, b: string | null | undefined): number {
  return foldText(a ?? '').localeCompare(foldText(b ?? ''), undefined, { sensitivity: 'base' })
}

/**
 * Sort favorite records for a non-custom mode (does not mutate input).
 * `custom` is handled by the view via the persisted order list.
 */
export function sortFavoriteRecords(
  records: readonly StarredTagRecord[],
  mode: Exclude<FavoritesSortMode, 'custom'>,
): StarredTagRecord[] {
  const copy = [...records]
  switch (mode) {
    case 'favorited-new':
      return copy.sort(
        (a, b) => b.starredAt.localeCompare(a.starredAt) || a.tagId - b.tagId,
      )
    case 'favorited-old':
      return copy.sort(
        (a, b) => a.starredAt.localeCompare(b.starredAt) || a.tagId - b.tagId,
      )
    case 'title':
      return copy.sort(
        (a, b) =>
          cmpStr(a.summary.title, b.summary.title) || a.tagId - b.tagId,
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

/** Type guard for a valid {@link FavoritesSortMode} id. */
export function isFavoritesSortMode(v: unknown): v is FavoritesSortMode {
  return FAVORITES_SORT_OPTIONS.some((o) => o.id === v)
}

/** Map persisted sort ids (including legacy starred-*) onto current FavoritesSortMode. */
export function normalizeFavoritesSortMode(v: unknown): FavoritesSortMode {
  if (v === 'starred-new') return 'favorited-new'
  if (v === 'starred-old') return 'favorited-old'
  return isFavoritesSortMode(v) ? v : 'custom'
}
