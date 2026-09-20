import { describe, expect, it } from 'vitest'
import {
  buildQuickLinkHits,
  clearLinkIfQueryDiverged,
  clearLinkPatch,
  filterLibraryEntries,
  isLibrarySourceLocked,
  isTagLinkPatch,
  libraryLinkPatch,
  linkedLibraryEntryIds,
  mapLibraryEntriesToQuickLinks,
  mapTagHitsToQuickLinks,
  setIsTagPatch,
} from './linkSearch'

const entries = [
  { id: '1', title: 'Hello', arranger: 'Smith', notes: 'ballad' },
  { id: '2', title: 'World', arranger: 'Jones', notes: '' },
  { id: '3', title: 'Hello Again', arranger: '', notes: 'uptempo' },
]

describe('filterLibraryEntries', () => {
  it('returns first N when query empty', () => {
    expect(filterLibraryEntries(entries, '', 2).map((e) => e.id)).toEqual(['1', '2'])
  })

  it('filters by title / arranger / notes', () => {
    expect(filterLibraryEntries(entries, 'smith').map((e) => e.id)).toEqual(['1'])
    expect(filterLibraryEntries(entries, 'uptempo').map((e) => e.id)).toEqual(['3'])
    expect(filterLibraryEntries(entries, 'hello').map((e) => e.id)).toEqual(['1', '3'])
  })
})

describe('map / buildQuickLinkHits', () => {
  it('maps tag hits with fallback titles', () => {
    expect(mapTagHitsToQuickLinks([{ id: 1, title: 'A' }, { id: 2 }])).toEqual([
      { kind: 'tag', id: 1, title: 'A' },
      { kind: 'tag', id: 2, title: 'Tag 2' },
    ])
  })

  it('maps library entries', () => {
    expect(mapLibraryEntriesToQuickLinks(entries.slice(0, 1))).toEqual([
      { kind: 'library', id: '1', title: 'Hello', arranger: 'Smith' },
    ])
  })

  it('builds tag mode hits', () => {
    expect(
      buildQuickLinkHits({
        isTag: true,
        query: 'x',
        libraryEnabled: true,
        tagHits: [{ id: 9, title: 'T' }],
        libraryEntries: entries,
      }),
    ).toEqual([{ kind: 'tag', id: 9, title: 'T' }])
    expect(
      buildQuickLinkHits({
        isTag: true,
        query: '',
        libraryEnabled: true,
        tagHits: [{ id: 9, title: 'T' }],
        libraryEntries: entries,
      }),
    ).toEqual([])
  })

  it('builds library mode hits', () => {
    expect(
      buildQuickLinkHits({
        isTag: false,
        query: 'world',
        libraryEnabled: true,
        tagHits: [],
        libraryEntries: entries,
      }),
    ).toEqual([{ kind: 'library', id: '2', title: 'World', arranger: 'Jones' }])
    expect(
      buildQuickLinkHits({
        isTag: false,
        query: 'world',
        libraryEnabled: false,
        tagHits: [],
        libraryEntries: entries,
      }),
    ).toEqual([])
  })
})

describe('link patches / locked source', () => {
  it('collects linked entry ids', () => {
    expect(
      linkedLibraryEntryIds([
        { localEntryId: ' a ' },
        { localEntryId: '' },
        { localEntryId: 'b' },
      ]),
    ).toEqual(['a', 'b'])
  })

  it('detects library source lock', () => {
    expect(
      isLibrarySourceLocked(
        { localEntryId: 'a' },
        { libraryEnabled: true, entryIds: new Set(['a']) },
      ),
    ).toBe(true)
    expect(
      isLibrarySourceLocked(
        { localEntryId: 'a' },
        { libraryEnabled: false, entryIds: ['a'] },
      ),
    ).toBe(false)
  })

  it('builds link patches', () => {
    expect(isTagLinkPatch(3)).toEqual({
      tagId: 3,
      localEntryId: undefined,
      isTag: true,
    })
    expect(clearLinkPatch()).toEqual({ tagId: undefined, localEntryId: undefined })
    expect(setIsTagPatch(true)).toEqual({ isTag: true, localEntryId: undefined })
    expect(setIsTagPatch(false)).toEqual({ isTag: undefined, tagId: undefined })
    expect(
      libraryLinkPatch(
        { title: 'Old' },
        { title: ' New ', arranger: ' Arr ', key: ' C ' },
        'e1',
      ),
    ).toEqual({
      localEntryId: 'e1',
      tagId: undefined,
      isTag: undefined,
      title: 'New',
      arranger: 'Arr',
      key: 'C',
    })
  })

  it('detects query divergence from picked label', () => {
    expect(clearLinkIfQueryDiverged({ linkLabel: 'A', query: 'A' })).toBe(false)
    expect(clearLinkIfQueryDiverged({ linkLabel: 'A', query: 'B' })).toBe(true)
    expect(clearLinkIfQueryDiverged({ linkLabel: '', query: 'B' })).toBe(false)
  })
})
