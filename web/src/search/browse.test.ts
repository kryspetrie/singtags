import { describe, expect, it } from 'vitest'
import {
  arrangerLastName,
  arrangersByLastInitial,
  buildBrowseRows,
  formatArrangerLastFirst,
  parseClassicNumberQuery,
  parseExactTagIdQuery,
  parseTagNumberQuery,
  sortBrowseTags,
  titleSortLetter,
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

  it('sorts by last name and builds letter sections', () => {
    const tags = [
      tag({ id: 1, title: 'Zebra', arranger: 'Joe Liles', year: 2001 }),
      tag({ id: 2, title: 'Alpha', arranger: 'Burt Szabo', year: 1999 }),
      tag({ id: 3, title: 'Beta', arranger: 'Paul Paddock', year: 2001 }),
    ]
    expect(sortBrowseTags(tags, 'arranger-last').map((t) => t.id)).toEqual([1, 3, 2])
    expect(titleSortLetter("Don't Worry")).toBe('D')
    const { rows, jumpKeys } = buildBrowseRows(sortBrowseTags(tags, 'title'), 'title', 10)
    expect(jumpKeys).toEqual(['A', 'B', 'Z'])
    expect(rows.filter((r) => r.type === 'section').map((r) => r.type === 'section' && r.label)).toEqual([
      'A',
      'B',
      'Z',
    ])
  })
})
