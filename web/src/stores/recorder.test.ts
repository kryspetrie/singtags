/**
 * @vitest-environment happy-dom
 */
import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useRecorderStore } from './recorder'
import { DEFAULT_RECORDER_CAPTURE } from '../types/recorder'

describe('recorder store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    indexedDB.deleteDatabase('singtags-recorder')
  })

  it('creates a session and appends takes', async () => {
    const store = useRecorderStore()
    const session = await store.createSession({
      name: 'Warmups',
      labels: ['lead'],
      capture: DEFAULT_RECORDER_CAPTURE,
    })
    expect(session.id).toMatch(/^rs_/)
    await store.refresh()
    expect(store.sessions.some((s) => s.id === session.id)).toBe(true)

    const take = await store.addTake({
      sessionId: session.id,
      blob: new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'audio/webm' }),
      mime: 'audio/webm',
      durationSec: 1.5,
      channels: 1,
      bitRate: 128_000,
    })
    expect(take.label).toBe('Take 1')
    const takes = await store.loadTakes(session.id)
    expect(takes).toHaveLength(1)
    const bytes = await store.takeBytes(take.id)
    expect(bytes?.data.length).toBe(4)
  })

  it('replaces take audio and supports one-step undo', async () => {
    const store = useRecorderStore()
    const session = await store.createSession({ name: 'Crop' })
    const take = await store.addTake({
      sessionId: session.id,
      blob: new Blob([new Uint8Array([9, 9, 9])], { type: 'audio/webm' }),
      mime: 'audio/webm',
      durationSec: 2,
      channels: 1,
      bitRate: null,
    })
    await store.replaceTakeAudio({
      takeId: take.id,
      data: new Uint8Array([1, 2]).buffer,
      mime: 'audio/wav',
      durationSec: 0.5,
      sampleRate: 48000,
      channels: 1,
      keepUndo: true,
    })
    expect((await store.takeBytes(take.id))?.data.length).toBe(2)
    expect(store.cropUndo?.takeId).toBe(take.id)
    await store.undoLastCrop()
    expect((await store.takeBytes(take.id))?.data.length).toBe(3)
    expect(store.cropUndo).toBeNull()
  })

  it('persists crop undo across refresh', async () => {
    const store = useRecorderStore()
    const session = await store.createSession({ name: 'Crop persist' })
    const take = await store.addTake({
      sessionId: session.id,
      blob: new Blob([new Uint8Array([7, 7, 7, 7])], { type: 'audio/webm' }),
      mime: 'audio/webm',
      durationSec: 2,
      channels: 1,
      bitRate: null,
    })
    await store.replaceTakeAudio({
      takeId: take.id,
      data: new Uint8Array([1]).buffer,
      mime: 'audio/wav',
      durationSec: 0.2,
      sampleRate: 48000,
      channels: 1,
      keepUndo: true,
    })
    setActivePinia(createPinia())
    const store2 = useRecorderStore()
    await store2.refresh()
    expect(store2.cropUndo?.takeId).toBe(take.id)
    await store2.undoLastCrop()
    expect((await store2.takeBytes(take.id))?.data.length).toBe(4)
  })
})
