import { describe, expect, it } from 'vitest'
import {
  applyQuickLinkPick,
  clearQuickLinkPick,
  emptyLinkPickerState,
  nextLinkPickerOpen,
  preferredLinkPickerKind,
  seedLinkQuery,
} from './linkPickerState'

describe('nextLinkPickerOpen / preferred kind', () => {
  it('opens tag picker with title query', () => {
    expect(
      nextLinkPickerOpen(emptyLinkPickerState(), { id: 's1', title: 'Hello' }, 'tag'),
    ).toEqual({
      songId: 's1',
      kind: 'tag',
      tagQuery: 'Hello',
      libraryQuery: '',
    })
  })

  it('toggles closed when same song+kind', () => {
    const open = nextLinkPickerOpen(emptyLinkPickerState(), { id: 's1', title: 'Hi' }, 'library')
    expect(nextLinkPickerOpen(open, { id: 's1', title: 'Hi' }, 'library')).toEqual(
      emptyLinkPickerState(),
    )
  })

  it('prefers tag when isTag or library disabled', () => {
    expect(preferredLinkPickerKind({ isTag: true }, true)).toBe('tag')
    expect(preferredLinkPickerKind({}, false)).toBe('tag')
    expect(preferredLinkPickerKind({}, true)).toBe('library')
  })
})

describe('quick link pick / seed', () => {
  it('applies tag and library picks', () => {
    expect(applyQuickLinkPick({ kind: 'tag', id: 3, title: 'T' })).toMatchObject({
      tagId: 3,
      entryId: null,
      isTag: true,
      label: 'T',
    })
    expect(applyQuickLinkPick({ kind: 'library', id: 'e', title: 'L' })).toMatchObject({
      tagId: null,
      entryId: 'e',
      isTag: false,
    })
  })

  it('seeds query from title when unset', () => {
    expect(seedLinkQuery({ tagId: null, entryId: null, title: 'Song' })).toEqual({
      query: 'Song',
      highlight: -1,
    })
    expect(seedLinkQuery({ tagId: 1, entryId: null, title: 'Song' })).toBeNull()
    expect(clearQuickLinkPick().label).toBe('')
  })
})
