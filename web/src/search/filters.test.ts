import { describe, expect, it } from 'vitest'
import {
  activeFilterCount,
  buildSearchQuery,
  EMPTY_FILTERS,
  filtersFromRouteQuery,
  filtersToRouteQuery,
} from './filters'

describe('buildSearchQuery', () => {
  it('merges chip filters over free-text DSL', () => {
    const q = buildSearchQuery('love', {
      ...EMPTY_FILTERS,
      hasSheet: true,
      minRating: 3,
      keys: ['Bb'],
      arrangers: ['Paul Paddock'],
    })
    expect(q.include).toContain('love')
    expect(q.hasSheet).toBe(true)
    expect(q.minRating).toBe(3)
    expect(q.fields.some((f) => f.field === 'key' && f.values.includes('Bb'))).toBe(true)
    expect(q.fields.some((f) => f.field === 'arranger' && f.values[0] === 'Paul Paddock')).toBe(
      true,
    )
  })

  it('chips win over conflicting DSL tokens', () => {
    const q = buildSearchQuery('minRating:2 hasSheet', {
      ...EMPTY_FILTERS,
      minRating: 4,
      hasSheet: false,
    })
    expect(q.minRating).toBe(4)
    expect(q.hasSheet).toBe(false)
  })
  it('ORs multiple keys within one field filter', () => {
    const q = buildSearchQuery('', {
      ...EMPTY_FILTERS,
      keys: ['C', 'G'],
    })
    const keyFilters = q.fields.filter((f) => f.field === 'key')
    expect(keyFilters).toHaveLength(1)
    expect(keyFilters[0]?.values).toEqual(['C', 'G'])
  })
})

describe('filter URL round-trip', () => {
  it('serializes and restores', () => {
    const f = {
      ...EMPTY_FILTERS,
      fullText: true,
      hasAudio: true,
      keys: ['C', 'G'],
      arrangers: ['A'],
    }
    const route = filtersToRouteQuery(f)
    expect(route.ft).toBe('1')
    expect(route.key).toBe('C|G')
    const back = filtersFromRouteQuery(route as Record<string, unknown>)
    expect(back.fullText).toBe(true)
    expect(back.hasAudio).toBe(true)
    expect(back.keys).toEqual(['C', 'G'])
    expect(back.arrangers).toEqual(['A'])
    expect(activeFilterCount(f)).toBe(4)
  })
})
