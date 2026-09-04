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
      yearMin: 2010,
      yearMax: 2020,
      arrangers: ['Paul Paddock'],
    })
    expect(q.include).toContain('love')
    expect(q.hasSheet).toBe(true)
    expect(q.yearMin).toBe(2010)
    expect(q.yearMax).toBe(2020)
    expect(q.fields.some((f) => f.field === 'arranger' && f.values[0] === 'Paul Paddock')).toBe(
      true,
    )
  })

  it('chips win over conflicting DSL tokens', () => {
    const q = buildSearchQuery('hasSheet yearMin:1990', {
      ...EMPTY_FILTERS,
      hasSheet: false,
      yearMin: 2015,
    })
    expect(q.hasSheet).toBe(false)
    expect(q.yearMin).toBe(2015)
  })
})

describe('filter URL round-trip', () => {
  it('serializes and restores', () => {
    const f = {
      ...EMPTY_FILTERS,
      fullText: true,
      hasAudio: true,
      cached: 'both' as const,
      yearMin: 2000,
      yearMax: 2010,
      arrangers: ['A'],
    }
    const route = filtersToRouteQuery(f)
    expect(route.ft).toBe('1')
    expect(route.ymin).toBe('2000')
    expect(route.ymax).toBe('2010')
    expect(route.cache).toBe('both')
    expect(route.key).toBeUndefined()
    const back = filtersFromRouteQuery(route as Record<string, unknown>)
    expect(back.fullText).toBe(true)
    expect(back.hasAudio).toBe(true)
    expect(back.cached).toBe('both')
    expect(back.yearMin).toBe(2000)
    expect(back.yearMax).toBe(2010)
    expect(back.arrangers).toEqual(['A'])
    // fullText is not counted as a chip filter
    expect(activeFilterCount(f)).toBe(4)
  })

  it('ignores invalid cached route filters', () => {
    expect(filtersFromRouteQuery({ cache: 'invalid' }).cached).toBeNull()
  })
})
