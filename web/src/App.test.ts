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
import { useOfflineLibraryStore } from './stores/offlineLibrary'
import { useCatalogStore } from './stores/catalog'

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
        { path: '/tag/:id', name: 'tag', component: { template: '<div>tag</div>' }, props: true },
        { path: '/starred', component: { template: '<div />' } },
        { path: '/recent', component: { template: '<div />' } },
        { path: '/pitch-pipe', component: { template: '<div />' } },
        { path: '/queue', component: { template: '<div />' } },
      ],
    })
    await router.push('/')
    const w = mount(App, { global: { plugins: [pinia, router] } })
    await flushPromises()
    expect(w.text()).toContain('SingTags')
    expect(w.find('.brand-tagline').exists()).toBe(true)
    expect(w.text()).toMatch(/Browse|Recent|Starred|Queue/)
    expect(w.find('.top-back').exists()).toBe(false)
    await router.push('/tag/1')
    await flushPromises()
    expect(w.find('.top-back').exists()).toBe(true)
    expect(w.find('.top-back').text()).toContain('Back')
    w.unmount()
  })

  it('shows install toast on beforeinstallprompt', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    vi.spyOn(useStarsStore(), 'ensureLoaded').mockResolvedValue()
    vi.spyOn(useCatalogStore(), 'hydrateFromIndexedDb').mockResolvedValue(false)
    vi.spyOn(useCatalogStore(), 'load').mockResolvedValue()
    vi.spyOn(useOfflineLibraryStore(), 'loadManifests').mockResolvedValue()
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/', component: { template: '<div />' } }],
    })
    await router.push('/')
    const w = mount(App, { global: { plugins: [pinia, router] } })
    await flushPromises()
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
    expect(localStorage.getItem('singtags.installPrompt.dismissed')).toBe('1')
    w.unmount()
  })

  it('hides install toast when appinstalled fires after Chrome title-bar install', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    vi.spyOn(useStarsStore(), 'ensureLoaded').mockResolvedValue()
    vi.spyOn(useCatalogStore(), 'hydrateFromIndexedDb').mockResolvedValue(false)
    vi.spyOn(useCatalogStore(), 'load').mockResolvedValue()
    vi.spyOn(useOfflineLibraryStore(), 'loadManifests').mockResolvedValue()
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/', component: { template: '<div />' } }],
    })
    await router.push('/')
    const w = mount(App, { global: { plugins: [pinia, router] } })
    await flushPromises()
    const ev = new Event('beforeinstallprompt')
    Object.assign(ev, {
      prompt: vi.fn(async () => {}),
      userChoice: Promise.resolve({ outcome: 'accepted' }),
      preventDefault: () => {},
    })
    window.dispatchEvent(ev)
    await flushPromises()
    expect(w.text()).toMatch(/Install SingTags/)
    window.dispatchEvent(new Event('appinstalled'))
    await flushPromises()
    expect(w.text()).not.toMatch(/Install SingTags/)
    expect(localStorage.getItem('singtags.pwaInstalled')).toBe('1')
    w.unmount()
  })

  it('does not show install toast after prior install', async () => {
    localStorage.setItem('singtags.pwaInstalled', '1')
    const pinia = createPinia()
    setActivePinia(pinia)
    vi.spyOn(useStarsStore(), 'ensureLoaded').mockResolvedValue()
    vi.spyOn(useCatalogStore(), 'hydrateFromIndexedDb').mockResolvedValue(false)
    vi.spyOn(useCatalogStore(), 'load').mockResolvedValue()
    vi.spyOn(useOfflineLibraryStore(), 'loadManifests').mockResolvedValue()
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/', component: { template: '<div />' } }],
    })
    await router.push('/')
    const w = mount(App, { global: { plugins: [pinia, router] } })
    await flushPromises()
    const ev = new Event('beforeinstallprompt')
    Object.assign(ev, {
      prompt: vi.fn(async () => {}),
      userChoice: Promise.resolve({ outcome: 'dismissed' }),
      preventDefault: () => {},
    })
    window.dispatchEvent(ev)
    await flushPromises()
    expect(w.text()).not.toMatch(/Install SingTags/)
    w.unmount()
  })

  it('shows global offline banner when offline with cached catalog', async () => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false })
    const pinia = createPinia()
    setActivePinia(pinia)
    vi.spyOn(useStarsStore(), 'ensureLoaded').mockResolvedValue()
    vi.spyOn(useCatalogStore(), 'hydrateFromIndexedDb').mockResolvedValue(false)
    vi.spyOn(useCatalogStore(), 'load').mockResolvedValue()
    const offlineLib = useOfflineLibraryStore()
    offlineLib.catalogCachedAt = '2026-01-01T00:00:00.000Z'
    offlineLib.sheetsStatus = 'done'
    vi.spyOn(offlineLib, 'loadManifests').mockResolvedValue()

    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/', component: { template: '<div />' } }],
    })
    await router.push('/')
    const w = mount(App, { global: { plugins: [pinia, router] } })
    await flushPromises()
    const banner = w.find('.offline-banner')
    expect(banner.exists()).toBe(true)
    expect(banner.text()).toMatch(/Offline/)
    expect(banner.text()).toContain('Offline settings')
    w.unmount()
  })
})

// silence unused in stub-heavy file
void ref
