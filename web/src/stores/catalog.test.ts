import { beforeEach, describe, expect, it, vi, afterEach } from 'vitest'
import 'fake-indexeddb/auto'
import { createPinia, setActivePinia } from 'pinia'
import { useCatalogStore } from './catalog'
import { putLyricsSnapshotIdb, clearIndexSnapshotsIdb } from '../offline/indexSnapshotDb'
import { downloadFilename } from '../download/transform'
import { buildZip, MAX_QUEUE_TRACKS } from '../download/zip'
import { transformFilenameSuffix } from '../types/audio'

describe('catalog store', () => {
  beforeEach(async () => {
    setActivePinia(createPinia())
    vi.restoreAllMocks()
    await clearIndexSnapshotsIdb()
  })

  it('loads core index and searches', async () => {
    const core = {
      version: 1,
      tags: [
        {
          id: 1,
          title: 'Merry Christmas',
          arranger: 'A',
          key: 'C',
          rating: 4,
          type: 'Barbershop',
          collection: null,
          hasSheet: true,
          audioParts: ['lead'],
          sheet: null,
        },
      ],
    }
    const gz = await new Response(
      new Blob([JSON.stringify(core)]).stream().pipeThrough(new CompressionStream('gzip')),
    ).arrayBuffer()

    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (String(url).includes('core.json.gz')) {
          return new Response(gz, { status: 200 })
        }
        if (String(url).includes('expansions.json')) {
          return new Response(JSON.stringify({ map: {} }), { status: 200 })
        }
        if (String(url).includes('lyrics.json.gz')) {
          return new Response(null, { status: 404 })
        }
        return new Response(null, { status: 404 })
      }),
    )

    const catalog = useCatalogStore()
    await catalog.load()
    expect(catalog.loaded).toBe(true)
    expect(catalog.tags).toHaveLength(1)
    // Results must be available immediately after load (engine assigned before tags).
    expect(catalog.results.map((t) => t.id)).toEqual([1])
    catalog.syncFromRoute({ q: 'christmas' }, 'title')
    expect(catalog.results.map((t) => t.id)).toEqual([1])
  })

  it('refreshes lyric search when the lyrics index loads', async () => {
    const core = {
      version: 1,
      tags: [
        {
          id: 1540,
          title: 'Be Thou My Vision',
          arranger: 'Paul Paddock',
          key: 'D Major',
          rating: 3.4,
          type: 'Other male',
          collection: null,
          hasSheet: true,
          audioParts: ['lead'],
          sheet: null,
        },
      ],
    }
    const coreGz = await new Response(
      new Blob([JSON.stringify(core)]).stream().pipeThrough(new CompressionStream('gzip')),
    ).arrayBuffer()

    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (String(url).includes('core.json.gz')) {
          return new Response(coreGz, { status: 200 })
        }
        if (String(url).includes('expansions.json')) {
          return new Response(JSON.stringify({ map: {} }), { status: 200 })
        }
        if (String(url).includes('lyrics.json.gz')) {
          return new Response(null, { status: 404 })
        }
        return new Response(null, { status: 404 })
      }),
    )

    await putLyricsSnapshotIdb([{ id: 1540, lyrics: "O Lord o' my soul, my soul" }])

    const catalog = useCatalogStore()
    await catalog.load()
    catalog.patchFilters({ fullText: true })
    catalog.queryText = 'my soul'
    catalog.debouncedQuery = 'my soul'
    expect(catalog.results.map((t) => t.id)).toEqual([])

    expect(await catalog.hydrateFromIndexedDb()).toBe(true)
    expect(catalog.lyricsLoaded).toBe(true)
    expect(catalog.results.map((t) => t.id)).toEqual([1540])
  })

  it('applies chip filters immediately', async () => {
    const core = {
      version: 1,
      tags: [
        {
          id: 1,
          title: 'A',
          arranger: 'Paul',
          key: 'Bb',
          rating: 4.5,
          type: 'Barbershop',
          collection: null,
          hasSheet: true,
          audioParts: ['lead'],
          sheet: null,
        },
        {
          id: 2,
          title: 'B',
          arranger: 'Other',
          key: 'C',
          rating: 2,
          type: 'Barbershop',
          collection: null,
          hasSheet: false,
          audioParts: [],
          sheet: null,
        },
      ],
    }
    const gz = await new Response(
      new Blob([JSON.stringify(core)]).stream().pipeThrough(new CompressionStream('gzip')),
    ).arrayBuffer()

    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (String(url).includes('core.json.gz')) {
          return new Response(gz, { status: 200 })
        }
        if (String(url).includes('expansions.json')) {
          return new Response(JSON.stringify({ map: {} }), { status: 200 })
        }
        return new Response(null, { status: 404 })
      }),
    )

    const catalog = useCatalogStore()
    await catalog.load()
    catalog.patchFilters({ hasSheet: true, minRating: 4, arrangers: ['Paul'] })
    expect(catalog.results.map((t) => t.id)).toEqual([1])
    catalog.syncFromRoute({ q: '', sheet: '1', min: '4', arr: 'Paul' }, 'title')
    expect(catalog.filters.hasSheet).toBe(true)
    expect(catalog.filters.minRating).toBe(4)
    expect(catalog.filters.arrangers).toEqual(['Paul'])
  })

  it('supports pagination, selection, neighbors, and route patch', async () => {
    const tags = Array.from({ length: 50 }, (_, i) => ({
      id: i + 1,
      title: `Tag ${i + 1}`,
      arranger: 'A',
      key: 'C',
      rating: 3,
      type: 'Barbershop',
      collection: 'X',
      hasSheet: true,
      audioParts: ['lead'] as const,
      sheet: null,
    }))
    const gz = await new Response(
      new Blob([JSON.stringify({ version: 1, tags })]).stream().pipeThrough(new CompressionStream('gzip')),
    ).arrayBuffer()
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (String(url).includes('core.json.gz')) return new Response(gz, { status: 200 })
        if (String(url).includes('expansions.json')) {
          return new Response(JSON.stringify({ map: {} }), { status: 200 })
        }
        return new Response(null, { status: 404 })
      }),
    )
    const catalog = useCatalogStore()
    await catalog.load()
    expect(catalog.results).toHaveLength(48)
    expect(catalog.hasMoreResults).toBe(true)
    catalog.showMoreResults()
    expect(catalog.results).toHaveLength(50)
    expect(catalog.hasMoreResults).toBe(false)
    catalog.toggleSelect(1)
    catalog.toggleSelect(2)
    expect(catalog.selectedIds.size).toBe(2)
    catalog.clearSelection()
    expect(catalog.selectedIds.size).toBe(0)
    catalog.sortMode = 'id'
    expect(catalog.neighbors(1).next).toBe(2)
    expect(catalog.getById(1)?.title).toBe('Tag 1')
    catalog.clearFilters()
    expect(catalog.filterCount).toBe(0)
    catalog.sortMode = 'rating'
    const patch = catalog.routeQueryPatch()
    expect(patch.sort).toBeUndefined()
  })

  it('falls back to sample manifest when indexes fail', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (String(url).includes('manifest.json')) {
          return new Response(
            JSON.stringify({
              tags: [
                {
                  id: 99,
                  title: 'Fallback',
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
            }),
            { status: 200 },
          )
        }
        return new Response(null, { status: 500 })
      }),
    )
    const catalog = useCatalogStore()
    await catalog.load()
    expect(catalog.loaded).toBe(true)
    expect(catalog.tags[0]?.id).toBe(99)
  })

  it('restores catalog from persistent snapshot when fetch fails', async () => {
    const store = new Map<string, string>()
    const storage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        store.set(k, v)
      },
      removeItem: (k: string) => {
        store.delete(k)
      },
    }
    vi.stubGlobal('sessionStorage', storage)
    vi.stubGlobal('localStorage', storage)
    store.set(
      'singtags.catalogSnapshot.v1',
      JSON.stringify({
        tags: [
          {
            id: 42,
            title: 'Snapshot Tag',
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
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Offline mode — not cached')
      }),
    )
    const catalog = useCatalogStore()
    await catalog.load()
    expect(catalog.loaded).toBe(true)
    expect(catalog.tags.map((t) => t.id)).toEqual([42])
    expect(catalog.error).toBeNull()
  })

  it('hydrates catalog synchronously from snapshot', () => {
    const store = new Map<string, string>()
    const storage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => store.set(k, v),
      removeItem: (k: string) => store.delete(k),
    }
    vi.stubGlobal('localStorage', storage)
    vi.stubGlobal('sessionStorage', storage)
    store.set(
      'singtags.catalogSnapshot.v1',
      JSON.stringify({
        tags: [
          {
            id: 7,
            title: 'Hydrated',
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
    const catalog = useCatalogStore()
    expect(catalog.hydrateFromSnapshot()).toBe(true)
    expect(catalog.loaded).toBe(true)
    expect(catalog.tags[0]?.title).toBe('Hydrated')
  })

  it('hydrates lyrics from IndexedDB on startup', async () => {
    await clearIndexSnapshotsIdb()
    await putLyricsSnapshotIdb([
      { id: 5, lyrics: 'Hello lyrics line' },
    ])
    const catalog = useCatalogStore()
    expect(await catalog.hydrateFromIndexedDb()).toBe(true)
    expect(catalog.lyricsLoaded).toBe(true)
    expect(catalog.lyricsSnippet(5)).toMatch(/Hello lyrics/)
  })
})

describe('download helpers', () => {
  it('names transformed files', () => {
    expect(downloadFilename('lead', 'mp3', { pitchSemitones: 2, speed: 0.95 })).toBe(
      'lead_+2st_95pct.mp3',
    )
    expect(downloadFilename('lead', 'm4a', { pitchSemitones: 2, speed: 1 })).toBe('lead_+2st.m4a')
    expect(downloadFilename('lead', 'm4a', { pitchSemitones: 0, speed: 1 })).toBe('lead.m4a')
    expect(transformFilenameSuffix({ pitchSemitones: 0, speed: 1 })).toBe('')
  })

  it('builds zip bytes', () => {
    const data = buildZip([{ name: 'a/lead.m4a', data: new Uint8Array([1, 2, 3]) }])
    expect(data.byteLength).toBeGreaterThan(10)
    expect(MAX_QUEUE_TRACKS).toBe(100)
  })
})
