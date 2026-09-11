/**
 * @vitest-environment happy-dom
 */
import 'fake-indexeddb/auto'
import { describe, expect, it, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import { useRecorderStore } from '../stores/recorder'
import RecorderTakeEditView from '../views/RecorderTakeEditView.vue'

vi.mock('../audio/player', () => {
  class TagAudioPlayer {
    paused = true
    currentTime = 0
    duration = 0
    load = vi.fn(async () => undefined)
    setTransform = vi.fn(async () => undefined)
    setLoop = vi.fn()
    play = vi.fn(async () => undefined)
    pause = vi.fn()
    seek = vi.fn()
    dispose = vi.fn()
    setUpdateListener = vi.fn()
    setEndedListener = vi.fn()
    getOriginalBuffer = vi.fn(() => null)
  }
  return { TagAudioPlayer }
})

describe('RecorderTakeEditView', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    indexedDB.deleteDatabase('singtags-recorder')
  })

  it('mounts for a session take without throwing', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const store = useRecorderStore()
    const session = await store.createSession({ name: 'Edit crash test' })
    const take = await store.addTake({
      sessionId: session.id,
      blob: new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'audio/webm' }),
      mime: 'audio/webm',
      durationSec: 1,
      channels: 1,
      bitRate: null,
    })

    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        {
          path: '/recorder/:id/take/:takeId/edit',
          name: 'recorder-take-edit',
          component: RecorderTakeEditView,
          props: true,
        },
        { path: '/recorder/:id', name: 'recorder-session', component: { template: '<div/>' } },
      ],
    })
    await router.push({
      name: 'recorder-take-edit',
      params: { id: session.id, takeId: take.id },
    })
    await router.isReady()

    const wrapper = mount(RecorderTakeEditView, {
      props: { id: session.id, takeId: take.id },
      global: {
        plugins: [router, pinia],
        stubs: {
          WaveformView: true,
          ConfirmDialog: true,
        },
      },
    })
    await flushPromises()
    expect(wrapper.find('h1').text()).toContain('Edit take')
    wrapper.unmount()
  })
})
