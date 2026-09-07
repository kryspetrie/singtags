/**
 * @vitest-environment happy-dom
 */
import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { cacheTagMediaToPacks } from './cacheTagMedia'
import { audioPack, sheetsPack } from './libraryPack'
import { listStarred } from './favoritesDb'
import { mediaUrl, tagDetailUrl } from '../lib/mediaUrl'
import type { TagDetail } from '../types/tag'

const detail: TagDetail = {
  tag_id: 42,
  title: 'Load Me',
  arranger: 'A',
  key: 'C',
  audio: {
    lead: 'media/42/lead.m4a',
    lead_lofi: 'media/42/lead.solo.opus',
  },
  sheet_pages: ['sheets/42/pages/page-01.webp'],
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

describe('cacheTagMediaToPacks', () => {
  beforeEach(async () => {
    await resetDbs()
    await sheetsPack.clear()
    await audioPack.clear()
    vi.restoreAllMocks()
  })

  it('caches sheets and audio into packs without favoriting', async () => {
    const meta = new Uint8Array(new TextEncoder().encode(JSON.stringify(detail)))
    const sheet = new Uint8Array(128).fill(7)
    const audio = new Uint8Array(128).fill(9)
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input)
        if (url.includes('metadata.json')) {
          return new Response(meta, {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        }
        if (url.includes('page-01.webp')) {
          return new Response(sheet, {
            status: 200,
            headers: { 'Content-Type': 'image/webp' },
          })
        }
        if (url.includes('lead')) {
          return new Response(audio, {
            status: 200,
            headers: { 'Content-Type': 'audio/opus' },
          })
        }
        return new Response('missing', { status: 404 })
      }),
    )

    await cacheTagMediaToPacks(detail, { sheets: true, audio: true })

    expect(await sheetsPack.has(tagDetailUrl(42))).toBe(true)
    expect(await sheetsPack.has(mediaUrl('sheets/42/pages/page-01.webp'))).toBe(true)
    expect(await audioPack.has(mediaUrl('media/42/lead.solo.opus'))).toBe(true)
    expect(await listStarred()).toEqual([])
  })

  it('can load sheets only', async () => {
    const meta = new Uint8Array(new TextEncoder().encode(JSON.stringify({ tag_id: 42 })))
    const sheet = new Uint8Array(128).fill(3)
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input)
        if (url.includes('metadata.json')) {
          return new Response(meta, {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        }
        if (url.includes('page-01.webp')) {
          return new Response(sheet, {
            status: 200,
            headers: { 'Content-Type': 'image/webp' },
          })
        }
        return new Response('missing', { status: 404 })
      }),
    )

    await cacheTagMediaToPacks(detail, { sheets: true, audio: false })

    expect(await sheetsPack.has(mediaUrl('sheets/42/pages/page-01.webp'))).toBe(true)
    expect(await audioPack.count()).toBe(0)
    expect(await listStarred()).toEqual([])
  })
})
