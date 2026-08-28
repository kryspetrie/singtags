import { describe, expect, it } from 'vitest'
import type { StarredTagRecord } from '../offline/starredDb'
import { sortStarredRecords } from './starredSort'

function rec(
  tagId: number,
  partial: Partial<StarredTagRecord> & {
    title?: string | null
    arranger?: string | null
    key?: string | null
    rating?: number | null
    starredAt?: string
  } = {},
): StarredTagRecord {
  const {
    title = `Tag ${tagId}`,
    arranger = null,
    key = null,
    rating = null,
    starredAt = '2026-01-01T00:00:00.000Z',
    ...rest
  } = partial
  return {
    tagId,
    starredAt,
    summary: {
      id: tagId,
      title,
      arranger,
      key,
      rating,
      type: null,
      collection: null,
      hasSheet: false,
      audioParts: [],
      sheet: null,
    },
    detail: null,
    offlineMedia: false,
    ...rest,
  }
}

describe('sortStarredRecords', () => {
  it('sorts by date starred', () => {
    const rows = [
      rec(1, { starredAt: '2026-01-01T00:00:00.000Z', title: 'A' }),
      rec(2, { starredAt: '2026-01-03T00:00:00.000Z', title: 'B' }),
      rec(3, { starredAt: '2026-01-02T00:00:00.000Z', title: 'C' }),
    ]
    expect(sortStarredRecords(rows, 'starred-new').map((r) => r.tagId)).toEqual([2, 3, 1])
    expect(sortStarredRecords(rows, 'starred-old').map((r) => r.tagId)).toEqual([1, 3, 2])
  })

  it('sorts by title, key, id, and rating', () => {
    const rows = [
      rec(3, { title: 'Zebra', key: 'G', rating: 2 }),
      rec(1, { title: 'Alpha', key: 'C', rating: 5 }),
      rec(2, { title: 'Beta', key: 'F', rating: 5 }),
    ]
    expect(sortStarredRecords(rows, 'title').map((r) => r.tagId)).toEqual([1, 2, 3])
    expect(sortStarredRecords(rows, 'key').map((r) => r.tagId)).toEqual([1, 2, 3])
    expect(sortStarredRecords(rows, 'id').map((r) => r.tagId)).toEqual([1, 2, 3])
    expect(sortStarredRecords(rows, 'rating').map((r) => r.tagId)).toEqual([1, 2, 3])
  })

  it('sorts by arranger last name', () => {
    const rows = [
      rec(1, { title: 'A', arranger: 'Alice Smith' }),
      rec(2, { title: 'B', arranger: 'Bob Adams' }),
    ]
    expect(sortStarredRecords(rows, 'arranger-last').map((r) => r.tagId)).toEqual([2, 1])
    expect(sortStarredRecords(rows, 'arranger').map((r) => r.tagId)).toEqual([1, 2])
  })
})
