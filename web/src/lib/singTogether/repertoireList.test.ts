import { describe, expect, it } from 'vitest'
import {
  filterAndSortRepertoireSongs,
  repertoireCountLabel,
  songMatchesSearch,
  songNeedsDetails,
  sortRepertoireSongs,
  sortReverseTip,
} from './repertoireList'
import type { RepertoireSong } from './types'

function song(partial: Partial<RepertoireSong> & Pick<RepertoireSong, 'title'>): RepertoireSong {
  return {
    id: partial.id ?? `id-${partial.title}`,
    title: partial.title,
    altTitles: partial.altTitles,
    arranger: partial.arranger ?? '',
    key: partial.key,
    voicing: partial.voicing,
    parts: partial.parts ?? {},
  }
}

describe('songNeedsDetails', () => {
  it('is true for bare title', () => {
    expect(songNeedsDetails(song({ title: 'Only Title' }))).toBe(true)
  })

  it('is false when any detail is set', () => {
    expect(songNeedsDetails(song({ title: 'A', arranger: 'X' }))).toBe(false)
    expect(songNeedsDetails(song({ title: 'A', key: 'C' }))).toBe(false)
    expect(songNeedsDetails(song({ title: 'A', voicing: 'TTBB' }))).toBe(false)
    expect(songNeedsDetails(song({ title: 'A', parts: { lead: 3 } }))).toBe(false)
  })
})

describe('songMatchesSearch', () => {
  it('matches empty query', () => {
    expect(songMatchesSearch(song({ title: 'Hello' }), '')).toBe(true)
  })

  it('requires all tokens against title/alt/arranger/key', () => {
    const s = song({
      title: 'Goodnight Sweetheart',
      altTitles: ['GN'],
      arranger: 'Speer',
      key: 'Bb Major',
    })
    expect(songMatchesSearch(s, 'goodnight speer')).toBe(true)
    expect(songMatchesSearch(s, 'gn bb')).toBe(true)
    expect(songMatchesSearch(s, 'missing')).toBe(false)
  })
})

describe('sortRepertoireSongs', () => {
  const a = song({ id: 'a', title: 'Bravo', arranger: 'Zed', parts: { lead: 1 } })
  const b = song({ id: 'b', title: 'Alpha', arranger: '', parts: { lead: 1, bari: 2 } })
  const c = song({ id: 'c', title: 'Charlie', arranger: 'Ann', parts: {} })

  it('keeps custom order', () => {
    expect(sortRepertoireSongs([a, b, c], 'custom').map((s) => s.id)).toEqual([
      'a',
      'b',
      'c',
    ])
  })

  it('sorts by title', () => {
    expect(sortRepertoireSongs([a, b, c], 'title').map((s) => s.id)).toEqual([
      'b',
      'a',
      'c',
    ])
  })

  it('sorts by arranger with empty last', () => {
    expect(sortRepertoireSongs([a, b, c], 'arranger').map((s) => s.id)).toEqual([
      'c',
      'a',
      'b',
    ])
  })

  it('sorts by parts marked descending', () => {
    expect(sortRepertoireSongs([a, b, c], 'parts').map((s) => s.id)).toEqual([
      'b',
      'a',
      'c',
    ])
  })
})

describe('filterAndSortRepertoireSongs', () => {
  it('filters needs-details, searches, sorts, reverses', () => {
    const songs = [
      song({ id: '1', title: 'Zebra' }),
      song({ id: '2', title: 'Apple', arranger: 'X' }),
      song({ id: '3', title: 'Zoo Detail' }),
    ]
    const out = filterAndSortRepertoireSongs(songs, {
      listFilter: 'needs-details',
      search: 'z',
      sort: 'title',
      reverse: true,
    })
    expect(out.map((s) => s.id)).toEqual(['3', '1'])
  })
})

describe('repertoireCountLabel / sortReverseTip', () => {
  it('formats collection and search labels', () => {
    expect(
      repertoireCountLabel({
        displayedCount: 2,
        scopedTotal: 5,
        collectionName: 'Warmups',
        searching: true,
        filtered: false,
      }),
    ).toBe('2 of 5 in “Warmups”')
    expect(
      repertoireCountLabel({
        displayedCount: 3,
        scopedTotal: 3,
        collectionName: null,
        searching: false,
        filtered: false,
      }),
    ).toBe('3 songs')
    expect(
      repertoireCountLabel({
        displayedCount: 1,
        scopedTotal: 1,
        collectionName: null,
        searching: false,
        filtered: false,
      }),
    ).toBe('1 song')
  })

  it('formats reverse tip', () => {
    expect(sortReverseTip(false)).toMatch(/Reverse view order/)
    expect(sortReverseTip(true)).toMatch(/Reverse order is on/)
  })
})
