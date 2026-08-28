/**
 * @vitest-environment happy-dom
 */
import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildZip } from '../download/zip'
import {
  clearAllOfflineData,
  exportOfflineCacheZip,
  importOfflineCacheZip,
  packUrlFromZipPath,
  urlToRelativePath,
} from './cacheManage'
import { mediaBaseUrl, mediaUrl } from '../lib/mediaUrl'
import { sheetsPack, audioPack } from './libraryPack'
import { getStarred, listStarred, putStarred, type StarredTagRecord } from './starredDb'
import type { TagDetail, TagSummary } from '../types/tag'

const summary: TagSummary = {
  id: 9,
  title: 'Cache Tag',
  arranger: 'A',
  key: 'C',
  rating: 4,
  type: 'Barbershop',
  collection: null,
  hasSheet: true,
  audioParts: ['lead'],
  sheet: null,
}

const detail: TagDetail = {
  tag_id: 9,
  title: 'Cache Tag',
  arranger: 'A',
  key: 'C',
  audio: { lead: 'media/9/lead.m4a' },
  sheet_pages: ['sheets/9/pages/page-01.webp'],
}

async function resetDbs(): Promise<void> {
  for (const name of ['singtags', 'singtags-offline']) {
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.deleteDatabase(name)
      req.onsuccess = () => resolve()
      req.onerror = () => reject(req.error)
      req.onblocked = () => resolve()
    })
  }
}

describe('cacheManage', () => {
  beforeEach(async () => {
    await resetDbs()
    localStorage.clear()
    await sheetsPack.clear()
    await audioPack.clear()
    vi.restoreAllMocks()
  })

  it('maps media URLs back to relative paths', () => {
    expect(urlToRelativePath(`${mediaBaseUrl()}/sheets/1/page.webp`)).toBe('sheets/1/page.webp')
    expect(urlToRelativePath('https://example.com/nope')).toBeNull()
  })

  it('maps pack zip paths back to media URLs', () => {
    expect(packUrlFromZipPath('sheets', 'packs/sheets/sheets/1/page.webp')).toBe(
      mediaUrl('sheets/1/page.webp'),
    )
    expect(
      packUrlFromZipPath(
        'audio',
        `packs/audio/by-url/${encodeURIComponent('https://cdn.example/a.m4a')}`,
      ),
    ).toBe('https://cdn.example/a.m4a')
  })

  it('clears packs, starred data, and catalog flag', async () => {
    await sheetsPack.put(
      `${mediaBaseUrl()}/sheets/x.webp`,
      new Response(new Uint8Array([1, 2]), { status: 200 }),
    )
    await putStarred({
      tagId: 9,
      starredAt: '2026-01-01T00:00:00.000Z',
      summary,
      detail,
      offlineMedia: true,
    } satisfies StarredTagRecord)
    localStorage.setItem('singtags.catalogCachedAt', '2026-01-01T00:00:00.000Z')

    await clearAllOfflineData()

    expect(await sheetsPack.count()).toBe(0)
    expect(localStorage.getItem('singtags.catalogCachedAt')).toBeNull()
  })

  it('exports cached data as a zip', async () => {
    const click = vi.fn()
    vi.stubGlobal(
      'URL',
      class {
        static createObjectURL = vi.fn(() => 'blob:zip')
        static revokeObjectURL = vi.fn()
      },
    )
    vi.stubGlobal('document', {
      createElement: () => ({ click, href: '', download: '' }),
    })

    await putStarred({
      tagId: 9,
      starredAt: '2026-01-01T00:00:00.000Z',
      summary,
      detail,
      offlineMedia: true,
      audioBlobs: {
        lead: {
          path: 'media/9/lead.m4a',
          mime: 'audio/mp4',
          data: new Uint8Array([3, 4, 5]).buffer,
        },
      },
    } satisfies StarredTagRecord)

    const result = await exportOfflineCacheZip()
    expect(result.fileCount).toBeGreaterThan(0)
    expect(result.bytes).toBeGreaterThan(0)
    expect(click).toHaveBeenCalled()
  })

  it('imports offline cache zip into packs and starred', async () => {
    const zip = buildZip([
      {
        name: 'manifest.json',
        data: new TextEncoder().encode(
          JSON.stringify({
            version: 1,
            kind: 'singtags.offline-cache',
            exportedAt: '2026-01-01T00:00:00.000Z',
            sheetsFiles: 1,
            audioFiles: 1,
            starredTags: 1,
          }),
        ),
      },
      {
        name: 'packs/sheets/sheets/9/pages/page-01.webp',
        data: new Uint8Array([1, 2, 3]),
      },
      {
        name: 'packs/audio/media/9/lead.m4a',
        data: new Uint8Array([4, 5, 6]),
      },
      {
        name: 'starred/starred.tags.json',
        data: new TextEncoder().encode(
          JSON.stringify({
            version: 1,
            kind: 'singtags.starred',
            exportedAt: '2026-01-01T00:00:00.000Z',
            tags: [{ starredAt: '2026-01-01T00:00:00.000Z', summary, detail }],
          }),
        ),
      },
      {
        name: 'starred/9/sheets/page-01.webp',
        data: new Uint8Array([7, 8]),
      },
      {
        name: 'starred/9/audio/lead.m4a',
        data: new Uint8Array([9, 10, 11]),
      },
    ])

    const result = await importOfflineCacheZip(zip)
    expect(result).toEqual({
      sheetsFiles: 1,
      audioFiles: 1,
      starredTags: 1,
      pitchPipePrefs: false,
    })
    expect(await sheetsPack.has(mediaUrl('sheets/9/pages/page-01.webp'))).toBe(true)
    expect(await audioPack.has(mediaUrl('media/9/lead.m4a'))).toBe(true)

    const rec = await getStarred(9)
    expect(rec?.offlineMedia).toBe(true)
    expect(rec?.sheetBlobs?.[0]?.path).toBe('sheets/9/pages/page-01.webp')
    expect(rec?.audioBlobs?.lead?.mime).toBe('audio/mp4')
    expect(await listStarred()).toHaveLength(1)
  })

  it('imports pitch pipe preferences from offline cache zip', async () => {
    const zip = buildZip([
      {
        name: 'manifest.json',
        data: new TextEncoder().encode(
          JSON.stringify({
            version: 1,
            kind: 'singtags.offline-cache',
            exportedAt: '2026-01-01T00:00:00.000Z',
            sheetsFiles: 0,
            audioFiles: 0,
            starredTags: 0,
          }),
        ),
      },
      {
        name: 'preferences/pitch-pipe.json',
        data: new TextEncoder().encode(
          JSON.stringify({
            range: 'e3-e4',
            layout: 'piano',
            aHz: 432,
            fineCents: -12,
          }),
        ),
      },
    ])

    const result = await importOfflineCacheZip(zip)
    expect(result.pitchPipePrefs).toBe(true)
    expect(JSON.parse(localStorage.getItem('singtags.pitchPipe.v1')!)).toEqual({
      range: 'e3-e4',
      layout: 'piano',
      aHz: 432,
      fineCents: -12,
    })
  })

  it('rejects non-cache zips', async () => {
    const zip = buildZip([{ name: 'readme.txt', data: new TextEncoder().encode('nope') }])
    await expect(importOfflineCacheZip(zip)).rejects.toThrow(/manifest/)
  })
})
