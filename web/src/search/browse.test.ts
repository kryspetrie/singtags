import { describe, expect, it } from 'vitest'
import {
  arrangerLastName,
  arrangersByLastInitial,
  splitArrangerNames,
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
  TITLE_LETTER_FILTER_OPTIONS,
  hasScrubRail,
  tagIdHundredKey,
  tagIdLoupeTickStep,
  tagIdTickKey,
  yearSectionKey,
  yearBoundsForSectionKey,
  collectionIdForSectionKey,
  collectionJumpLabel,
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
    expect(titleSortLetter('99 Bottles')).toBe('0–9')
    expect(titleSortLetter('!!!')).toBe('#')
    expect(TITLE_LETTER_FILTER_OPTIONS).toContain('A')
    expect(TITLE_LETTER_FILTER_OPTIONS).toContain('Z')
    expect(TITLE_LETTER_FILTER_OPTIONS).toContain('0–9')
    expect(TITLE_LETTER_FILTER_OPTIONS).toContain('#')
    expect(TITLE_LETTER_FILTER_OPTIONS).toContain(titleSortLetter("Don't Worry"))
    expect(TITLE_LETTER_FILTER_OPTIONS).toContain(titleSortLetter('99 Bottles'))
    expect(TITLE_LETTER_FILTER_OPTIONS).toContain(titleSortLetter('!!!'))
    const { jumpKeys } = buildBrowseRows(sortBrowseTags(tags, 'title'), 'title', 10)
    expect(jumpKeys).toEqual(['A', 'B', 'Z'])
  })
})

describe('tag # scrub bins', () => {
  it('labels ids in hundreds and enables the id scrub rail', () => {
    expect(tagIdHundredKey(1)).toBe('0')
    expect(tagIdHundredKey(99)).toBe('0')
    expect(tagIdHundredKey(100)).toBe('100')
    expect(tagIdHundredKey(599)).toBe('500')
    expect(tagIdHundredKey(600)).toBe('600')
    expect(tagIdHundredKey(2500)).toBe('2500')
    expect(hasScrubRail('year')).toBe(true)
    expect(hasScrubRail('id')).toBe(true)
    expect(hasScrubRail('title')).toBe(false)
  })

  it('picks denser loupe tick steps on wider tracks', () => {
    expect(tagIdTickKey(575, 100)).toBe('500')
    expect(tagIdTickKey(575, 50)).toBe('550')
    expect(tagIdTickKey(575, 25)).toBe('575')
    expect(tagIdLoupeTickStep(400)).toBe(100)
    expect(tagIdLoupeTickStep(560)).toBe(50)
    expect(tagIdLoupeTickStep(900)).toBe(25)
  })
})

describe('section → filter helpers', () => {
  it('maps year section keys to inclusive bounds', () => {
    expect(yearBoundsForSectionKey('<1920')).toEqual({ yearMin: null, yearMax: 1919 })
    expect(yearBoundsForSectionKey('1990s')).toEqual({ yearMin: 1990, yearMax: 1999 })
    expect(yearBoundsForSectionKey('2023')).toEqual({ yearMin: 2023, yearMax: 2023 })
    expect(yearBoundsForSectionKey('nope')).toBeNull()
  })

  it('maps collection section labels to catalog ids', () => {
    expect(collectionIdForSectionKey('Classic', ['classic', '100'])).toBe('classic')
    expect(collectionIdForSectionKey('Other', ['classic'])).toBeNull()
  })
})

describe('splitArrangerNames', () => {
  it('splits comma / and / ampersand credits into people', () => {
    expect(splitArrangerNames('Adam Scott, Jay Dougherty and Lucas Bitzer')).toEqual([
      'Adam Scott',
      'Jay Dougherty',
      'Lucas Bitzer',
    ])
    expect(splitArrangerNames('Brandon Hall & Nathan Menke')).toEqual([
      'Brandon Hall',
      'Nathan Menke',
    ])
  })

  it('strips lyrics tails', () => {
    expect(splitArrangerNames('Paul Olguin, Lyrics by William Hill')).toEqual(['Paul Olguin'])
    expect(splitArrangerNames('Bobby Gray, Jr.')).toEqual(['Bobby Gray, Jr.'])
  })
})

