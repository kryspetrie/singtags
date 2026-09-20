import { describe, expect, it } from 'vitest'
import {
  buildTitleLibraryIndex,
  buildTitleTagIndex,
  resolveSongOpenTarget,
  songLinkActionLabel,
  songOpenLabel,
  type SongOpenLookups,
} from './songOpen'
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
    isTag: partial.isTag,
    tagId: partial.tagId,
    localEntryId: partial.localEntryId,
  }
}

function lookups(partial: Partial<SongOpenLookups> = {}): SongOpenLookups {
  return {
    tagById: partial.tagById ?? (() => null),
    libraryById: partial.libraryById ?? (() => null),
    titleTagIndex: partial.titleTagIndex ?? new Map(),
    titleLibraryIndex: partial.titleLibraryIndex ?? new Map(),
  }
}

describe('buildTitleTagIndex', () => {
  it('indexes title and altTitle; first wins', () => {
    const map = buildTitleTagIndex([
      { id: 1, title: 'Hello', altTitle: 'Hi' },
      { id: 2, title: 'Hello', altTitle: null },
    ])
    expect(map.get('hello')).toEqual({ id: 1, title: 'Hello' })
    expect(map.get('hi')).toEqual({ id: 1, title: 'Hello' })
  })

  it('falls back to Tag N when title missing', () => {
    const map = buildTitleTagIndex([{ id: 9, title: null, altTitle: 'Only Alt' }])
    expect(map.get('only alt')).toEqual({ id: 9, title: 'Tag 9' })
  })
})

describe('buildTitleLibraryIndex', () => {
  it('returns empty when disabled', () => {
    expect(
      buildTitleLibraryIndex([{ id: 'a', title: 'Song' }], false).size,
    ).toBe(0)
  })

  it('indexes folded titles when enabled', () => {
    const map = buildTitleLibraryIndex(
      [
        { id: 'a', title: 'My Song' },
        { id: 'b', title: 'My Song' },
      ],
      true,
    )
    expect(map.get('my song')).toEqual({ id: 'a', title: 'My Song' })
  })
})

describe('resolveSongOpenTarget', () => {
  it('uses linked tag id when isTag', () => {
    const target = resolveSongOpenTarget(song({ title: 'X', isTag: true, tagId: 42 }), lookups({
      tagById: (id) => (id === 42 ? { title: 'Linked' } : null),
    }))
    expect(target).toEqual({ kind: 'tag', tagId: 42, label: 'Linked', linked: true })
  })

  it('falls back to title index for tags', () => {
    const titleTagIndex = new Map([['sweet', { id: 7, title: 'Sweet Adeline' }]])
    const target = resolveSongOpenTarget(
      song({ title: 'Sweet', isTag: true }),
      lookups({ titleTagIndex }),
    )
    expect(target).toEqual({ kind: 'tag', tagId: 7, label: 'Sweet Adeline', linked: false })
  })

  it('uses linked library entry when not a tag', () => {
    const target = resolveSongOpenTarget(
      song({ title: 'X', localEntryId: 'lib-1' }),
      lookups({
        libraryById: (id) => (id === 'lib-1' ? { title: 'Local' } : null),
      }),
    )
    expect(target).toEqual({
      kind: 'library',
      entryId: 'lib-1',
      label: 'Local',
      linked: true,
    })
  })

  it('opens explicit tag link even when isTag is off', () => {
    const target = resolveSongOpenTarget(
      song({ title: 'X', tagId: 3 }),
      lookups({ tagById: () => ({ title: 'Catalog' }) }),
    )
    expect(target).toEqual({ kind: 'tag', tagId: 3, label: 'Catalog', linked: true })
  })

  it('falls back to library title index', () => {
    const titleLibraryIndex = new Map([['foo', { id: 'e1', title: 'Foo' }]])
    const target = resolveSongOpenTarget(
      song({ title: 'Foo' }),
      lookups({ titleLibraryIndex }),
    )
    expect(target).toEqual({ kind: 'library', entryId: 'e1', label: 'Foo', linked: false })
  })
})

describe('songOpenLabel / songLinkActionLabel', () => {
  it('formats open labels', () => {
    expect(songOpenLabel(null)).toBe('')
    expect(songOpenLabel({ kind: 'tag', tagId: 1, label: 'A', linked: true })).toBe(
      'Open tag: A',
    )
    expect(
      songOpenLabel({ kind: 'library', entryId: 'x', label: 'B', linked: false }),
    ).toBe('Open My Library: B')
  })

  it('formats link action labels', () => {
    expect(songLinkActionLabel({ isTag: true })).toBe('Link tag…')
    expect(songLinkActionLabel({ isTag: false })).toBe('Link library…')
    expect(songLinkActionLabel({})).toBe('Link library…')
  })
})
