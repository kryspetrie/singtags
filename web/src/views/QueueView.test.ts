/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import EmptyState from '../components/EmptyState.vue'
import QueueView from './QueueView.vue'
import { useQueueStore } from '../stores/queue'

vi.mock('../download/zip', async () => {
  const actual = await vi.importActual<typeof import('../download/zip')>('../download/zip')
  return {
    ...actual,
    zipQueueTracks: vi.fn(async (_t: unknown, opts?: { onProgress?: (d: number, t: number) => void }) => {
      opts?.onProgress?.(1, 2)
      opts?.onProgress?.(2, 2)
    }),
  }
})

describe('QueueView', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  it('renders empty state then lists queued tracks', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const q = useQueueStore()
    const wrap = mount(QueueView, { global: { plugins: [pinia] } })
    expect(wrap.findComponent(EmptyState).exists()).toBe(true)
    expect(wrap.text()).toContain('Nothing to download yet')

    q.add({ tagId: 1, title: 'T', part: 'lead', path: 'media/1/lead.mp4' })
    await wrap.vm.$nextTick()
    expect(wrap.text()).toContain('#1 T — lead')
  })

  it('removes tracks, changes format/mode, and downloads zip', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const q = useQueueStore()
    q.add({ tagId: 1, title: 'T', part: 'lead', path: 'a' })
    q.add({ tagId: 1, title: 'T', part: 'bass', path: 'b' })
    const w = mount(QueueView, { global: { plugins: [pinia] } })
    await w.get('[aria-label="Zip download format"]').setValue('mp3')
    expect(q.format).toBe('mp3')
    expect(q.tracks.every((t) => t.format === 'mp3')).toBe(true)
    await w.get('[aria-label="Zip transform mode"]').setValue('key')
    expect(q.transformMode).toBe('key')

    await w.findAll('button').find((b) => b.text() === 'Remove')!.trigger('click')
    expect(q.count).toBe(1)

    await w.findAll('button').find((b) => b.text() === 'Download zip')!.trigger('click')
    await flushPromises()
    expect(q.busy).toBe(false)
    expect(q.progress.done).toBe(2)

    await w.findAll('button').find((b) => b.text() === 'Clear')!.trigger('click')
    expect(q.count).toBe(0)
  })

  it('shows queue error alert', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const q = useQueueStore()
    q.error = 'Queue limited to 100 tracks'
    const w = mount(QueueView, { global: { plugins: [pinia] } })
    expect(w.find('[role="alert"]').text()).toContain('limited')
  })
})
