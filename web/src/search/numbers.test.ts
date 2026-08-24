import { describe, expect, it } from 'vitest'
import {
  cardinalWords,
  expandNumberToken,
  groupedWords,
  numberWordPhrases,
  wordsToDigits,
} from './numbers'
import { foldText } from './normalize'
import { parseQuery } from './query'
import { SearchEngine, sortTags } from './engine'
import type { TagSummary } from '../types/tag'

describe('number words', () => {
  it('reads cardinals and grouped forms', () => {
    expect(cardinalWords(3)).toBe('three')
    expect(cardinalWords(345)).toBe('three hundred forty five')
    expect(groupedWords('345')).toBe('three forty five')
    expect(groupedWords('1776')).toBe('seventeen seventy six')
    expect(numberWordPhrases('3')).toEqual(expect.arrayContaining(['3', 'three']))
  })

  it('parses words back to digits (cardinal and grouped)', () => {
    expect(wordsToDigits(['three'])).toBe('3')
    expect(wordsToDigits(['three', 'hundred', 'forty', 'five'])).toBe('345')
    expect(wordsToDigits(['three', 'forty', 'five'])).toBe('345')
    expect(wordsToDigits(['seventeen', 'seventy', 'six'])).toBe('1776')
    expect(wordsToDigits(['fifty'])).toBe('50')
  })

  it('expands single tokens both ways', () => {
    expect(expandNumberToken('3')).toEqual(expect.arrayContaining(['3', 'three']))
    expect(expandNumberToken('three')).toEqual(expect.arrayContaining(['3', 'three']))
  })
})

describe('search number ↔ words', () => {
  const tags: TagSummary[] = [
    {
      id: 1,
      title: '3 Stooges Tag',
      arranger: 'A',
      key: 'C',
      rating: 3,
      type: null,
      collection: null,
      hasSheet: true,
      audioParts: ['lead'],
      sheet: null,
    },
    {
      id: 2,
      title: '345',
      arranger: 'B',
      key: 'C',
      rating: 3,
      type: null,
      collection: null,
      hasSheet: true,
      audioParts: ['lead'],
      sheet: null,
    },
    {
      id: 3,
      title: 'Three Forty-Five Blues',
      arranger: 'C',
      key: 'C',
      rating: 3,
      type: null,
      collection: null,
      hasSheet: true,
      audioParts: ['lead'],
      sheet: null,
    },
    {
      id: 4,
      title: "(Don't They Know It's) The End of the World?",
      arranger: 'D',
      key: 'C',
      rating: 3,
      type: null,
      collection: null,
      hasSheet: true,
      audioParts: ['lead'],
      sheet: null,
    },
    {
      id: 5,
      title: 'Always',
      arranger: 'E',
      key: 'C',
      rating: 3,
      type: null,
      collection: null,
      hasSheet: true,
      audioParts: ['lead'],
      sheet: null,
    },
  ]

  it('finds digit titles from number words and converse', () => {
    const engine = new SearchEngine({ tags, expansions: {} })
    expect(engine.search(parseQuery('three', false)).map((t) => t.id)).toContain(1)
    expect(engine.search(parseQuery('3', false)).map((t) => t.id)).toContain(1)

    const fromDigits = engine.search(parseQuery('345', false)).map((t) => t.id)
    expect(fromDigits).toEqual(expect.arrayContaining([2, 3]))

    const fromWords = engine.search(parseQuery('three forty-five', false)).map((t) => t.id)
    expect(fromWords).toEqual(expect.arrayContaining([2, 3]))
  })

  it('does not OR-expand long digit queries into number words', () => {
    const engine = new SearchEngine({
      tags: [
        ...tags,
        {
          id: 3558,
          title: 'Exact Id Tag',
          arranger: 'Z',
          key: 'C',
          rating: 3,
          type: null,
          collection: null,
          hasSheet: true,
          audioParts: ['lead'],
          sheet: null,
        },
        {
          id: 99,
          title: 'Five Hundred Miles',
          arranger: 'Z',
          key: 'C',
          rating: 3,
          type: null,
          collection: null,
          hasSheet: true,
          audioParts: ['lead'],
          sheet: null,
        },
      ],
      expansions: {},
    })
    expect(engine.search(parseQuery('3558', false)).map((t) => t.id)).toEqual([3558])
    expect(engine.search(parseQuery('3558', false)).map((t) => t.id)).not.toContain(99)
  })

  it('sorts titles ignoring punctuation', () => {
    const sorted = sortTags(tags, 'title').map((t) => t.title)
    // "(" should not push the Don't-title before Always
    expect(sorted.indexOf('Always')).toBeLessThan(
      sorted.indexOf("(Don't They Know It's) The End of the World?"),
    )
    expect(foldText(sorted[0] ?? '') <= foldText(sorted[1] ?? '')).toBe(true)
  })
})
