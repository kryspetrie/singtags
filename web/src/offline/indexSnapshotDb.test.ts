/**
 * @vitest-environment happy-dom
 */
import 'fake-indexeddb/auto'
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import {
  getCatalogSnapshotIdb,
  getLyricsSnapshotIdb,
  putCatalogSnapshotIdb,
  putLyricsSnapshotIdb,
  clearIndexSnapshotsIdb,
} from './indexSnapshotDb'
import { loadCatalogSnapshotAsync } from '../lib/catalogSnapshot'
import { loadLyricsSnapshotAsync } from '../lib/lyricsSnapshot'

describe('indexSnapshotDb', () => {
  beforeEach(async () => {
    await clearIndexSnapshotsIdb()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('persists and loads catalog snapshot', async () => {
    await putCatalogSnapshotIdb(
      [
        {
          id: 1,
          title: 'Test',
          arranger: null,
          key: null,
          rating: null,
          type: null,
          collection: null,
          hasSheet: false,
          audioParts: [],
          sheet: null,
        },
      ],
      { foo: ['bar'] },
    )
    const rec = await getCatalogSnapshotIdb()
    expect(rec?.tags[0]?.title).toBe('Test')
    expect(rec?.expansions).toEqual({ foo: ['bar'] })
  })

  it('persists and loads lyrics snapshot', async () => {
    await putLyricsSnapshotIdb([
      { id: 1, lyrics: 'hello world' },
      { id: 2, lyrics: 'second tag' },
    ])
    const rec = await getLyricsSnapshotIdb()
    expect(rec?.docs).toHaveLength(2)
    expect(rec?.docs[0]?.lyrics).toBe('hello world')
  })

  it('loadCatalogSnapshotAsync prefers IndexedDB over localStorage', async () => {
    const store = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => store.set(k, v),
      removeItem: (k: string) => store.delete(k),
    })
    vi.stubGlobal('sessionStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => store.set(k, v),
      removeItem: (k: string) => store.delete(k),
    })
    store.set(
      'singtags.catalogSnapshot.v1',
      JSON.stringify({
        tags: [
          {
            id: 1,
            title: 'Local',
            arranger: null,
            key: null,
            rating: null,
            type: null,
            collection: null,
            hasSheet: false,
            audioParts: [],
            sheet: null,
          },
        ],
        expansions: {},
      }),
    )
    await putCatalogSnapshotIdb(
      [
        {
          id: 1,
          title: 'Local',
          arranger: null,
          key: null,
          rating: null,
          type: null,
          collection: null,
          hasSheet: false,
          audioParts: [],
          sheet: null,
        },
        {
          id: 2,
          title: 'From IDB',
          arranger: null,
          key: null,
          rating: null,
          type: null,
          collection: null,
          hasSheet: false,
          audioParts: [],
          sheet: null,
        },
      ],
      {},
    )
    const snap = await loadCatalogSnapshotAsync()
    expect(snap?.tags).toHaveLength(2)
    expect(snap?.tags[1]?.title).toBe('From IDB')
  })

  it('loadLyricsSnapshotAsync returns persisted docs', async () => {
    await putLyricsSnapshotIdb([{ id: 99, lyrics: 'snap lyrics' }])
    const docs = await loadLyricsSnapshotAsync()
    expect(docs?.[0]?.id).toBe(99)
  })
})
