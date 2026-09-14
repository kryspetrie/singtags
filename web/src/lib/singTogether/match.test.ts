import { describe, expect, it } from 'vitest'
import {
  DEFAULT_MATCH_CRITERIA,
  matchRepertoires,
  songMatchScore,
  songsMatch,
  sortMatchedSongs,
  type RosterPerson,
} from './match'
import {
  fieldMatch,
  normalizeText,
  similarity,
  textsMatch,
  voicingsMatch,
} from './normalize'
import type { RepertoireSong } from './types'

function song(partial: Partial<RepertoireSong> & Pick<RepertoireSong, 'title'>): RepertoireSong {
  return {
    id: partial.id ?? `id-${partial.title}`,
    title: partial.title,
    arranger: partial.arranger ?? '',
    key: partial.key,
    voicing: partial.voicing,
    parts: partial.parts ?? { lead: 3 },
  }
}

function person(id: string, songs: RepertoireSong[], name = id): RosterPerson {
  return {
    id,
    profile: { displayName: name, songs, updatedAt: 1 },
  }
}

describe('normalize / text modes', () => {
  it('normalizes capitalization and spacing', () => {
    expect(normalizeText('  Hello   World ')).toBe('hello world')
  })

  it('exact mode is case-insensitive equality', () => {
    expect(textsMatch('Hello', 'hello', 'exact')).toBe(true)
    expect(textsMatch('Hello', 'Hell', 'exact')).toBe(false)
  })

  it('partial mode allows containment and token subset', () => {
    expect(textsMatch('Hello Mary Lou', 'Mary Lou', 'partial')).toBe(true)
    expect(textsMatch('Goodnight Sweetheart', 'Goodnight', 'partial')).toBe(true)
    expect(textsMatch('ABC', 'XYZ', 'partial')).toBe(false)
  })

  it('fuzzy mode tolerates typos and leading The', () => {
    expect(textsMatch('The Charleston', 'Charleston', 'fuzzy')).toBe(true)
    expect(textsMatch('Goodnight Sweetheart', 'Goodnite Sweetheart', 'fuzzy')).toBe(true)
    expect(textsMatch('Hello', 'World', 'fuzzy')).toBe(false)
  })

  it('fieldMatch wildcards empty when allowed', () => {
    expect(fieldMatch('', 'Jones', 'exact', true)).toBe(true)
    expect(fieldMatch('Jones', '', 'exact', true)).toBe(true)
    expect(fieldMatch('', 'Jones', 'exact', false)).toBe(false)
  })

  it('voicingsMatch wildcards unspecified', () => {
    expect(voicingsMatch(undefined, 'TTBB', true)).toBe(true)
    expect(voicingsMatch('SATB', 'TTBB', true)).toBe(false)
    expect(voicingsMatch('TTBB', 'TTBB', true)).toBe(true)
  })

  it('similarity is 1 for identical', () => {
    expect(similarity('abc', 'abc')).toBe(1)
    expect(similarity('abc', 'xyz')).toBeLessThan(0.5)
  })
})

describe('songMatchScore / criteria', () => {
  const base = DEFAULT_MATCH_CRITERIA

  it('requires title always', () => {
    expect(
      songsMatch(song({ title: '' }), song({ title: 'X' }), base, 'exact'),
    ).toBe(false)
  })

  it('matches different case titles in exact mode', () => {
    expect(
      songsMatch(
        song({ title: 'Hello', arranger: 'Jones', voicing: 'TTBB' }),
        song({ title: 'hello', arranger: 'Jones', voicing: 'TTBB' }),
        base,
        'exact',
      ),
    ).toBe(true)
  })

  it('blank arranger wildcards when arranger criterion on', () => {
    expect(
      songsMatch(
        song({ title: 'Hello', arranger: '', voicing: 'TTBB' }),
        song({ title: 'Hello', arranger: 'Jones', voicing: 'TTBB' }),
        { ...base, arranger: true },
        'exact',
      ),
    ).toBe(true)
  })

  it('rejects different arrangers when criterion on', () => {
    expect(
      songsMatch(
        song({ title: 'Hello', arranger: 'A', voicing: 'TTBB' }),
        song({ title: 'Hello', arranger: 'B', voicing: 'TTBB' }),
        { ...base, arranger: true },
        'exact',
      ),
    ).toBe(false)
  })

  it('ignores arranger when criterion off', () => {
    expect(
      songsMatch(
        song({ title: 'Hello', arranger: 'A', voicing: 'TTBB' }),
        song({ title: 'Hello', arranger: 'B', voicing: 'TTBB' }),
        { ...base, arranger: false },
        'exact',
      ),
    ).toBe(true)
  })

  it('blank voicing wildcards', () => {
    expect(
      songsMatch(
        song({ title: 'Hello', voicing: undefined }),
        song({ title: 'Hello', voicing: 'SATB' }),
        { ...base, voicing: true, arranger: false },
        'exact',
      ),
    ).toBe(true)
  })

  it('parts criterion requires shared part when both list parts', () => {
    const host = song({ title: 'X', parts: { lead: 5 } })
    const peerOk = song({ title: 'X', parts: { lead: 2, bass: 1 } })
    const peerBad = song({ title: 'X', parts: { bass: 1 } })
    const crit = { ...base, arranger: false, voicing: false, parts: true }
    expect(songsMatch(host, peerOk, crit, 'exact')).toBe(true)
    expect(songsMatch(host, peerBad, crit, 'exact')).toBe(false)
  })

  it('empty parts wildcard under parts criterion', () => {
    expect(
      songsMatch(
        song({ title: 'X', parts: {} }),
        song({ title: 'X', parts: { bass: 1 } }),
        { ...base, arranger: false, voicing: false, parts: true },
        'exact',
      ),
    ).toBe(true)
  })

  it('fuzzy title scores higher for closer spellings', () => {
    const host = song({ title: 'Goodnight Sweetheart', arranger: '', voicing: 'TTBB' })
    const near = song({ title: 'Goodnite Sweetheart', arranger: '', voicing: 'TTBB' })
    const far = song({ title: 'Goodnight Sweetheart Goodbye', arranger: '', voicing: 'TTBB' })
    const crit = { ...base, arranger: false }
    const sNear = songMatchScore(host, near, crit, 'fuzzy')
    const sFar = songMatchScore(host, far, crit, 'fuzzy')
    expect(sNear).toBeGreaterThan(0)
    expect(sNear).toBeGreaterThan(sFar)
  })
})

