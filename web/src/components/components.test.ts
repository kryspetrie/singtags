/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import EmptyState from '../components/EmptyState.vue'
import SheetViewer from '../components/SheetViewer.vue'
import { useQueueStore } from '../stores/queue'
import { MAX_QUEUE_TRACKS } from '../download/zip'

describe('EmptyState', () => {
  it('renders title and message', () => {
    const w = mount(EmptyState, {
      props: { title: 'Empty', message: 'Nothing found', tone: 'danger' },
    })
    expect(w.text()).toContain('Empty')
    expect(w.text()).toContain('Nothing found')
    expect(w.attributes('data-tone') || w.find('[data-tone]').attributes('data-tone')).toBe(
      'danger',
    )
  })
})

describe('SheetViewer', () => {
  it('shows empty status when no pages', () => {
    const w = mount(SheetViewer, { props: { pages: [] } })
    expect(w.text()).toContain('No sheet music available')
  })

  it('renders images for pages', async () => {
    const w = mount(SheetViewer, {
      props: {
        pages: ['sheets/1/pages/page-01.webp'],
        baseUrl: '/sample-data/',
        cropToContent: false,
      },
    })
    await flushPromises()
    const img = w.find('img')
    expect(img.exists()).toBe(true)
    expect(img.attributes('src')).toBe('/sample-data/sheets/1/pages/page-01.webp')
    expect(img.attributes('alt')).toBe('Sheet page 1')
  })
})

describe('queue store', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  it('enforces 100-track cap', () => {
    const q = useQueueStore()
    for (let i = 0; i < MAX_QUEUE_TRACKS + 5; i++) {
      q.add({
        tagId: i,
        title: `T${i}`,
        part: 'lead',
        path: `media/${i}/lead.mp4`,
      })
    }
    expect(q.count).toBe(MAX_QUEUE_TRACKS)
    expect(q.error).toMatch(/100/)
  })

  it('dedupes tag+part', () => {
    const q = useQueueStore()
    q.add({ tagId: 1, title: 'A', part: 'lead', path: 'x' })
    q.add({ tagId: 1, title: 'A', part: 'lead', path: 'x' })
    expect(q.count).toBe(1)
  })
})
