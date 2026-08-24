/**
 * @vitest-environment happy-dom
 */
import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  blobUrlFromCached,
  getStarred,
  importStarredFile,
  isStarred,
  listStarred,
  parseStarredFile,
  refreshStarMedia,
  removeStarred,
  starTag,
} from './starredDb'
import type { TagDetail, TagSummary } from '../types/tag'

const summary: TagSummary = {
  id: 5,
  title: 'Song',
  arranger: 'A',
  key: 'G',
  rating: 3,
  type: null,
  collection: null,
  hasSheet: true,
  audioParts: ['lead', 'bass'],
  sheet: null,
}

const detail: TagDetail = {
  tag_id: 5,
  title: 'Song',
  arranger: 'A',
  key: 'G',
  audio: { lead: 'media/5/lead.mp4', bass: 'media/5/bass.mp4' },
  sheet_pages: ['sheets/5/p1.webp'],
}

async function resetDb(): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.deleteDatabase('singtags')
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error)
    req.onblocked = () => resolve()
  })
}

describe('starredDb IDB', () => {
  beforeEach(async () => {
    await resetDb()
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(new Uint8Array([9, 9, 9]), { status: 200 })),
    )
  })

  it('stars with media progress and lists/gets/isStarred', async () => {
    const progress: string[] = []
    const rec = await starTag(summary, detail, {
      onProgress: (p) => progress.push(p.label),
    })
    expect(rec.offlineMedia).toBe(true)
    expect(progress.length).toBeGreaterThan(0)
    expect(await isStarred(5)).toBe(true)
    expect((await listStarred()).map((r) => r.tagId)).toEqual([5])
    expect((await getStarred(5))?.summary.title).toBe('Song')
    await removeStarred(5)
    expect(await isStarred(5)).toBe(false)
  })

  it('metadataOnly skips fetch', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const rec = await starTag(summary, detail, { metadataOnly: true })
    expect(fetchMock).not.toHaveBeenCalled()
    expect(rec.offlineMedia).toBe(false)
  })

  it('refreshStarMedia re-caches and import merges', async () => {
    const existing = await starTag(summary, detail, { metadataOnly: true })
    const refreshed = await refreshStarMedia(existing, detail)
    expect(refreshed.starredAt).toBe(existing.starredAt)
    expect(refreshed.offlineMedia).toBe(true)

    const n = await importStarredFile({
      version: 1,
      kind: 'singtags.starred',
      exportedAt: '2026-01-01T00:00:00.000Z',
      tags: [
        {
          starredAt: '2026-02-01T00:00:00.000Z',
          summary: { ...summary, id: 6, title: 'Other' },
          detail: null,
        },
      ],
    })
    expect(n).toBe(1)
    expect(await isStarred(6)).toBe(true)
  })

  it('blobUrlFromCached handles missing', () => {
    expect(blobUrlFromCached(undefined)).toBeNull()
    const url = blobUrlFromCached({ mime: 'text/plain', data: new ArrayBuffer(1) })
    expect(url).toMatch(/^blob:/)
    URL.revokeObjectURL(url!)
  })

  it('parseStarredFile rejects non-objects', () => {
    expect(() => parseStarredFile(null)).toThrow(/Invalid/)
  })
})
