/**
 * @vitest-environment happy-dom
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import SettingsView from './SettingsView.vue'
import { useOfflineLibraryStore } from '../stores/offlineLibrary'

function installStorage(persistResult: boolean) {
  let persisted = false
  Object.defineProperty(navigator, 'storage', {
    configurable: true,
    value: {
      persist: vi.fn(async () => {
        persisted = persistResult
        return persistResult
      }),
      persisted: vi.fn(async () => persisted),
      estimate: vi.fn(async () => ({ usage: 10, quota: 1000 })),
    },
  })
}

async function mountOfflineSettings() {
  const pinia = createPinia()
  setActivePinia(pinia)
  const offline = useOfflineLibraryStore()
  vi.spyOn(offline, 'loadManifests').mockResolvedValue()
  vi.spyOn(offline, 'refreshCacheReady').mockResolvedValue()
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/settings', component: { template: '<div />' } }],
  })
  await router.push('/settings?tab=offline')
  const wrapper = mount(SettingsView, {
    attachTo: document.body,
    global: { plugins: [pinia, router] },
  })
  await flushPromises()
  return wrapper
}

describe('Protect offline data', () => {
  afterEach(() => {
    document.body.innerHTML = ''
    vi.restoreAllMocks()
  })

  it('shows a denial next to the button when the browser refuses', async () => {
    installStorage(false)
    const wrapper = await mountOfflineSettings()
    const button = [...document.body.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('Protect offline data'),
    )
    expect(button).toBeTruthy()
    button!.click()
    await flushPromises()
    const notice = document.body.querySelector('.persist-notice')
    expect(notice?.textContent).toMatch(/did not grant protection/)
    expect(notice?.className).toMatch(/warn/)
    expect(document.body.textContent).toMatch(/Protect offline data/)
    wrapper.unmount()
  })

  it('shows protection was granted and hides the button', async () => {
    installStorage(true)
    const wrapper = await mountOfflineSettings()
    const button = [...document.body.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('Protect offline data'),
    )
    button!.click()
    await flushPromises()
    const notice = document.body.querySelector('.persist-notice')
    expect(notice?.textContent).toMatch(/Protected/)
    expect(notice?.className).toMatch(/ok/)
    expect(document.body.textContent).toMatch(/Protected from cleanup/)
    expect(document.body.textContent).not.toMatch(/Protect offline data/)
    wrapper.unmount()
  })
})
