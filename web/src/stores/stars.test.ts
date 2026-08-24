/**
 * @vitest-environment happy-dom
 */
import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
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
  audio: { lead: 'media/42/lead.mp4' },
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
    expect(stars.isStarred(42)).toBe(true)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(stars.lastMessage).toMatch(/metadata/i)
  })

  it('reports progress when caching media', async () => {
    const stars = useStarsStore()
    const toggle = stars.toggle(summary, detail)
    await toggle
    expect(stars.isStarred(42)).toBe(true)
    const rec = await stars.get(42)
    expect(rec?.offlineMedia).toBe(true)
  })
})
