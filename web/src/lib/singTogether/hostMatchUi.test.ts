import { describe, expect, it } from 'vitest'
import {
  buildHostRoster,
  canReorderRepertoire,
  collectionCountsMap,
  computeHostMatchResults,
  csvImportSnackbarMessage,
  HOST_PERSON_ID,
  libraryImportSnackbarMessage,
  pasteImportSnackbarMessage,
  pendingDeleteMessage,
  removePersonById,
  scanCaptureSnackbarMessage,
  scanFingerprint,
  songsInCollection,
  upsertScannedPerson,
} from './hostMatchUi'
import type { RosterPerson } from './match'
import type { RepertoireProfile, RepertoireSong } from './types'

function song(title: string, id = title): RepertoireSong {
  return { id, title, arranger: '', parts: {} }
}

function profile(name: string, titles: string[]): RepertoireProfile {
  return {
    displayName: name,
    songs: titles.map((t) => song(t)),
  }
}

describe('buildHostRoster / computeHostMatchResults', () => {
  it('prefixes host person', () => {
    const host = profile('Host', ['A'])
    const peers: RosterPerson[] = [{ id: 'p1', profile: profile('Peer', ['A']) }]
    const roster = buildHostRoster(host, peers)
    expect(roster[0]!.id).toBe(HOST_PERSON_ID)
    expect(roster).toHaveLength(2)
  })

  it('returns empty when fewer than 2 people', () => {
    const r = computeHostMatchResults(profile('H', ['A']), [], {
      criteria: { arranger: false, voicing: false, parts: false },
      textMode: 'fuzzy',
      sortMode: 'parts-people',
      minPartsFilter: 0,
    })
    expect(r.matchedAll).toEqual([])
    expect(r.matched).toEqual([])
  })

  it('matches shared titles and reports coverable / filtered counts', () => {
    const host = profile('Host', ['Hello'])
    const peers: RosterPerson[] = [{ id: 'p1', profile: profile('Peer', ['Hello']) }]
    const r = computeHostMatchResults(host, peers, {
      criteria: { arranger: false, voicing: false, parts: false },
      textMode: 'exact',
      sortMode: 'title',
      minPartsFilter: 0,
    })
    expect(r.matchedAll.length).toBeGreaterThanOrEqual(1)
    expect(r.matched.length).toBe(r.matchedAll.length)
    expect(r.filteredOutCount).toBe(0)
    expect(typeof r.coverableCount).toBe('number')
  })
})

describe('scanFingerprint / upsertScannedPerson', () => {
  it('builds fingerprint from bytes prefix + name + count', () => {
    const bytes = Uint8Array.from([1, 2, 3])
    expect(scanFingerprint({ bytes }, profile('Ada', ['A', 'B']))).toBe(
      '1,2,3|Ada|2',
    )
    expect(scanFingerprint({}, profile('', ['A']))).toBe('||1')
  })

  it('inserts new peer and replaces by name+count', () => {
    const p = profile('Ada', ['A'])
    const first = upsertScannedPerson([], p, { now: 100 })
    expect(first.people).toHaveLength(1)
    expect(first.replaced).toBe(false)
    expect(first.person.id).toBe('peer-100')

    const updated = profile('Ada', ['A'])
    updated.songs[0]!.arranger = 'X'
    const second = upsertScannedPerson(first.people, updated, { now: 200 })
    expect(second.people).toHaveLength(1)
    expect(second.replaced).toBe(true)
    expect(second.person.id).toBe('peer-100')
    expect(second.person.profile.songs[0]!.arranger).toBe('X')
  })

  it('removes by id', () => {
    const people: RosterPerson[] = [
      { id: 'a', profile: profile('A', []) },
      { id: 'b', profile: profile('B', []) },
    ]
    expect(removePersonById(people, 'a').map((p) => p.id)).toEqual(['b'])
  })
})

describe('messages / collection helpers', () => {
  it('formats delete confirmations', () => {
    expect(pendingDeleteMessage(null, [])).toContain('this song')
    expect(
      pendingDeleteMessage(['1'], [{ id: '1', title: ' Hello ' }]),
    ).toContain('“Hello”')
    expect(pendingDeleteMessage(['1', '2'], [])).toContain('2 songs')
  })

  it('formats import snackbars', () => {
    expect(csvImportSnackbarMessage({ added: 2, skipped: 1 })).toBe(
      'Imported 2 songs (1 skipped)',
    )
    expect(csvImportSnackbarMessage({ added: 0, skipped: 3 })).toBe(
      'No songs imported (3 skipped)',
    )
    expect(
      pasteImportSnackbarMessage({ added: 1, duplicates: 2, skipped: 0 }),
    ).toBe('Added 1 song; 2 duplicates skipped')
    expect(pasteImportSnackbarMessage({ added: 0, duplicates: 0, skipped: 0 })).toBeNull()
    expect(libraryImportSnackbarMessage({ added: 1, duplicates: 2 })).toBe(
      'Added 1 · 2 already linked',
    )
    expect(scanCaptureSnackbarMessage('Ada', 1)).toBe('Ada: 1 song')
  })

  it('maps collection counts and scoped songs', () => {
    expect(collectionCountsMap([{ id: 'c1', songIds: ['a', 'b'] }])).toEqual({
      c1: 2,
    })
    const all = [song('A', 'a'), song('B', 'b'), song('C', 'c')]
    expect(songsInCollection(all, ['c', 'a']).map((s) => s.id)).toEqual(['c', 'a'])
    expect(songsInCollection(all, null)).toEqual(all)
  })

  it('gates reorder', () => {
    expect(
      canReorderRepertoire({
        listFilter: 'all',
        sort: 'custom',
        reverse: false,
        search: '',
      }),
    ).toBe(true)
    expect(
      canReorderRepertoire({
        listFilter: 'needs-details',
        sort: 'custom',
        reverse: false,
        search: '',
      }),
    ).toBe(false)
  })
})
