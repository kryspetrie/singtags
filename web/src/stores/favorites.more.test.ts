/**
 * @vitest-environment happy-dom
 */
import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import * as favoritesDb from '../offline/favoritesDb'
import { useFavoritesStore } from './favorites'
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

describe('favorites store coverage', () => {
  beforeEach(async () => {
    setActivePinia(createPinia())
    await resetDb()
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(new Uint8Array([1, 2, 3]), { status: 200 })),
    )
  })

  it('starMany skips already starred and reports message', async () => {
    const favorites = useFavoritesStore()
    await favorites.toggle(summary, detail, { metadataOnly: true })
    const n = await favorites.starMany([summary, { ...summary, id: 43, title: 'Other' }], {
      metadataOnly: true,
    })
    expect(n).toBe(1)
    expect(favorites.isStarred(43)).toBe(true)
    expect(favorites.lastNotice).toEqual({
      type: 'text',
      message: 'Favorited 1 tag(s)',
      tagIds: [43],
    })
  })

  it('updateOfflineMedia refreshes blobs', async () => {
    const favorites = useFavoritesStore()
    await favorites.toggle(summary, detail, { metadataOnly: true })
    const proxyDetail = new Proxy(detail, {
      get(target, prop, receiver) {
        return Reflect.get(target, prop, receiver)
      },
    })
    await favorites.updateOfflineMedia(42, proxyDetail as TagDetail)
    expect(favorites.error).toBeNull()
    expect(favorites.lastNotice?.type).toBe('cached')
    const rec = await favorites.get(42)
    expect(rec?.offlineMedia).toBe(true)
  })

  it('importFromJson with and without media fetch', async () => {
    const favorites = useFavoritesStore()
    const file = {
      version: 1 as const,
      kind: 'singtags.starred' as const,
      exportedAt: '2026-01-01T00:00:00.000Z',
      tags: [{ starredAt: '2026-01-01T00:00:00.000Z', summary, detail }],
    }
    await favorites.importFromJson(file, false)
    expect(favorites.count).toBe(1)
    expect(favorites.lastNotice?.type).toBe('text')
    expect(favorites.lastNotice && 'message' in favorites.lastNotice && favorites.lastNotice.message).toMatch(/metadata/)
    await favorites.importFromJson(file, true)
    expect(favorites.lastNotice && 'message' in favorites.lastNotice && favorites.lastNotice.message).toMatch(/fetched media/i)
  })

  it('unstar removes record', async () => {
    const favorites = useFavoritesStore()
    await favorites.toggle(summary, detail, { metadataOnly: true })
    await favorites.unstar(42)
    expect(favorites.isStarred(42)).toBe(false)
  })

  it('records error when starTag throws', async () => {
    vi.spyOn(favoritesDb, 'starTag').mockRejectedValueOnce(new Error('boom'))
    const favorites = useFavoritesStore()
    await favorites.toggle(summary, detail, { metadataOnly: true })
    await vi.waitFor(() => expect(favorites.error).toBe('boom'))
  })

  it('exportFile returns portable shape', async () => {
    const favorites = useFavoritesStore()
    await favorites.toggle(summary, detail, { metadataOnly: true })
    expect(favorites.exportFile().kind).toBe('singtags.starred')
    expect(favorites.exportFile().tags).toHaveLength(1)
  })
})
