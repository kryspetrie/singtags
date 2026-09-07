/**
 * @vitest-environment happy-dom
 */
import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import LocalPlaylistView from './LocalPlaylistView.vue'
import { useLocalPlaylistsStore } from '../stores/localPlaylists'
import { useLocalLibraryStore } from '../stores/localLibrary'
import * as localLibraryDb from '../offline/localLibraryDb'

vi.mock('../audio/pitchPlayer', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../audio/pitchPlayer')>()
  return {
    ...actual,
    PitchPlayer: class {
      setVoice(): void {}
      stop(): void {}
      dispose(): void {}
    },
  }
})

describe('LocalPlaylistView draft Cancel / Save', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    indexedDB.deleteDatabase('singtags-local-library')
  })

  async function mountDraft() {
    const playlists = useLocalPlaylistsStore()
    await useLocalLibraryStore().ensureLoaded()
    await playlists.ensureLoaded()
    const draft = playlists.beginDraft('Scratch Set')
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/library', name: 'library', component: { template: '<div />' } },
        {
          path: '/library/playlists/:id',
          name: 'playlist',
          component: LocalPlaylistView,
          props: true,
        },
      ],
    })
    await router.push(`/library/playlists/${draft.id}`)
    await router.isReady()
    const wrapper = mount(LocalPlaylistView, {
      props: { id: draft.id },
      global: {
        plugins: [router],
        stubs: { RouterLink: true },
      },
    })
    await flushPromises()
    return { wrapper, playlists, draft, router }
  }

  it('Cancel discards draft and does not persist', async () => {
    const putSpy = vi.spyOn(localLibraryDb, 'putLocalPlaylist')
    const { wrapper, playlists, draft } = await mountDraft()
    putSpy.mockClear()

    const cancel = wrapper.findAll('button').find((b) => b.text() === 'Cancel')
    expect(cancel).toBeTruthy()
    await cancel!.trigger('click')
    await flushPromises()

    expect(playlists.draft).toBeNull()
    expect(playlists.byId(draft.id)).toBeUndefined()
    expect(putSpy).not.toHaveBeenCalled()
    expect(await localLibraryDb.listLocalPlaylists()).toEqual([])
  })

  it('Save persists empty set list and clears draft', async () => {
    const { wrapper, playlists, draft } = await mountDraft()

    const save = wrapper
      .findAll('button.btn-primary')
      .find((b) => b.text().trim() === 'Save')
    expect(save).toBeTruthy()
    await save!.trigger('click')
    await vi.waitFor(() => {
      expect(playlists.draft).toBeNull()
    })

    expect(playlists.isDraft(draft.id)).toBe(false)
    expect(playlists.byId(draft.id)?.name).toBe('Scratch Set')
    expect((await localLibraryDb.getLocalPlaylist(draft.id))?.name).toBe('Scratch Set')
  })

  it('unmount discards an unsaved draft', async () => {
    const putSpy = vi.spyOn(localLibraryDb, 'putLocalPlaylist')
    const { wrapper, playlists, draft } = await mountDraft()
    putSpy.mockClear()

    wrapper.unmount()
    await flushPromises()

    expect(playlists.draft).toBeNull()
    expect(playlists.byId(draft.id)).toBeUndefined()
    expect(putSpy).not.toHaveBeenCalled()
  })
})
