import { describe, expect, it } from 'vitest'
import {
  DEFAULT_MATCH_CRITERIA,
  DEFAULT_MATCH_SORT,
  filterMatchedSongs,
  matchCoverageLabel,
  matchRepertoires,
  songMatchScore,
  songsMatch,
  sortMatchedSongs,
  type MatchedSong,
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
    altTitles: partial.altTitles,
    arranger: partial.arranger ?? '',
    key: partial.key,
    voicing: partial.voicing,
    parts: partial.parts ?? { lead: 3 },
  }
}

function person(id: string, songs: RepertoireSong[], name = id): RosterPerson {
  return {
    id,
    profile: { displayName: name, songs, collections: [], updatedAt: 1 },
  }
}

function stubMatch(partial: Partial<MatchedSong> & Pick<MatchedSong, 'matchKey' | 'title'>): MatchedSong {
  return {
    matchKey: partial.matchKey,
    title: partial.title,
    arranger: partial.arranger ?? '',
    voicing: partial.voicing ?? 'TTBB',
    coverable: partial.coverable ?? false,
    partsCovered: partial.partsCovered ?? 0,
    partsRequired: partial.partsRequired ?? 4,
    coverage: partial.coverage ?? {},
    singers: partial.singers ?? [],
    groupConfidence: partial.groupConfidence ?? 0,
    minPartConfidence: partial.minPartConfidence ?? 0,
    peopleCount: partial.peopleCount ?? 2,
    textMode: partial.textMode ?? 'exact',
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

  it('matches when peer uses an alternate title', () => {
    expect(
      songsMatch(
        song({
          title: 'From the First Hello to the Last Goodbye',
          altTitles: ['First Hello'],
        }),
        song({ title: 'First Hello' }),
        DEFAULT_MATCH_CRITERIA,
        'exact',
      ),
    ).toBe(true)
    expect(
      songsMatch(
        song({ title: 'Heart of My Heart' }),
        song({
          title: 'A Story of a Rose (Heart of My Heart)',
          altTitles: ['Heart of My Heart'],
        }),
        DEFAULT_MATCH_CRITERIA,
        'exact',
      ),
    ).toBe(true)
  })

  it('defaults to title-only criteria (optional fields off)', () => {
    expect(DEFAULT_MATCH_CRITERIA.arranger).toBe(false)
    expect(DEFAULT_MATCH_CRITERIA.voicing).toBe(false)
    expect(DEFAULT_MATCH_CRITERIA.parts).toBe(false)
    expect(
      songsMatch(
        song({ title: 'Hello', arranger: 'A', voicing: 'TTBB' }),
        song({ title: 'Hello', arranger: 'B', voicing: 'SATB' }),
        DEFAULT_MATCH_CRITERIA,
        'exact',
      ),
    ).toBe(true)
  })

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
    expect(matched[0]!.partsCovered).toBe(4)
    expect(matched[0]!.singers.map((s) => s.displayName).sort()).toEqual(['host', 'peer'])
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
    expect(matched[0]!.partsCovered).toBe(2)
  })

  it('fuzzy matches The Charleston ≈ Charleston', () => {
    const host = person('h', [song({ title: 'The Charleston', arranger: 'Spaeth', voicing: 'TTBB' })])
    const peer = person('p', [song({ title: 'Charleston', arranger: 'Spaeth', voicing: 'TTBB' })])
    expect(matchRepertoires([host, peer], { textMode: 'exact' })).toHaveLength(0)
    expect(matchRepertoires([host, peer], { textMode: 'fuzzy' })).toHaveLength(1)
  })

  it('matches repertoire rows via alternate titles', () => {
    const host = person('h', [
      song({
        title: 'From the First Hello to the Last Goodbye',
        altTitles: ['First Hello'],
        arranger: 'A',
      }),
    ])
    const peer = person('p', [song({ title: 'First Hello', arranger: 'B' })])
    const matched = matchRepertoires([host, peer], { textMode: 'exact' })
    expect(matched).toHaveLength(1)
    expect(matched[0]!.title).toBe('From the First Hello to the Last Goodbye')
    expect(matched[0]!.altTitles).toEqual(['First Hello'])
  })

  it('uses richest title as canonical display', () => {
    const host = person('h', [song({ title: 'Hello Mary Lou', arranger: 'C' })])
    const peer = person('p', [song({ title: 'Mary Lou', arranger: 'C' })])
    const matched = matchRepertoires([host, peer], {
      textMode: 'partial',
      criteria: { arranger: true, voicing: false },
    })
    expect(matched[0]!.title).toBe('Hello Mary Lou')
  })

  it('matches any singer combination (not every peer)', () => {
    const host = person('h', [song({ title: 'A', arranger: 'X' }), song({ title: 'B', arranger: 'Y' })], 'Host')
    const p1 = person('1', [song({ title: 'A', arranger: 'X' })], 'Alex')
    const p2 = person('2', [song({ title: 'B', arranger: 'Y' })], 'Blair')
    const matched = matchRepertoires([host, p1, p2], { criteria: { voicing: false } })
    expect(matched).toHaveLength(2)
    const byTitle = Object.fromEntries(matched.map((m) => [m.title, m]))
    expect(byTitle.A!.singers.map((s) => s.displayName).sort()).toEqual(['Alex', 'Host'])
    expect(byTitle.B!.singers.map((s) => s.displayName).sort()).toEqual(['Blair', 'Host'])
  })

  it('includes songs known only by peers (host optional)', () => {
    const host = person('h', [song({ title: 'OnlyMine' })], 'Host')
    const p1 = person('1', [song({ title: 'PeerSong' })], 'Alex')
    const p2 = person('2', [song({ title: 'PeerSong' })], 'Blair')
    const matched = matchRepertoires([host, p1, p2], { criteria: { voicing: false } })
    expect(matched.map((m) => m.title)).toEqual(['PeerSong'])
    expect(matched[0]!.singers.map((s) => s.displayName).sort()).toEqual(['Alex', 'Blair'])
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

  it('sorts by parts covered then people by default', () => {
    expect(DEFAULT_MATCH_SORT).toBe('parts-people')
    const songs = sortMatchedSongs(
      [
        stubMatch({
          matchKey: 'a',
          title: 'A',
          partsCovered: 2,
          peopleCount: 4,
          coverable: false,
        }),
        stubMatch({
          matchKey: 'b',
          title: 'B',
          partsCovered: 4,
          peopleCount: 2,
          coverable: true,
        }),
        stubMatch({
          matchKey: 'c',
          title: 'C',
          partsCovered: 3,
          peopleCount: 3,
          coverable: false,
        }),
      ],
      'parts-people',
    )
    expect(songs.map((s) => s.matchKey)).toEqual(['b', 'c', 'a'])
  })

  it('sorts by people then parts', () => {
    const songs = sortMatchedSongs(
      [
        stubMatch({ matchKey: 'a', title: 'A', partsCovered: 4, peopleCount: 2 }),
        stubMatch({ matchKey: 'b', title: 'B', partsCovered: 2, peopleCount: 4 }),
      ],
      'people-parts',
    )
    expect(songs.map((s) => s.matchKey)).toEqual(['b', 'a'])
  })

  it('filters by min parts covered without dropping the rest when 0', () => {
    const songs = [
      stubMatch({ matchKey: 'a', title: 'A', partsCovered: 1 }),
      stubMatch({ matchKey: 'b', title: 'B', partsCovered: 3 }),
      stubMatch({ matchKey: 'c', title: 'C', partsCovered: 4 }),
    ]
    expect(filterMatchedSongs(songs, 0)).toHaveLength(3)
    expect(filterMatchedSongs(songs, 3).map((s) => s.matchKey)).toEqual(['b', 'c'])
  })

  it('labels coverage for complete and incomplete', () => {
    expect(
      matchCoverageLabel(
        stubMatch({
          matchKey: 'a',
          title: 'A',
          partsCovered: 4,
          partsRequired: 4,
          peopleCount: 2,
          coverable: true,
        }),
      ),
    ).toMatch(/4 parts covered/)
    expect(
      matchCoverageLabel(
        stubMatch({
          matchKey: 'b',
          title: 'B',
          partsCovered: 3,
          partsRequired: 4,
          peopleCount: 4,
          coverable: false,
        }),
      ),
    ).toBe('3 of 4 parts · 4 know')
  })
})
