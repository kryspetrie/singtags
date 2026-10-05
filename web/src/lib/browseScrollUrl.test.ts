/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it } from 'vitest'
import {
  browseScrollQueriesEqual,
  browseScrollToQuery,
  estimateBrowseScrollY,
  mergeBrowseScrollQuery,
  onlyBrowseScrollQueryChanged,
  parseBrowseScrollQuery,
} from './browseScrollUrl'
import { browseQueriesEqual } from './browseRouteQuery'

describe('browseScrollUrl', () => {
  it('omits at when at search top or missing tag', () => {
    expect(browseScrollToQuery(42, 0)).toEqual({})
    expect(browseScrollToQuery(42, 12)).toEqual({})
    expect(browseScrollToQuery(null, 880)).toEqual({})
  })

  it('writes at when scrolled into the list', () => {
    expect(browseScrollToQuery(1204, 880)).toEqual({ at: '1204' })
  })

  it('parses at query', () => {
    expect(parseBrowseScrollQuery({ at: '1204' })).toEqual({ at: 1204 })
    expect(parseBrowseScrollQuery({ at: ['90'] }).at).toBe(90)
    expect(parseBrowseScrollQuery({ at: '0' }).at).toBeNull()
    expect(parseBrowseScrollQuery({ at: 'nope' }).at).toBeNull()
  })

  it('merge clears at and legacy scroll keys at search top', () => {
    expect(
      mergeBrowseScrollQuery(
        { q: 'love', at: '1204', scroll: '900', sec: 'Classic', sort: 'title', sy: '900' },
        {},
      ),
    ).toEqual({ q: 'love', sort: 'title' })
  })

  it('detects at-only query changes', () => {
    const prev = { q: 'x', at: '100' }
    const next = { q: 'x', at: '400' }
    expect(onlyBrowseScrollQueryChanged(next, prev, browseQueriesEqual)).toBe(true)
    expect(browseScrollQueriesEqual(prev, next)).toBe(false)
    expect(
      onlyBrowseScrollQueryChanged({ q: 'y', at: '100' }, prev, browseQueriesEqual),
    ).toBe(false)
  })

  it('estimates scrollY from row index + chrome pads', () => {
    const rows = [
      { type: 'section' },
      { type: 'tag' },
      { type: 'tag' },
      { type: 'section' },
      { type: 'tag' },
    ]
    // margin 200 + (56+128+128) - pad 80 = 432
    expect(
      estimateBrowseScrollY({
        rows,
        rowIndex: 3,
        listScrollMargin: 200,
        stickyPad: 80,
      }),
    ).toBe(432)
  })
})
