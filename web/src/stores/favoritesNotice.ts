/**
 * User-facing snackbar/toast payloads after favorite actions (add, remove, cache).
 * Kept separate from the favorites store so notice logic stays pure and testable.
 */
import type { TagDetail, TagSummary } from '../types/tag'
import type { StarredTagRecord } from '../offline/favoritesDb'

/** Transient UI notice after a favorite add/remove or offline cache update. */
export type FavoritesNotice =
  | { type: 'cached'; audio: boolean; sheets: boolean }
  | { type: 'favorited' }
  | { type: 'removed' }
  | { type: 'text'; message: string }

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
  if (rec.quotaWarning) return { type: 'text', message: rec.quotaWarning }
  if (options.metadataOnly) return { type: 'favorited' }

  const hasAudio = !!(rec.audioBlobs && Object.keys(rec.audioBlobs).length)
  const pages = detail?.sheet_pages ?? summary.sheetPages ?? []
  const hasSheets = !!(rec.sheetBlobs?.length) || !!(options.skipSheets && pages.length > 0)

  if (hasAudio || hasSheets) {
    return { type: 'cached', audio: hasAudio, sheets: hasSheets }
  }
  return { type: 'favorited' }
}