describe('matchRepertoires', () => {
  it('returns empty with only host', () => {
    expect(matchRepertoires([person('h', [song({ title: 'A' })])])).toEqual([])
  })

  it('intersects and marks coverable when all parts filled', () => {
    const host = person('host', [
      song({
        title: 'Hello',
        arranger: 'Jones',
        voicing: 'TTBB',
        parts: { lead: 5, tenor: 3 },
      }),
    ])
    const peer = person('peer', [
      song({
        title: 'hello',
        arranger: 'jones',
        voicing: 'TTBB',
        parts: { bari: 4, bass: 2 },
      }),
    ])
    const matched = matchRepertoires([host, peer])
    expect(matched).toHaveLength(1)
    expect(matched[0]!.coverable).toBe(true)
    expect(matched[0]!.groupConfidence).toBeGreaterThan(0)
  })

  it('shared but not coverable when a part is missing', () => {
    const a = person('a', [song({ title: 'X', arranger: 'Y', voicing: 'TTBB', parts: { lead: 5 } })])
    const b = person('b', [
      song({ title: 'X', arranger: 'Y', voicing: 'TTBB', parts: { lead: 4, bass: 2 } }),
    ])
    const matched = matchRepertoires([a, b])
    expect(matched).toHaveLength(1)
    expect(matched[0]!.coverable).toBe(false)
  })

  it('fuzzy matches The Charleston ≈ Charleston', () => {
    const host = person('h', [song({ title: 'The Charleston', arranger: 'Spaeth', voicing: 'TTBB' })])
    const peer = person('p', [song({ title: 'Charleston', arranger: 'Spaeth', voicing: 'TTBB' })])
    expect(matchRepertoires([host, peer], { textMode: 'exact' })).toHaveLength(0)
    expect(matchRepertoires([host, peer], { textMode: 'fuzzy' })).toHaveLength(1)
  })

  it('uses host title as canonical display', () => {
    const host = person('h', [song({ title: 'Hello Mary Lou', arranger: 'C' })])
    const peer = person('p', [song({ title: 'Mary Lou', arranger: 'C' })])
    const matched = matchRepertoires([host, peer], {
      textMode: 'partial',
      criteria: { arranger: true, voicing: false },
    })
    expect(matched[0]!.title).toBe('Hello Mary Lou')
  })

  it('requires every peer to match', () => {
    const host = person('h', [song({ title: 'A', arranger: 'X' }), song({ title: 'B', arranger: 'Y' })])
    const p1 = person('1', [song({ title: 'A', arranger: 'X' })])
    const p2 = person('2', [song({ title: 'B', arranger: 'Y' })])
    const matched = matchRepertoires([host, p1, p2], { criteria: { voicing: false } })
    expect(matched).toHaveLength(0)
  })

  it('matches both host songs when all peers have both', () => {
    const host = person('h', [
      song({ title: 'A', arranger: 'X', id: 'ha' }),
      song({ title: 'B', arranger: 'Y', id: 'hb' }),
    ])
    const peer = person('p', [
      song({ title: 'A', arranger: 'X', id: 'pa' }),
      song({ title: 'B', arranger: 'Y', id: 'pb' }),
    ])
    expect(matchRepertoires([host, peer], { criteria: { voicing: false } })).toHaveLength(2)
  })

  it('sorts coverable first', () => {
    const songs = sortMatchedSongs(
      [
        {
          matchKey: 'a',
          title: 'A',
          arranger: '',
          voicing: 'TTBB',
          coverable: false,
          coverage: {},
          groupConfidence: 5,
          minPartConfidence: 0,
          peopleCount: 2,
          textMode: 'exact',
        },
        {
          matchKey: 'b',
          title: 'B',
          arranger: '',
          voicing: 'TTBB',
          coverable: true,
          coverage: {},
          groupConfidence: 1,
          minPartConfidence: 1,
          peopleCount: 2,
          textMode: 'exact',
        },
      ],
      'coverable-confidence',
    )
    expect(songs[0]!.matchKey).toBe('b')
  })
})
