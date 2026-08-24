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
  audio: { lead: 'media/42/lead.mp4' },
  sheet: 'sheets/42/pages/page-01.webp',
  sheet_pages: ['sheets/42/pages/page-01.webp'],
}

async function resetDb(): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.deleteDatabase('singtags')
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error)
    req.onblocked = () => resolve()
  })
}

describe('stars store coverage', () => {
  beforeEach(async () => {
    setActivePinia(createPinia())
    await resetDb()
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(new Uint8Array([1, 2, 3]), { status: 200 })),
    )
  })

  it('starMany skips already starred and reports message', async () => {
    const stars = useStarsStore()
    await stars.toggle(summary, detail, { metadataOnly: true })
    const n = await stars.starMany([summary, { ...summary, id: 43, title: 'Other' }], {
      metadataOnly: true,
    })
    expect(n).toBe(1)
    expect(stars.isStarred(43)).toBe(true)
    expect(stars.lastMessage).toMatch(/Starred 1/)
  })

  it('updateOfflineMedia refreshes blobs', async () => {
    const stars = useStarsStore()
    await stars.toggle(summary, detail, { metadataOnly: true })
    await stars.updateOfflineMedia(42, detail)
    expect(stars.lastMessage).toMatch(/Offline audio|Offline sheets|metadata|media/i)
    const rec = await stars.get(42)
    expect(rec?.offlineMedia).toBe(true)
  })

  it('importFromJson with and without media fetch', async () => {
    const stars = useStarsStore()
    const file = {
      version: 1 as const,
      kind: 'singtags.starred' as const,
      exportedAt: '2026-01-01T00:00:00.000Z',
      tags: [{ starredAt: '2026-01-01T00:00:00.000Z', summary, detail }],
    }
    await stars.importFromJson(file, false)
    expect(stars.count).toBe(1)
    expect(stars.lastMessage).toMatch(/metadata/)
    await stars.importFromJson(file, true)
    expect(stars.lastMessage).toMatch(/fetched media/i)
  })

  it('unstar removes record', async () => {
    const stars = useStarsStore()
    await stars.toggle(summary, detail, { metadataOnly: true })
    await stars.unstar(42)
    expect(stars.isStarred(42)).toBe(false)
  })

  it('records error when starTag throws', async () => {
    vi.spyOn(starredDb, 'starTag').mockRejectedValueOnce(new Error('boom'))
    const stars = useStarsStore()
    await stars.toggle(summary, detail, { metadataOnly: true })
    expect(stars.error).toBe('boom')
  })

  it('exportFile returns portable shape', async () => {
    const stars = useStarsStore()
    await stars.toggle(summary, detail, { metadataOnly: true })
    expect(stars.exportFile().kind).toBe('singtags.starred')
    expect(stars.exportFile().tags).toHaveLength(1)
  })
})
