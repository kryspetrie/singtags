import { describe, expect, it } from 'vitest'
import { noticeFromStarRecord, type StarsNotice } from './starNotice'
import type { StarredTagRecord } from '../offline/starredDb'
import type { TagSummary } from '../types/tag'

const summary: TagSummary = {
  id: 1,
  title: 'Tag',
  arranger: null,
  key: 'C',
  rating: null,
  type: null,
  collection: null,
  hasSheet: true,
  audioParts: ['lead'],
  sheet: null,
  sheetPages: ['sheets/1/page.webp'],
}

function rec(partial: Partial<StarredTagRecord> = {}): StarredTagRecord {
  return {
    tagId: 1,
    starredAt: '2026-01-01T00:00:00.000Z',
    summary,
    detail: null,
    offlineMedia: false,
    ...partial,
  }
}

describe('noticeFromStarRecord', () => {
  it('returns cached with audio and sheets icons when both apply', () => {
    const notice = noticeFromStarRecord(
      rec({
        audioBlobs: { lead: { path: 'x', mime: 'audio/mp4', data: new ArrayBuffer(1) } },
        sheetBlobs: [{ path: 'p', mime: 'image/webp', data: new ArrayBuffer(1) }],
      }),
      summary,
      null,
    )
    expect(notice).toEqual({ type: 'cached', audio: true, sheets: true } satisfies StarsNotice)
  })

  it('shows sheet icon when sheets come from library pack', () => {
    const notice = noticeFromStarRecord(
      rec({
        audioBlobs: { lead: { path: 'x', mime: 'audio/mp4', data: new ArrayBuffer(1) } },
        offlineMedia: true,
      }),
      summary,
      null,
      { skipSheets: true },
    )
    expect(notice).toEqual({ type: 'cached', audio: true, sheets: true })
  })

  it('returns starred for metadata-only', () => {
    expect(noticeFromStarRecord(rec(), summary, null, { metadataOnly: true })).toEqual({
      type: 'starred',
    })
  })
})
