import { describe, expect, it } from 'vitest'
import { foldText, normalizeToken, tokenize } from './normalize'
import { expandToken } from './expansions'
import { parseQuery } from './query'
import { SearchEngine } from './engine'
import type { TagSummary } from '../types/tag'

describe('normalize', () => {
  it('strips apostrophes and punctuation', () => {
    // ev'rything → evrything (apostrophe removed; meaning restored via expansions)
    expect(normalizeToken("ev'rything")).toBe('evrything')
    expect(normalizeToken("darlin'")).toBe('darlin')
    expect(foldText('Merry Christmas!')).toBe('merry christmas')
    expect(tokenize("Don't they know")).toEqual(['dont', 'they', 'know'])
  })
})

describe('expansions', () => {
  const map = { em: ['them'], them: ['em'], goin: ['going'], evrything: ['everything'], everything: ['evrything'] }
  it('expands aliases', () => {
    expect(expandToken('em', map).sort()).toEqual(['em', 'them'])
    expect(expandToken("goin'", map).sort()).toEqual(['goin', 'going'])
    expect(expandToken('everything', map).sort()).toEqual(['everything', 'evrything'])
  })
})

describe('parseQuery', () => {
  it('parses include exclude phrase and fields', () => {
    const q = parseQuery('love -heart "little christmas" arranger:Joe minRating:3 hasSheet')
    expect(q.include).toContain('love')
    expect(q.exclude).toContain('heart')
    expect(q.phrases).toContain('little christmas')
    expect(q.fields[0]?.field).toBe('arranger')
    expect(q.minRating).toBe(3)
    expect(q.hasSheet).toBe(true)
    expect(q.include).not.toContain('minrating')
  })
})

describe('SearchEngine', () => {
  const tags: TagSummary[] = [
    {
      id: 1,
      title: "Have Yourself a Merry Little Christmas",
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
  ]

  it('matches punctuation-folded title and exclusions', () => {
    const engine = new SearchEngine({
      tags,
      expansions: { em: ['them'] },
      lyrics: [{ id: 1, lyrics: "Have yourself a merry little Christmas (now)" }],
    })
    const q = parseQuery('christmas -heart', false)
    const hit = engine.search(q)
    expect(hit.map((t) => t.id)).toEqual([1])
  })

  it('full text finds lyric with apostrophe fold via expansions', () => {
    const engine = new SearchEngine({
      tags,
      expansions: { everything: ['evrything'], evrything: ['everything'] },
      lyrics: [{ id: 1, lyrics: "ev'rything is fine" }],
    })
    const q = parseQuery('everything', true)
    expect(engine.search(q).map((t) => t.id)).toEqual([1])
  })
})
