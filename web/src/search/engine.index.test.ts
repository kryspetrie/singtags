import { describe, expect, it } from 'vitest'
import { SearchEngine } from './engine'
import { parseQuery } from './query'
import type { TagSummary } from '../types/tag'

const tags: TagSummary[] = [
  {
    id: 1,
    title: 'Merry Christmas',
    arranger: 'Paul Paddock',
    key: 'Ab Major',
    rating: 4.2,
    type: 'Barbershop',
    collection: null,
    hasSheet: true,
    audioParts: ['lead'],
    sheet: null,
  },
  {
    id: 2,
    title: 'Heart of My Heart',
    arranger: 'Other',
    key: 'C Major',
    rating: 3,
    type: 'Barbershop',
    collection: null,
    hasSheet: false,
    audioParts: [],
    sheet: null,
  },
  {
    id: 3,
    title: 'Love Me',
    arranger: 'Paul Smith',
    key: 'G Major',
    rating: 4.8,
    type: 'Religious',
    collection: 'classic',
    hasSheet: true,
    audioParts: ['lead', 'bass'],
    sheet: null,
  },
]

describe('indexed SearchEngine', () => {
  it('uses title token index for includes', () => {
    const engine = new SearchEngine({ tags, expansions: {} })
    const hit = engine.search(parseQuery('christmas', false))
    expect(hit.map((t) => t.id)).toEqual([1])
  })

  it('accelerates arranger field filters', () => {
    const engine = new SearchEngine({ tags, expansions: {} })
    const hit = engine.search(parseQuery('arranger:Paul', false))
    expect(hit.map((t) => t.id).sort()).toEqual([1, 3])
  })

  it('intersects full-text lyric postings without scanning all titles per token', () => {
    const engine = new SearchEngine({
      tags,
      expansions: { everything: ['evrything'], evrything: ['everything'] },
      lyrics: [
        { id: 1, lyrics: "ev'rything is fine" },
        { id: 2, lyrics: 'nothing here' },
        { id: 3, lyrics: 'love forever' },
      ],
    })
    const hit = engine.search(parseQuery('everything', true))
    expect(hit.map((t) => t.id)).toEqual([1])
  })

  it('returns all tags for empty query', () => {
    const engine = new SearchEngine({ tags, expansions: {} })
    expect(engine.search(parseQuery('', false))).toHaveLength(3)
  })

  it('ORs multiple keys from chip-style field filter', () => {
    const engine = new SearchEngine({ tags, expansions: {} })
    const hit = engine.search({
      include: [],
      exclude: [],
      phrases: [],
      fields: [{ field: 'key', values: ['C Major', 'G Major'], mode: 'or' }],
      fullText: false,
      minRating: null,
      hasAudio: null,
      hasSheet: null,
      raw: '',
    })
    expect(hit.map((t) => t.id).sort()).toEqual([2, 3])
  })

  it('matches title prefixes (typeahead partial tokens)', () => {
    const engine = new SearchEngine({
      tags: [
        ...tags,
        {
          id: 10,
          title: 'April Showers',
          arranger: null,
          key: null,
          rating: 4,
          type: 'Barbershop',
          collection: null,
          hasSheet: true,
          audioParts: ['lead'],
          sheet: null,
        },
        {
          id: 11,
          title: 'April In Paris',
          arranger: null,
          key: null,
          rating: 4,
          type: 'Barbershop',
          collection: null,
          hasSheet: true,
          audioParts: ['lead'],
          sheet: null,
        },
        {
          id: 12,
          title: 'Maytime',
          arranger: null,
          key: null,
          rating: 3,
          type: 'Barbershop',
          collection: null,
          hasSheet: true,
          audioParts: ['lead'],
          sheet: null,
        },
      ],
      expansions: {},
    })
    const hit = engine.search(parseQuery('Apri', false))
    expect(hit.map((t) => t.id).sort()).toEqual([10, 11])
    expect(engine.search(parseQuery('arranger:Pad', false)).map((t) => t.id)).toEqual([1])
  })

  it('indexes classic booklet numbers for free-text and classic: field', () => {
    const engine = new SearchEngine({
      tags: [
        {
          id: 111,
          title: "Baby, You're the One I Love",
          arranger: 'A',
          key: 'C',
          rating: 4,
          type: 'Barbershop',
          collection: 'classic',
          classic: '99',
          hasSheet: true,
          audioParts: ['lead'],
          sheet: null,
        },
        {
          id: 200,
          title: 'Other Song',
          arranger: 'B',
          key: 'C',
          rating: 3,
          type: 'Barbershop',
          collection: null,
          classic: null,
          hasSheet: true,
          audioParts: ['lead'],
          sheet: null,
        },
        {
          id: 2,
          title: 'Short Classic',
          arranger: 'C',
          key: 'C',
          rating: 3,
          type: 'Barbershop',
          collection: 'classic',
          classic: '2',
          hasSheet: true,
          audioParts: ['lead'],
          sheet: null,
        },
        {
          id: 20,
          title: 'Longer Classic',
          arranger: 'D',
          key: 'C',
          rating: 3,
          type: 'Barbershop',
          collection: 'classic',
          classic: '20',
          hasSheet: true,
          audioParts: ['lead'],
          sheet: null,
        },
      ],
      expansions: {},
    })
    expect(engine.search(parseQuery('c99', false)).map((t) => t.id)).toEqual([111])
    expect(engine.search(parseQuery('classic:99', false)).map((t) => t.id)).toEqual([111])
    expect(engine.search(parseQuery('99', false)).map((t) => t.id)).toContain(111)
    expect(engine.search(parseQuery('c2', false)).map((t) => t.id)).toEqual([2])
    expect(engine.search(parseQuery('classic:2', false)).map((t) => t.id)).toEqual([2])
    expect(engine.search(parseQuery('c20', false)).map((t) => t.id)).toEqual([20])
    expect(engine.search(parseQuery('n2', false)).map((t) => t.id)).toEqual([2])
    expect(engine.search(parseQuery('n20', false)).map((t) => t.id)).toEqual([20])
  })
})
