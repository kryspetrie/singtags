/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it } from 'vitest'
import { EMPTY_FILTERS } from '../search/filters'
import {
  browseQueriesEqual,
  browseQueryHasFiltersOrSearch,
  browseQueryHasState,
  browseQueryToState,
  browseStateToQuery,
  mergeBrowseQuery,
  pickBrowseQuery,
} from './browseRouteQuery'

describe('browseRouteQuery', () => {
  it('round-trips view-by, reverse, search, and filters', () => {
    const q = browseStateToQuery({
      q: 'hello world',
      sort: 'title',
      defaultSort: 'collection',
      rev: true,
      filters: {
        ...EMPTY_FILTERS,
        hasSheet: true,
        arrangers: ['Paul Paddock'],
        collections: ['Classic'],
        yearMin: 2000,
        yearMax: 2010,
        fullText: true,
        rated: true,
        titleLetters: ['A', 'B'],
      },
    })
    expect(q).toMatchObject({
      q: 'hello world',
      sort: 'title',
      rev: '1',
      sheet: '1',
      arr: 'Paul Paddock',
      col: 'Classic',
      ymin: '2000',
      ymax: '2010',
      ft: '1',
      rated: '1',
      tl: 'A|B',
    })
    expect(browseQueryHasState(q)).toBe(true)

    const state = browseQueryToState(q, 'collection')
    expect(state.q).toBe('hello world')
    expect(state.sort).toBe('title')
    expect(state.rev).toBe(true)
    expect(state.filters.hasSheet).toBe(true)
    expect(state.filters.arrangers).toEqual(['Paul Paddock'])
    expect(state.filters.collections).toEqual(['Classic'])
    expect(state.filters.yearMin).toBe(2000)
    expect(state.filters.fullText).toBe(true)
    expect(state.filters.rated).toBe(true)
    expect(state.filters.titleLetters).toEqual(['A', 'B'])
  })

  it('omits default collection sort and empty filters', () => {
    const q = browseStateToQuery({
      q: '',
      sort: 'collection',
      defaultSort: 'collection',
      rev: false,
      filters: { ...EMPTY_FILTERS },
    })
    expect(q).toEqual({})
    expect(browseQueryHasState(q)).toBe(false)
  })

  it('detects filter/search deep links without treating sort-only as filters', () => {
    expect(browseQueryHasFiltersOrSearch({ sort: 'title', rev: '1' })).toBe(false)
    expect(browseQueryHasFiltersOrSearch({ q: 'love' })).toBe(true)
    expect(browseQueryHasFiltersOrSearch({ sheet: '1' })).toBe(true)
    expect(browseQueryHasState({ sort: 'title' })).toBe(true)
  })

  it('merge preserves unrelated query keys and clears stale Browse keys', () => {
    const merged = mergeBrowseQuery(
      { q: 'old', sort: 'year', sheet: '1', fullscreen: '1' },
      { q: 'new', sort: 'title' },
    )
    expect(merged).toEqual({ fullscreen: '1', q: 'new', sort: 'title' })
    expect(merged.sheet).toBeUndefined()
  })

  it('treats array query values like Vue Router duplicates', () => {
    expect(pickBrowseQuery({ q: ['x', 'y'], sort: ['title'] })).toEqual({
      q: 'x',
      sort: 'title',
    })
  })

  it('compares Browse query slices only', () => {
    expect(
      browseQueriesEqual(
        { q: 'a', sort: 'title', fullscreen: '1' },
        { q: 'a', sort: 'title' },
      ),
    ).toBe(true)
    expect(browseQueriesEqual({ q: 'a' }, { q: 'b' })).toBe(false)
  })
})