describe('custom collection browse sections', () => {
  it('places custom sections after catalog and before Other', () => {
    const tags = [
      tag({ id: 1, title: 'A', collection: 'classic', classic: 1 }),
      tag({ id: 2, title: 'B', collection: null }),
      tag({ id: 3, title: 'C', collection: 'classic', classic: 2 }),
    ]
    const sorted = sortBrowseTags(tags, 'collection')
    const { jumpKeys, rows } = buildBrowseRows(sorted, 'collection', 100, {
      userCollections: [{ id: 'u1', name: 'Contest set', tagIds: [3, 2] }],
    })
    expect(jumpKeys.indexOf('Classic')).toBeLessThan(jumpKeys.indexOf('user:u1'))
    expect(jumpKeys.indexOf('user:u1')).toBeLessThan(jumpKeys.indexOf('Other'))
    const customSec = rows.find((r) => r.type === 'section' && r.key === 'user:u1')
    expect(customSec).toMatchObject({ type: 'section', label: 'Contest set', custom: true })
  })

  it('collectionJumpLabel resolves user collection names from ids', () => {
    expect(
      collectionJumpLabel('user:u1', [{ id: 'u1', name: 'Contest set', tagIds: [1] }]),
    ).toBe('Contest set')
    expect(collectionJumpLabel('Classic', [])).toBe('Classic')
  })

  it('uses a flat list when one collection filter is active', () => {
    const tags = [
      tag({ id: 1, title: 'A', collection: 'classic', classic: 1 }),
      tag({ id: 2, title: 'B', collection: 'classic', classic: 2 }),
    ]
    const sorted = sortBrowseTags(tags, 'collection')
    const userCollections = [
      { id: 'u1', name: 'Contest set', tagIds: [1, 2] },
      { id: 'u2', name: 'Warm-ups', tagIds: [1] },
    ]
    const filtered = buildBrowseRows(sorted, 'collection', 100, {
      userCollections,
      singleCollectionFilter: 'user:u1',
    })
    expect(filtered.jumpKeys).toEqual([])
    expect(filtered.rows.every((r) => r.type === 'tag')).toBe(true)
    expect(filtered.rows).toHaveLength(2)
    expect(filtered.rows.map((r) => (r.type === 'tag' ? r.tag.id : -1))).toEqual([1, 2])
  })

  it('pins the filtered user collection section first when multiple collection filters are active', () => {
    const tags = [
      tag({ id: 1, title: 'A', collection: 'classic', classic: 1 }),
      tag({ id: 2, title: 'B', collection: 'classic', classic: 2 }),
    ]
    const sorted = sortBrowseTags(tags, 'collection')
    const userCollections = [
      { id: 'u1', name: 'Contest set', tagIds: [1, 2] },
      { id: 'u2', name: 'Warm-ups', tagIds: [1] },
    ]
    const filtered = buildBrowseRows(sorted, 'collection', 100, {
      userCollections,
      activeUserCollectionFilters: ['user:u1'],
    })
    expect(filtered.jumpKeys[0]).toBe('user:u1')
    expect(filtered.jumpKeys).toContain('Classic')
    expect(filtered.jumpKeys).toContain('user:u2')
    const sections = filtered.rows.filter((r) => r.type === 'section')
    expect(sections[0]).toMatchObject({ key: 'user:u1', label: 'Contest set', custom: true })
    expect(sections.some((s) => s.type === 'section' && s.key === 'Classic')).toBe(true)
    expect(sections.some((s) => s.type === 'section' && s.key === 'user:u2')).toBe(true)
    // Tag 1 appears under Contest set, Classic, and Warm-ups.
    expect(filtered.rows.filter((r) => r.type === 'tag' && r.tag.id === 1)).toHaveLength(3)
  })
})

describe('sortBrowseTags myRating', () => {
  it('orders by my stars then title, and sections by star', () => {
    const tags = [
      tag({ id: 1, title: 'B' }),
      tag({ id: 2, title: 'A' }),
      tag({ id: 3, title: 'C' }),
    ]
    const myStars = (id: number) => (id === 1 ? 5 : id === 2 ? 3 : null)
    const sorted = sortBrowseTags(tags, 'myRating', false, { myStars })
    expect(sorted.map((t) => t.id)).toEqual([1, 2, 3])
    expect(sectionKeyFor(sorted[0]!, 'myRating', { myStars })).toBe('5★')
    expect(sectionKeyFor(sorted[1]!, 'myRating', { myStars })).toBe('3★')
    expect(sectionKeyFor(sorted[2]!, 'myRating', { myStars })).toBe('Unrated')
    const { rows, jumpKeys } = buildBrowseRows(sorted, 'myRating', 10, { myStars })
    expect(jumpKeys).toEqual(['5★', '3★', 'Unrated'])
    expect(rows.filter((r) => r.type === 'section').map((r) => (r as { key: string }).key)).toEqual([
      '5★',
      '3★',
      'Unrated',
    ])
  })
})
