/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import { ref } from 'vue'
import App from './App.vue'
import { useStarsStore } from './stores/stars'
import { useQueueStore } from './stores/queue'

describe('App shell', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  it('renders brand and nav links', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const stars = useStarsStore()
    vi.spyOn(stars, 'ensureLoaded').mockResolvedValue()
    stars.$patch({ records: [{ tagId: 1 } as never], loaded: true })
    useQueueStore().add({ tagId: 1, title: 'T', part: 'lead', path: 'x' })

    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/', component: { template: '<div>home</div>' } },
        { path: '/starred', component: { template: '<div />' } },
        { path: '/pitch-pipe', component: { template: '<div />' } },
        { path: '/queue', component: { template: '<div />' } },
      ],
    })
    await router.push('/')
    const w = mount(App, { global: { plugins: [pinia, router] } })
    await flushPromises()
    expect(w.text()).toContain('SingTags')
    expect(w.text()).toMatch(/Browse|Starred|Queue/)
    w.unmount()
  })

  it('shows install toast on beforeinstallprompt', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    vi.spyOn(useStarsStore(), 'ensureLoaded').mockResolvedValue()
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/', component: { template: '<div />' } }],
    })
    await router.push('/')
    const w = mount(App, { global: { plugins: [pinia, router] } })
    const prompt = vi.fn(async () => {})
    const ev = new Event('beforeinstallprompt')
    Object.assign(ev, {
      prompt,
      userChoice: Promise.resolve({ outcome: 'dismissed' }),
      preventDefault: () => {},
    })
    window.dispatchEvent(ev)
    await flushPromises()
    expect(w.text()).toMatch(/Install SingTags/)
    await w.findAll('button').find((b) => b.text() === 'Not now')!.trigger('click')
    expect(w.text()).not.toMatch(/Install SingTags/)
    w.unmount()
  })
})

// silence unused in stub-heavy file
void ref
