/**
 * @vitest-environment happy-dom
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { parseTitleList, useSingTogetherStore } from './singTogether'

describe('parseTitleList', () => {
  it('returns empty for blank input', () => {
    expect(parseTitleList('')).toEqual({ titles: [], skipped: 0 })
    expect(parseTitleList('   \n  ')).toEqual({ titles: [], skipped: 0 })
  })

  it('splits on newlines and trims', () => {
    expect(parseTitleList('Hello\n  Goodnight  \nWorld').titles).toEqual([
      'Hello',
      'Goodnight',
      'World',
    ])
  })

  it('splits on / and ; within a line', () => {
    expect(parseTitleList('A / B; C').titles).toEqual(['A', 'B', 'C'])
  })

  it('counts blank tokens as skipped when input is non-empty', () => {
    const r = parseTitleList('Hello\n\nWorld;')
    expect(r.titles).toEqual(['Hello', 'World'])
    expect(r.skipped).toBeGreaterThanOrEqual(1)
  })
})

describe('singTogether store importTitles', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  it('adds title-only stubs with empty parts', () => {
    const store = useSingTogetherStore()
    const result = store.importTitles('Heart of My Heart\nGoodnight Sweetheart')
    expect(result).toEqual({ added: 2, skipped: 0, duplicates: 0 })
    expect(store.profile.songs).toHaveLength(2)
    expect(store.profile.songs[0]!.title).toBe('Heart of My Heart')
    expect(store.profile.songs[0]!.arranger).toBe('')
    expect(store.profile.songs[0]!.parts).toEqual({})
    expect(store.profile.songs[1]!.title).toBe('Goodnight Sweetheart')
  })

  it('dedupes case-insensitively against existing and within paste', () => {
    const store = useSingTogetherStore()
    store.addTitleOnlySong('Hello Mary Lou')
    const result = store.importTitles('hello mary lou\nNew Song\nNEW SONG\nAnother')
    expect(result.added).toBe(2)
    expect(result.duplicates).toBe(2)
    expect(store.profile.songs.map((s) => s.title)).toEqual([
      'Hello Mary Lou',
      'New Song',
      'Another',
    ])
  })

  it('handles empty paste', () => {
    const store = useSingTogetherStore()
    expect(store.importTitles('')).toEqual({ added: 0, skipped: 0, duplicates: 0 })
    expect(store.songCount).toBe(0)
  })

  it('addTitleOnlySong ignores blank titles', () => {
    const store = useSingTogetherStore()
    expect(store.addTitleOnlySong('  ')).toBe('')
    expect(store.songCount).toBe(0)
  })

  it('keeps spaces and special characters in display names while typing', () => {
    const store = useSingTogetherStore()
    store.setDisplayName('Mary Lou')
    expect(store.profile.displayName).toBe('Mary Lou')
    store.setDisplayName('José & Co.')
    expect(store.profile.displayName).toBe('José & Co.')
    store.setDisplayName('Alex ')
    expect(store.profile.displayName).toBe('Alex ')
  })

  it('persists device-local tag and library links on upsert', () => {
    const store = useSingTogetherStore()
    const id = store.addTitleOnlySong('Hello Mary Lou')
    expect(id).toBeTruthy()
    const song = store.profile.songs.find((s) => s.id === id)!
    store.upsertSong({ ...song, tagId: 42, isTag: true })
    expect(store.profile.songs.find((s) => s.id === id)?.tagId).toBe(42)
    expect(store.profile.songs.find((s) => s.id === id)?.isTag).toBe(true)
    store.upsertSong({
      ...store.profile.songs.find((s) => s.id === id)!,
      localEntryId: 'lib-1',
      tagId: undefined,
      isTag: undefined,
    })
    const linked = store.profile.songs.find((s) => s.id === id)!
    expect(linked.localEntryId).toBe('lib-1')
    expect(linked.tagId).toBeUndefined()
    expect(linked.isTag).toBeUndefined()
  })
})

describe('singTogether importFromLibrary + sync', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  it('imports library drafts with localEntryId, voicing, and parts', () => {
    const store = useSingTogetherStore()
    const result = store.importFromLibrary([
      {
        entryId: 'le_a',
        title: 'Heart of My Heart',
        arranger: 'Spebs',
        key: 'Bb Major',
        voicing: 'TTBB',
        parts: { lead: 5, bass: 3 },
      },
      {
        entryId: 'le_b',
        title: 'Goodnight Sweetheart',
        arranger: '',
        parts: {},
      },
    ])
    expect(result).toEqual({ added: 2, skipped: 0, duplicates: 0 })
    expect(store.profile.songs).toHaveLength(2)
    const a = store.profile.songs[0]!
    expect(a.localEntryId).toBe('le_a')
    expect(a.title).toBe('Heart of My Heart')
    expect(a.arranger).toBe('Spebs')
    expect(a.key).toBe('Bb Major')
    expect(a.voicing).toBe('TTBB')
    expect(a.parts).toEqual({ lead: 5, bass: 3 })
    expect(a.isTag).toBeUndefined()
    expect(store.profile.songs[1]!.localEntryId).toBe('le_b')
  })

  it('dedupes by existing localEntryId', () => {
    const store = useSingTogetherStore()
    store.importFromLibrary([
      { entryId: 'le_a', title: 'One', arranger: '', parts: {} },
    ])
    const result = store.importFromLibrary([
      { entryId: 'le_a', title: 'One again', arranger: 'X', parts: { lead: 1 } },
      { entryId: 'le_b', title: 'Two', arranger: '', parts: {} },
    ])
    expect(result.added).toBe(1)
    expect(result.duplicates).toBe(1)
    expect(store.songCount).toBe(2)
    expect(store.profile.songs.find((s) => s.localEntryId === 'le_a')!.title).toBe('One')
  })

  it('syncs title/arranger/key from library and unlinks missing entries', () => {
    const store = useSingTogetherStore()
    store.importFromLibrary([
      {
        entryId: 'le_live',
        title: 'Old Title',
        arranger: 'Old Arr',
        key: 'C Major',
        parts: { lead: 4 },
      },
      {
        entryId: 'le_gone',
        title: 'Orphan',
        arranger: 'Keep Me',
        key: 'F Major',
        parts: {},
      },
    ])
    const map = new Map([
      ['le_live', { title: 'New Title', arranger: 'New Arr', key: 'G Major' }],
    ])
    const result = store.syncLinkedLibrarySongs(map)
    expect(result.synced).toBe(1)
    expect(result.unlinked).toBe(1)
    const live = store.profile.songs.find((s) => s.title === 'New Title')!
    expect(live.localEntryId).toBe('le_live')
    expect(live.arranger).toBe('New Arr')
    expect(live.key).toBe('G Major')
    expect(live.parts).toEqual({ lead: 4 })
    const orphan = store.profile.songs.find((s) => s.title === 'Orphan')!
    expect(orphan.localEntryId).toBeUndefined()
    expect(orphan.arranger).toBe('Keep Me')
    expect(orphan.key).toBe('F Major')
  })
})
