/**
 * User-facing snackbar/toast payloads after favorite actions (add, remove, cache).
 * Kept separate from the favorites store so notice logic stays pure and testable.
 */
import type { TagDetail, TagSummary } from '../types/tag'
import type { StarredTagRecord } from '../offline/favoritesDb'

/** Transient UI notice after a favorite add/remove or offline cache update. */
export type FavoritesNotice =
  | { type: 'cached'; audio: boolean; sheets: boolean; tagIds: number[] }
  | { type: 'favorited'; tagIds: number[] }
  | { type: 'removed' }
  | { type: 'text'; message: string; tagIds?: number[] }

/** Plain-text label for snackbars / status lines. */
export function formatFavoritesNotice(n: FavoritesNotice): string {
  if (n.type === 'cached') {
    if (n.audio && n.sheets) return 'Favorited · audio and sheets saved'
    if (n.audio) return 'Favorited · audio saved'
    if (n.sheets) return 'Favorited · sheets saved'
    return 'Favorited'
  }
  if (n.type === 'favorited') return 'Favorited'
  if (n.type === 'removed') return 'Removed from favorites'
  return n.message
}

/**
 * Tag ids that can be offered “Add to collection” from a favorites snackbar.
 * @returns Non-empty id list, or `null` when the notice should not offer that action.
 */
export function noticeCollectionTagIds(n: FavoritesNotice): number[] | null {
  if (n.type === 'favorited' || n.type === 'cached') {
    return n.tagIds.length ? n.tagIds : null
  }
  if (n.type === 'text' && n.tagIds?.length) return n.tagIds
  return null
}

/**
 * Build a user-facing notice from a persisted favorite record and fetch options.
 *
 * @param rec - IndexedDB record from the `starred` store (`StarredTagRecord`).
 * @param summary - Tag summary used when detail is incomplete.
 * @param detail - Full tag detail when available (sheet page list).
 * @param options.metadataOnly - User chose metadata-only favorite (no media fetch).
 * @param options.skipSheets - Sheets were skipped because pack already has them.
 * @returns Notice suitable for `useFavoritesStore.lastNotice`.
 */
export function noticeFromFavoriteRecord(
  rec: StarredTagRecord,
  summary: TagSummary,
  detail: TagDetail | null,
  options: { metadataOnly?: boolean; skipSheets?: boolean } = {},
): FavoritesNotice {
  const tagIds = [rec.tagId]
  if (rec.quotaWarning) return { type: 'text', message: rec.quotaWarning, tagIds }
  if (options.metadataOnly) return { type: 'favorited', tagIds }

  const hasAudio = !!(rec.audioBlobs && Object.keys(rec.audioBlobs).length)
  const pages = detail?.sheet_pages ?? summary.sheetPages ?? []
  const hasSheets = !!(rec.sheetBlobs?.length) || !!(options.skipSheets && pages.length > 0)

  if (hasAudio || hasSheets) {
    return { type: 'cached', audio: hasAudio, sheets: hasSheets, tagIds }
  }
  return { type: 'favorited', tagIds }
}
