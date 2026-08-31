import { describe, expect, it } from 'vitest'
import {
  collectTagMediaPaths,
  isFavoriteMediaStale,
  mediaCacheKey,
} from './mediaCacheKey'
import type { TagDetail } from '../types/tag'

function detail(partial: Partial<TagDetail> & Pick<TagDetail, 'tag_id'>): TagDetail {
  return {
    title: 'T',
    arranger: null,
    key: null,
    audio: {},
    ...partial,
  }
}

describe('mediaCacheKey', () => {
  it('prefers downloaded_at and includes sorted media paths', () => {
    const d = detail({
      tag_id: 1,
      downloaded_at: '2026-01-02T00:00:00Z',
      last_updated_remote: 'ignored',
      sheet_pages: ['b.webp', 'a.webp'],
      audio: { lead: 'lead.m4a' },
    })
    expect(collectTagMediaPaths(d)).toEqual(['a.webp', 'b.webp', 'lead.m4a'])
    expect(mediaCacheKey(d)).toBe('2026-01-02T00:00:00Z\0a.webp\nb.webp\nlead.m4a')
  })

  it('falls back to last_updated_remote when downloaded_at is missing', () => {
    const d = detail({
      tag_id: 2,
      last_updated_remote: '2026-08-11 07:28:54',
      audio: { mix: 'mix.m4a' },
    })
    expect(mediaCacheKey(d).startsWith('2026-08-11 07:28:54\0')).toBe(true)
  })

  it('detects stale favorited media when sync marker or paths change', () => {
    const cached = detail({
      tag_id: 3,
      downloaded_at: '2026-01-01T00:00:00Z',
      audio: { lead: 'old.m4a' },
    })
    const live = detail({
      tag_id: 3,
      downloaded_at: '2026-02-01T00:00:00Z',
      audio: { lead: 'old.m4a' },
    })
    expect(
      isFavoriteMediaStale(
        { offlineMedia: true, mediaCacheKey: mediaCacheKey(cached), detail: cached },
        live,
      ),
    ).toBe(true)
    expect(
      isFavoriteMediaStale(
        { offlineMedia: true, mediaCacheKey: mediaCacheKey(live), detail: live },
        live,
      ),
    ).toBe(false)
    expect(isFavoriteMediaStale({ offlineMedia: false, detail: cached }, live)).toBe(false)
  })

  it('treats legacy offline records without fingerprint as stale', () => {
    const live = detail({ tag_id: 4, downloaded_at: '2026-01-01T00:00:00Z', audio: { lead: 'a.m4a' } })
    expect(isFavoriteMediaStale({ offlineMedia: true }, live)).toBe(true)
  })
})
