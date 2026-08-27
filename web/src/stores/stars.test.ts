/**
 * @vitest-environment happy-dom
 */
import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import * as starredDb from '../offline/starredDb'
import { useStarsStore } from './stars'
import type { TagDetail, TagSummary } from '../types/tag'

const summary: TagSummary = {
  id: 42,
  title: 'Test Tag',
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
  tag_id: 42,
  title: 'Test Tag',
  arranger: 'A',
  key: 'C',
  audio: { lead: 'media/42/lead.m4a' },
  sheet: 'sheets/42/pages/page-01.webp',
}

describe('stars store', () => {
  beforeEach(async () => {
    setActivePinia(createPinia())
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.deleteDatabase('singtags')
      req.onsuccess = () => resolve()
      req.onerror = () => reject(req.error)
      req.onblocked = () => resolve()
    })
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(new Uint8Array([1, 2, 3]), { status: 200 })),
    )
  })

  it('stars metadata only without fetching media', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const stars = useStarsStore()
    await stars.toggle(summary, detail, { metadataOnly: true })
    await vi.waitFor(() => expect(stars.isStarred(42)).toBe(true))
    expect(fetchMock).not.toHaveBeenCalled()
    await vi.waitFor(() => expect(stars.lastNotice).toEqual({ type: 'starred' }))
  })

  it('toggle updates starred state immediately', async () => {
    const stars = useStarsStore()
    await stars.toggle(summary, detail, { metadataOnly: true })
    expect(stars.ids.has(42)).toBe(true)
    expect(stars.count).toBe(1)
    await stars.toggle(summary, detail, { metadataOnly: true })
    expect(stars.ids.has(42)).toBe(false)
    expect(stars.count).toBe(0)
  })

  it('tracks per-tag caching progress', async () => {
    let release: () => void = () => {}
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    vi.spyOn(starredDb, 'refreshStarMedia').mockImplementation(async (rec, _detail, opts) => {
      opts?.onProgress?.({ label: 'Audio lead', done: 1, total: 2, ratio: 0.5 })
      await gate
      return { ...rec, offlineMedia: true, audioBlobs: { lead: { path: 'x', mime: 'audio/mp4', data: new ArrayBuffer(0) } } }
    })

    const stars = useStarsStore()
    void stars.toggle(summary, detail)
    await vi.waitFor(() => expect(stars.isTagCaching(42)).toBe(true))
    expect(stars.tagCachingLabel(42)).toBe('Audio lead')
    release()
    await vi.waitFor(() => expect(stars.isTagCaching(42)).toBe(false))
  })
})
