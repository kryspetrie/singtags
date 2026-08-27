import type { TagDetail, TagSummary } from '../types/tag'
import type { StarredTagRecord } from '../offline/starredDb'

export type StarsNotice =
  | { type: 'cached'; audio: boolean; sheets: boolean }
  | { type: 'starred' }
  | { type: 'removed' }
  | { type: 'text'; message: string }

export function noticeFromStarRecord(
  rec: StarredTagRecord,
  summary: TagSummary,
  detail: TagDetail | null,
  options: { metadataOnly?: boolean; skipSheets?: boolean } = {},
): StarsNotice {
  if (rec.quotaWarning) return { type: 'text', message: rec.quotaWarning }
  if (options.metadataOnly) return { type: 'starred' }

  const hasAudio = !!(rec.audioBlobs && Object.keys(rec.audioBlobs).length)
  const pages = detail?.sheet_pages ?? summary.sheetPages ?? []
  const hasSheets = !!(rec.sheetBlobs?.length) || !!(options.skipSheets && pages.length > 0)

  if (hasAudio || hasSheets) {
    return { type: 'cached', audio: hasAudio, sheets: hasSheets }
  }
  return { type: 'starred' }
}
