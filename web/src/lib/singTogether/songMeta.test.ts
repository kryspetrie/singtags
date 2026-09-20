import { describe, expect, it } from 'vitest'
import type { MatchedSong } from './match'
import {
  coverageParts,
  formatTitleField,
  fmtConf,
  keyOptionsFor,
  matchSongMetaItems,
  parseTitleField,
  songAkaLabel,
  songKeyLabel,
  songPartMetaItems,
  songVoicingLabel,
} from './songMeta'
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

describe('parseTitleField / formatTitleField', () => {
  it('parses primary and alts', () => {
    expect(parseTitleField('Hello; Hi; Yo')).toEqual({
      title: 'Hello',
      altTitles: ['Hi', 'Yo'],
    })
    expect(parseTitleField('  ')).toEqual({ title: '' })
  })

  it('formats with semicolon separators', () => {
    expect(formatTitleField({ title: 'A', altTitles: ['B', 'C'] })).toBe('A; B; C')
    expect(formatTitleField({ title: 'A' })).toBe('A')
  })
})

describe('key / voicing / aka labels', () => {
  it('prepends unknown current key', () => {
    expect(keyOptionsFor('Custom Key', ['', 'C Major'])[0]).toBe('Custom Key')
    expect(keyOptionsFor('C Major', ['', 'C Major'])).toEqual(['', 'C Major'])
  })

  it('formats row labels', () => {
    expect(songVoicingLabel({ voicing: 'TTBB' })).toBe('TTBB')
    expect(songVoicingLabel({})).toBe('')
    expect(songKeyLabel({ key: 'C Major' })).toBe('C Major')
    expect(songKeyLabel({})).toBe('')
    expect(songAkaLabel({ altTitles: ['A', 'B'] })).toBe('A, B')
    expect(songAkaLabel({})).toBe('')
  })
})

describe('songPartMetaItems', () => {
  it('returns empty for title-only songs', () => {
    expect(songPartMetaItems(song({ title: 'Bare' }))).toEqual([])
  })

  it('shows Parts later when details exist but no parts', () => {
    expect(songPartMetaItems(song({ title: 'A', arranger: 'X' }))).toEqual(['Parts later'])
  })

  it('lists part labels with stars', () => {
    expect(
      songPartMetaItems(song({ title: 'A', parts: { lead: 3, bari: 0 } })),
    ).toEqual(['Lead 3★', 'Bari'])
  })
})

describe('matchSongMetaItems / coverageParts / fmtConf', () => {
  it('formats confidence', () => {
    expect(fmtConf(3.5)).toBe('3.5')
  })

  it('builds match meta bits', () => {
    const m = {
      matchKey: 'k',
      title: 'T',
      arranger: 'Speer',
      voicing: 'TTBB',
      key: 'Bb',
      coverable: true,
      partsCovered: 4,
      partsRequired: 4,
      coverage: {},
      singers: [],
      groupConfidence: 2.5,
      minPartConfidence: 1,
      peopleCount: 2,
      textMode: 'exact',
    } satisfies MatchedSong
    expect(matchSongMetaItems(m)).toEqual([
      'Speer',
      'TTBB',
      'Bb',
      'confidence 2.5',
    ])
  })

  it('maps coverage parts', () => {
    const m = {
      matchKey: 'k',
      title: 'T',
      arranger: '',
      voicing: 'TTBB',
      coverable: true,
      partsCovered: 1,
      partsRequired: 4,
      coverage: {
        lead: [{ personId: 'p1', displayName: 'Alex', confidence: 3 }],
      },
      singers: [],
      groupConfidence: 0,
      minPartConfidence: 0,
      peopleCount: 1,
      textMode: 'exact',
    } satisfies MatchedSong
    const parts = coverageParts(m)
    expect(parts.find((p) => p.id === 'lead')).toEqual({
      id: 'lead',
      label: 'Lead',
      count: 1,
      names: 'Alex',
    })
  })
})
