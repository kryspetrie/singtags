import { describe, expect, it } from 'vitest'
import {
  arrangerLastName,
  arrangersByLastInitial,
  buildBrowseRows,
  bookletBadgeForTag,
  formatArrangerLastFirst,
  parse100DaysNumberQuery,
  parseClassicNumberQuery,
  parseExactTagIdQuery,
  parseTagNumberQuery,
  sectionKeyFor,
  sortBrowseTags,
  titleSortLetter,
  yearSectionKey,
} from './browse'
import type { TagSummary } from '../types/tag'

function tag(partial: Partial<TagSummary> & { id: number }): TagSummary {
  return {
    title: '',
    altTitle: null,
    arranger: null,
    key: null,
    writKey: null,
    rating: null,
    ratingCount: null,
    downloads: null,
    type: null,
    collection: null,
    classic: null,
    year: null,
    parts: 4,
    hasSheet: true,
    audioParts: [],
    sheet: null,
    sheetPages: [],
    ...partial,
  }
}

describe('browse helpers', () => {
  it('parses last names and last-first display', () => {
    expect(arrangerLastName('Joe Liles')).toBe('Liles')
    expect(arrangerLastName('Terry S. Chapman')).toBe('Chapman')
    expect(arrangerLastName('Burt Szabo Jr.')).toBe('Szabo')
    expect(formatArrangerLastFirst('Joe Liles')).toBe('Liles, Joe')
  })

  it('groups arrangers by last-name initial', () => {
    const groups = arrangersByLastInitial(['Joe Liles', 'Burt Szabo', 'Paul Paddock'])
    expect(groups.map((g) => g.letter)).toEqual(['L', 'P', 'S'])
  })

  it('parses exact tag id queries', () => {
    expect(parseExactTagIdQuery('111')).toBe(111)
    expect(parseExactTagIdQuery('#111')).toBeNull()
    expect(parseExactTagIdQuery('n111')).toBeNull()
    expect(parseExactTagIdQuery('hello')).toBeNull()
    expect(parseExactTagIdQuery('111 baby')).toBeNull()
  })

  it('parses classic booklet and tag-number queries', () => {
    expect(parseClassicNumberQuery('c99')).toBe(99)
    expect(parseClassicNumberQuery('C24')).toBe(24)
    expect(parseClassicNumberQuery('classic:68')).toBe(68)
    expect(parseClassicNumberQuery('classic 69')).toBe(69)
    expect(parseClassicNumberQuery('99')).toBeNull()
    expect(parseTagNumberQuery('n111')).toBe(111)
    expect(parseTagNumberQuery('N42')).toBe(42)
    expect(parseTagNumberQuery('n:7')).toBe(7)
    expect(parseTagNumberQuery('#111')).toBeNull()
    expect(parseTagNumberQuery('111')).toBeNull()
    expect(parseTagNumberQuery('c111')).toBeNull()
  })

  it('parses 100 Days booklet queries', () => {
    expect(parse100DaysNumberQuery('p12')).toBe(12)
    expect(parse100DaysNumberQuery('P7')).toBe(7)
    expect(parse100DaysNumberQuery('100days:3')).toBe(3)
    expect(parse100DaysNumberQuery('c12')).toBeNull()
    expect(parse100DaysNumberQuery('n12')).toBeNull()
  })

  it('labels booklet badges by collection', () => {
    expect(bookletBadgeForTag(tag({ id: 1, collection: 'classic', classic: 12 }))?.short).toBe(
      'Classic #12',
    )
    expect(bookletBadgeForTag(tag({ id: 2, collection: '100', classic: 7 }))?.short).toBe(
      '100 Days #7',
    )
    expect(bookletBadgeForTag(tag({ id: 3, collection: '100', classic: 7 }))?.kind).toBe('days100')
    expect(bookletBadgeForTag(tag({ id: 4, collection: 'easytags', classic: null }))?.short).toBe(
      'Easy Tags',
    )
    expect(bookletBadgeForTag(tag({ id: 4, collection: 'easytags', classic: null }))?.kind).toBe(
      'easytags',
    )
  })

  it('groups year sort with hybrid bins (decades then per-year from 2000)', () => {
    expect(yearSectionKey(1910)).toBe('<1920')
    expect(yearSectionKey(1999)).toBe('1990s')
    expect(yearSectionKey(2009)).toBe('2009')
    expect(yearSectionKey(null)).toBe('<1920')

    const tags = [
      tag({ id: 1, title: 'A', year: 'Wed, 13 Dec 2023' }),
      tag({ id: 2, title: 'B', year: 2023 }),
      tag({ id: 3, title: 'C', year: 'Sat, 4 Apr 2009' }),
      tag({ id: 5, title: 'E', year: 1995 }),
      tag({ id: 6, title: 'F', year: 1998 }),
      tag({ id: 4, title: 'D', year: null }),
    ]
    expect(sortBrowseTags(tags, 'year').map((x) => x.id)).toEqual([1, 2, 3, 6, 5, 4])
    expect(sectionKeyFor(tags[0]!, 'year')).toBe('2023')
    expect(sectionKeyFor(tags[1]!, 'year')).toBe('2023')
    expect(sectionKeyFor(tags[2]!, 'year')).toBe('2009')
    expect(sectionKeyFor(tags[3]!, 'year')).toBe('1990s')
    expect(sectionKeyFor(tags[4]!, 'year')).toBe('1990s')
    expect(sectionKeyFor(tags[5]!, 'year')).toBe('<1920')
    const { jumpKeys } = buildBrowseRows(sortBrowseTags(tags, 'year'), 'year', 20)
    expect(jumpKeys).toEqual(['2023', '2009', '1990s', '<1920'])
  })

  it('sorts by collection booklet then tag id', () => {
    const tags = [
      tag({ id: 30, title: 'Z', collection: '100', classic: 2 }),
      tag({ id: 10, title: 'A', collection: 'classic', classic: 2 }),
      tag({ id: 20, title: 'B', collection: 'classic', classic: 1 }),
      tag({ id: 40, title: 'C', collection: '100', classic: 1 }),
      tag({ id: 5, title: 'D', collection: null, classic: null }),
    ]
    expect(sortBrowseTags(tags, 'collection').map((x) => x.id)).toEqual([20, 10, 40, 30, 5])
  })

  it('sorts by title and builds letter sections', () => {
    const tags = [
      tag({ id: 1, title: 'Zebra', arranger: 'Joe Liles', year: 2001 }),
      tag({ id: 2, title: 'Alpha', arranger: 'Burt Szabo', year: 1999 }),
      tag({ id: 3, title: 'Beta', arranger: 'Paul Paddock', year: 2001 }),
    ]
    expect(sortBrowseTags(tags, 'title').map((t) => t.id)).toEqual([2, 3, 1])
    expect(sortBrowseTags(tags, 'title', true).map((t) => t.id)).toEqual([1, 3, 2])
    expect(titleSortLetter("Don't Worry")).toBe('D')
    const { jumpKeys } = buildBrowseRows(sortBrowseTags(tags, 'title'), 'title', 10)
    expect(jumpKeys).toEqual(['A', 'B', 'Z'])
  })
})
