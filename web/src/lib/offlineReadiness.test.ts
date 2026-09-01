import { beforeEach, describe, expect, it, vi } from 'vitest'

const { listSheetUrls, listAudioUrls, listStarred } = vi.hoisted(() => ({
  listSheetUrls: vi.fn(),
  listAudioUrls: vi.fn(),
  listStarred: vi.fn(),
}))

vi.mock('../offline/libraryPack', () => ({
  sheetsPack: { listUrls: listSheetUrls },
  audioPack: { listUrls: listAudioUrls },
}))
vi.mock('../offline/favoritesDb', () => ({ listStarred }))

import {
  buildReadinessFromUrlLists,
  loadOfflineReadinessIndex,
  matchesCachedFilter,
  tagIdFromMediaPath,
} from './offlineReadiness'

describe('offline readiness', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('extracts tag ids from relative and absolute media paths', () => {
    expect(tagIdFromMediaPath('sheets/31/pages/x.webp')).toBe(31)
    expect(tagIdFromMediaPath('media/31/lead.solo.opus')).toBe(31)
    expect(tagIdFromMediaPath('https://cdn.example.test/assets/media/42/bass.opus?x=1')).toBe(42)
    expect(tagIdFromMediaPath('/prefix/sheets/77/pages/1.webp')).toBe(77)
    expect(tagIdFromMediaPath('indexes/core.json.gz')).toBeNull()
  })

  it('merges pack URLs and favorite blobs by tag', () => {
    const ready = buildReadinessFromUrlLists(
      ['sheets/31/pages/1.webp', 'https://cdn.test/sheets/40/pages/1.webp'],
      ['media/31/lead.opus', 'media/50/tenor.opus'],
      [
        { tagId: 40, audioBlobs: { bass: {} } },
        { tagId: 60, sheetBlobs: [{}] },
        { tagId: 70, sheetBlobs: [], audioBlobs: {} },
      ],
    )

    expect(ready.get(31)).toEqual({ sheets: true, audio: true })
    expect(ready.get(40)).toEqual({ sheets: true, audio: true })
    expect(ready.get(50)).toEqual({ sheets: false, audio: true })
    expect(ready.get(60)).toEqual({ sheets: true, audio: false })
    expect(ready.has(70)).toBe(false)
  })

  it('matches every cached filter, treating a missing entry as not cached', () => {
    const sheets = { sheets: true, audio: false }
    expect(matchesCachedFilter(sheets, null)).toBe(true)
    expect(matchesCachedFilter(sheets, 'any')).toBe(true)
    expect(matchesCachedFilter(sheets, 'sheets')).toBe(true)
    expect(matchesCachedFilter(sheets, 'audio')).toBe(false)
    expect(matchesCachedFilter(sheets, 'both')).toBe(false)
    expect(matchesCachedFilter(sheets, 'none')).toBe(false)
    expect(matchesCachedFilter(undefined, 'none')).toBe(true)
  })

  it('loads each bulk source once', async () => {
    listSheetUrls.mockResolvedValue(['sheets/1/pages/1.webp'])
    listAudioUrls.mockResolvedValue(['media/2/lead.opus'])
    listStarred.mockResolvedValue([{ tagId: 3, sheetBlobs: [{}] }])

    const ready = await loadOfflineReadinessIndex()

    expect(listSheetUrls).toHaveBeenCalledTimes(1)
    expect(listAudioUrls).toHaveBeenCalledTimes(1)
    expect(listStarred).toHaveBeenCalledTimes(1)
    expect([...ready.keys()]).toEqual([1, 2, 3])
  })
})
