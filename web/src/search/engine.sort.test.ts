import { describe, expect, it } from 'vitest'
import { SearchEngine, sortTags } from './engine'
import { parseQuery } from './query'
import { buildSearchQuery, EMPTY_FILTERS } from './filters'
import type { TagSummary } from '../types/tag'

const tags: TagSummary[] = [
  {
    id: 1,
    title: 'Alpha',
    arranger: 'Zoe',
    key: 'C',
    rating: 2,
    type: 'Barbershop',
    collection: 'A',
    classic: 10,
    year: 1990,
    downloads: 5,
    hasSheet: true,
    audioParts: ['lead'],
    sheet: null,
  },
  {
    id: 2,
    title: 'Beta',
    arranger: 'Ann',
    key: 'G',
    rating: 5,
    type: 'Religious',
    collection: 'B',
    classic: 2,
    year: 2001,
    downloads: 50,
    hasSheet: false,
    audioParts: [],
    sheet: null,
  },
]

describe('sortTags + meta filters', () => {
  it('sorts by each mode', () => {
    expect(sortTags(tags, 'title').map((t) => t.id)).toEqual([1, 2])
    expect(sortTags(tags, 'arranger').map((t) => t.id)).toEqual([2, 1])
    expect(sortTags(tags, 'rating').map((t) => t.id)).toEqual([2, 1])
    expect(sortTags(tags, 'downloads').map((t) => t.id)).toEqual([2, 1])
    expect(sortTags(tags, 'classic').map((t) => t.id)).toEqual([2, 1])
    expect(sortTags(tags, 'year').map((t) => t.id)).toEqual([2, 1])
  })

  it('filters hasAudio / hasSheet / minRating / exclude', () => {
    const engine = new SearchEngine({ tags, expansions: {} })
    expect(engine.search(parseQuery('hasAudio', false)).map((t) => t.id)).toEqual([1])
    expect(engine.search(parseQuery('noSheet', false)).map((t) => t.id)).toEqual([2])
    expect(engine.search(parseQuery('minRating:4', false)).map((t) => t.id)).toEqual([2])
    expect(engine.search(parseQuery('Beta -Beta', false))).toHaveLength(0)
  })

  it('applies collection/type field filters from chips', () => {
    const engine = new SearchEngine({ tags, expansions: {} })
    const q = buildSearchQuery('', { ...EMPTY_FILTERS, types: ['Religious'], collections: ['B'] })
    expect(engine.search(q).map((t) => t.id)).toEqual([2])
  })
})
