/**
 * @vitest-environment node
 */
import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useLocalPlaylistsStore } from './localPlaylists'
import * as localLibraryDb from '../offline/localLibraryDb'

describe('localPlaylists store drafts', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    indexedDB.deleteDatabase('singtags-local-library')
    vi.restoreAllMocks()
  })

  it('beginDraft is visible via byId/isDraft but not sorted until commit', async () => {
    const store = useLocalPlaylistsStore()
    await store.ensureLoaded()
    const draft = store.beginDraft('Tonight')
    expect(store.isDraft(draft.id)).toBe(true)
    expect(store.byId(draft.id)?.name).toBe('Tonight')
    expect(store.sorted.map((p) => p.id)).not.toContain(draft.id)
    expect(await localLibraryDb.listLocalPlaylists()).toEqual([])
  })

  it('mutates draft in memory without IDB put until commitDraft', async () => {
    const putSpy = vi.spyOn(localLibraryDb, 'putLocalPlaylist')
    const store = useLocalPlaylistsStore()
    await store.ensureLoaded()
    const draft = store.beginDraft('Draft')
    putSpy.mockClear()

    await store.renamePlaylist(draft.id, 'Renamed')
    await store.addEntries(draft.id, ['entry-a', 'entry-b'])
    expect(putSpy).not.toHaveBeenCalled()
    expect(store.byId(draft.id)?.name).toBe('Renamed')
    expect(store.byId(draft.id)?.items.map((i) => i.entryId)).toEqual(['entry-a', 'entry-b'])

    const saved = await store.commitDraft()
    expect(saved?.id).toBe(draft.id)
    expect(putSpy).toHaveBeenCalledTimes(1)
    expect(store.draft).toBeNull()
    expect(store.isDraft(draft.id)).toBe(false)
    expect(store.sorted.some((p) => p.id === draft.id)).toBe(true)
    expect((await localLibraryDb.getLocalPlaylist(draft.id))?.name).toBe('Renamed')
  })

  it('discardDraft clears without persisting', async () => {
    const putSpy = vi.spyOn(localLibraryDb, 'putLocalPlaylist')
    const store = useLocalPlaylistsStore()
    await store.ensureLoaded()
    const draft = store.beginDraft('Scratch')
    await store.addEntries(draft.id, ['entry-a'])
    putSpy.mockClear()

    store.discardDraft()
    expect(store.draft).toBeNull()
    expect(store.byId(draft.id)).toBeUndefined()
    expect(putSpy).not.toHaveBeenCalled()
    expect(await localLibraryDb.listLocalPlaylists()).toEqual([])
  })

  it('second beginDraft replaces the prior draft', async () => {
    const store = useLocalPlaylistsStore()
    await store.ensureLoaded()
    const first = store.beginDraft('First')
    const second = store.beginDraft('Second')
    expect(store.draft?.id).toBe(second.id)
    expect(store.byId(first.id)).toBeUndefined()
    expect(store.isDraft(first.id)).toBe(false)
    expect(store.isDraft(second.id)).toBe(true)
  })

  it('deletePlaylist on draft id discards without IDB delete', async () => {
    const delSpy = vi.spyOn(localLibraryDb, 'deleteLocalPlaylist')
    const store = useLocalPlaylistsStore()
    await store.ensureLoaded()
    const draft = store.beginDraft('Gone')
    await store.deletePlaylist(draft.id)
    expect(store.draft).toBeNull()
    expect(delSpy).not.toHaveBeenCalled()
  })

  it('commitDraft returns null when there is no draft', async () => {
    const store = useLocalPlaylistsStore()
    await store.ensureLoaded()
    expect(await store.commitDraft()).toBeNull()
  })
})
