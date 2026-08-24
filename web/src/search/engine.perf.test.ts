import { describe, expect, it } from 'vitest'
import { SearchEngine } from './engine'
import { parseQuery } from './query'
import type { TagSummary } from '../types/tag'

function makeTags(n: number): TagSummary[] {
  const out: TagSummary[] = []
  for (let i = 0; i < n; i++) {
    out.push({
      id: i,
      title: `Tag Title ${i} Christmas Love Heart`,
      altTitle: i % 7 === 0 ? `Alt ${i}` : null,
      arranger: i % 3 === 0 ? 'Paul Paddock' : `Arranger ${i % 50}`,
      key: i % 2 === 0 ? 'Ab Major' : 'C Major',
      rating: (i % 50) / 10,
      type: 'Barbershop',
      collection: i % 11 === 0 ? 'classic' : null,
      hasSheet: i % 5 !== 0,
      audioParts: i % 4 === 0 ? [] : ['lead'],
      sheet: null,
      downloads: i * 3,
      year: 1990 + (i % 30),
    })
  }
  return out
}

describe('search performance', () => {
  it('title search over 7k tags stays under budget', () => {
    const tags = makeTags(7100)
    const engine = new SearchEngine({ tags, expansions: { em: ['them'] } })
    const q = parseQuery('christmas arranger:Paul', false)

    const t0 = performance.now()
    let hits = 0
    for (let i = 0; i < 20; i++) {
      hits = engine.search(q).length
    }
    const elapsed = performance.now() - t0
    const perQuery = elapsed / 20

    expect(hits).toBeGreaterThan(0)
    // Generous CI budget: title filter should be well under 50ms/query on modern hardware
    expect(perQuery).toBeLessThan(50)
  })

  it('full-text token lookup uses inverted index', () => {
    const tags = makeTags(2000)
    const lyrics = tags.map((t) => ({
      id: t.id,
      lyrics: t.id % 10 === 0 ? `ev'rything is wonderful ${t.id}` : `other words ${t.id}`,
    }))
    const engine = new SearchEngine({
      tags,
      expansions: { everything: ['evrything'], evrything: ['everything'] },
      lyrics,
    })
    const q = parseQuery('everything', true)
    const t0 = performance.now()
    const hit = engine.search(q)
    const elapsed = performance.now() - t0
    expect(hit.length).toBeGreaterThan(50)
    expect(elapsed).toBeLessThan(100)
  })
})
