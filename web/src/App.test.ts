/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import { ref } from 'vue'
import App from './App.vue'
import { useFavoritesStore } from './stores/favorites'
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
    const favorites = useFavoritesStore()
    vi.spyOn(favorites, 'ensureLoaded').mockResolvedValue()
    favorites.$patch({ records: [{ tagId: 1 } as never], loaded: true })
    useQueueStore().add({ tagId: 1, title: 'T', part: 'lead', path: 'x' })

    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/', component: { template: '<div>home</div>' } },
        { path: '/tag/:id', name: 'tag', component: { template: '<div>tag</div>' }, props: true },
        { path: '/favorites', component: { template: '<div />' } },
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
    expect(w.text()).toMatch(/Browse|Recent|Favorites|Queue/)
    expect(w.find('.top-back').exists()).toBe(false)
    await router.push('/tag/1')
    await flushPromises()
    expect(w.find('.top-back').exists()).toBe(true)
    expect(w.find('.top-back').text()).toMatch(/Browse|Back|Favorites|Practice/)
    w.unmount()
  })

  it('shows install toast on beforeinstallprompt', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    vi.spyOn(useFavoritesStore(), 'ensureLoaded').mockResolvedValue()
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
    vi.spyOn(useFavoritesStore(), 'ensureLoaded').mockResolvedValue()
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
    vi.spyOn(useFavoritesStore(), 'ensureLoaded').mockResolvedValue()
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
    vi.spyOn(useFavoritesStore(), 'ensureLoaded').mockResolvedValue()
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

  it('shows dismissible pack download progress snack while sheets download runs', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    vi.spyOn(useFavoritesStore(), 'ensureLoaded').mockResolvedValue()
    vi.spyOn(useCatalogStore(), 'hydrateFromIndexedDb').mockResolvedValue(false)
    vi.spyOn(useCatalogStore(), 'load').mockResolvedValue()
    const offlineLib = useOfflineLibraryStore()
    vi.spyOn(offlineLib, 'loadManifests').mockResolvedValue()

    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/', component: { template: '<div />' } },
        { path: '/settings', component: { template: '<div />' } },
      ],
    })
    await router.push('/')
    const w = mount(App, { global: { plugins: [pinia, router] } })
    await flushPromises()

    expect(w.find('.toast-progress').exists()).toBe(false)

    offlineLib.sheetsStatus = 'running'
    offlineLib.sheetsProgress = {
      done: 2,
      total: 10,
      ratio: 0.2,
      label: 'Sheets 2/10',
      doneBytes: 0,
      totalBytes: 0,
    }
    await flushPromises()

    const progress = w.find('.toast-progress')
    expect(progress.exists()).toBe(true)
    expect(progress.text()).toContain('Sheets 2/10')
    expect(progress.find('[role="progressbar"]').attributes('aria-valuenow')).toBe('20')
    expect(progress.find('a[href="/settings"]').exists()).toBe(true)

    await progress.findAll('button').find((b) => b.text() === 'Dismiss')!.trigger('click')
    await flushPromises()
    expect(w.find('.toast-progress').exists()).toBe(false)

    // Download still running after dismiss — snack stays hidden.
    offlineLib.sheetsProgress = {
      done: 5,
      total: 10,
      ratio: 0.5,
      label: 'Sheets 5/10',
      doneBytes: 0,
      totalBytes: 0,
    }
    await flushPromises()
    expect(w.find('.toast-progress').exists()).toBe(false)

    offlineLib.sheetsStatus = 'done'
    offlineLib.sheetsProgress = null
    await flushPromises()
    expect(w.text()).toMatch(/Offline library updated/)
    w.unmount()
  })

  it('does not toast success when a pack download is only paused', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    vi.spyOn(useFavoritesStore(), 'ensureLoaded').mockResolvedValue()
    vi.spyOn(useCatalogStore(), 'hydrateFromIndexedDb').mockResolvedValue(false)
    vi.spyOn(useCatalogStore(), 'load').mockResolvedValue()
    const offlineLib = useOfflineLibraryStore()
    offlineLib.audioStatus = 'done'
    vi.spyOn(offlineLib, 'loadManifests').mockResolvedValue()

    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/', component: { template: '<div />' } }],
    })
    await router.push('/')
    const w = mount(App, { global: { plugins: [pinia, router] } })
    await flushPromises()

    offlineLib.sheetsStatus = 'running'
    await flushPromises()
    expect(w.find('.toast-progress').exists()).toBe(true)

    offlineLib.sheetsStatus = 'paused'
    await flushPromises()
    expect(w.find('.toast-progress').exists()).toBe(false)
    expect(w.text()).not.toMatch(/Offline library updated/)
    w.unmount()
  })
})

// silence unused in stub-heavy file
void ref
