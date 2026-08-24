import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useCatalogStore } from './catalog'
import { downloadFilename } from '../download/transform'
import { buildZip, MAX_QUEUE_TRACKS } from '../download/zip'
import { transformFilenameSuffix } from '../types/audio'

describe('catalog store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.restoreAllMocks()
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
    catalog.patchFilters({ hasSheet: true, minRating: 4, keys: ['Bb'] })
    expect(catalog.results.map((t) => t.id)).toEqual([1])
    catalog.syncFromRoute({ q: '', sheet: '1', min: '4', key: 'Bb' }, 'title')
    expect(catalog.filters.hasSheet).toBe(true)
    expect(catalog.filters.minRating).toBe(4)
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
})

describe('download helpers', () => {
  it('names transformed files', () => {
    expect(downloadFilename('lead', 'mp3', { pitchSemitones: 2, speed: 0.95 })).toBe(
      'lead_+2st_95pct.mp3',
    )
    expect(downloadFilename('lead', 'mp4', { pitchSemitones: 2, speed: 1 })).toBe('lead_+2st.mp4')
    expect(downloadFilename('lead', 'mp4', { pitchSemitones: 0, speed: 1 })).toBe('lead.mp4')
    expect(transformFilenameSuffix({ pitchSemitones: 0, speed: 1 })).toBe('')
  })

  it('builds zip bytes', () => {
    const data = buildZip([{ name: 'a/lead.mp4', data: new Uint8Array([1, 2, 3]) }])
    expect(data.byteLength).toBeGreaterThan(10)
    expect(MAX_QUEUE_TRACKS).toBe(100)
  })
})
