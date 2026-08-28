/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { ref } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import EmptyState from '../components/EmptyState.vue'
import QueueView from './QueueView.vue'
import { useQueueStore } from '../stores/queue'

const offline = ref(false)
vi.mock('../composables/useOnline', () => ({
  useOnline: () => ({ offline }),
}))

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
    offline.value = false
    setActivePinia(createPinia())
  })

  it('renders empty state then lists queued tracks', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const q = useQueueStore()
    const wrap = mount(QueueView, { global: { plugins: [pinia] } })
    expect(wrap.findComponent(EmptyState).exists()).toBe(true)
    expect(wrap.text()).toContain('Nothing to download yet')

    q.add({ tagId: 1, title: 'T', part: 'lead', path: 'media/1/lead.m4a' })
    await wrap.vm.$nextTick()
    expect(wrap.text()).toContain('#1 T — lead')
  })

  it('disables Download zip when queue is empty', () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const w = mount(QueueView, { global: { plugins: [pinia] } })
    const btn = w.findAll('button').find((b) => b.text() === 'Download zip')
    expect(btn?.attributes('disabled')).toBeDefined()
    expect(btn?.attributes('title')).toMatch(/Add files/i)
  })

  it('disables Download zip when offline even with tracks', async () => {
    offline.value = true
    const pinia = createPinia()
    setActivePinia(pinia)
    const q = useQueueStore()
    q.add({ tagId: 1, title: 'T', part: 'lead', path: 'a' })
    const w = mount(QueueView, { global: { plugins: [pinia] } })
    await flushPromises()
    const btn = w.findAll('button').find((b) => b.text() === 'Download zip')
    expect(btn?.attributes('disabled')).toBeDefined()
    expect(btn?.attributes('title')).toMatch(/network/i)
  })

  it('removes tracks, changes format, and downloads zip', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const q = useQueueStore()
    q.add({ tagId: 1, title: 'T', part: 'lead', path: 'a' })
    q.add({ tagId: 1, title: 'T', part: 'bass', path: 'b' })
    q.add({
      kind: 'sheet',
      tagId: 1,
      title: 'T',
      part: 'pdf-1',
      path: 'sheets/1.pdf',
      label: 'PDF',
    })
    const w = mount(QueueView, { global: { plugins: [pinia] } })
    await w.get('[aria-label="Download audio as"]').setValue('mp3')
    expect(q.format).toBe('mp3')
    expect(q.tracks.filter((t) => t.kind !== 'sheet').every((t) => t.format === 'mp3')).toBe(true)
    expect(q.tracks.find((t) => t.kind === 'sheet')?.format).toBeUndefined()

    await w.findAll('button').find((b) => b.text() === 'Remove')!.trigger('click')
    expect(q.count).toBe(2)

    await w.findAll('button').find((b) => b.text() === 'Download zip')!.trigger('click')
    await flushPromises()
    expect(q.busy).toBe(false)
    expect(q.progress.done).toBe(2)

    await w.findAll('button').find((b) => b.text() === 'Clear')!.trigger('click')
    expect(q.count).toBe(0)
  })

  it('keeps queue errors on the store (App snackbar shows them)', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const q = useQueueStore()
    q.error = 'Queue limited to 100 tracks'
    const w = mount(QueueView, { global: { plugins: [pinia] } })
    expect(q.error).toContain('limited')
    expect(w.find('[role="alert"]').exists()).toBe(false)
  })
})
