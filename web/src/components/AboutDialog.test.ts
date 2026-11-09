/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import AboutDialog from './AboutDialog.vue'
import { resetPwaInstallStateForTests } from '../composables/usePwaInstall'
import { useOfflineLibraryStore } from '../stores/offlineLibrary'
import { checkForAppUpdate } from '../lib/pwaAppUpdate'

vi.mock('../lib/pwaAppUpdate', () => ({
  checkForAppUpdate: vi.fn(async () => ({ status: 'current' as const })),
}))

const mockedCheckForAppUpdate = vi.mocked(checkForAppUpdate)

async function mountAbout() {
  const pinia = createPinia()
  setActivePinia(pinia)
  vi.spyOn(useOfflineLibraryStore(), 'refreshEstimate').mockResolvedValue()
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: { template: '<div />' } }],
  })
  await router.push('/')
  const w = mount(AboutDialog, {
    props: { open: true },
    attachTo: document.body,
    global: { plugins: [pinia, router] },
  })
  await flushPromises()
  return w
}

describe('AboutDialog', () => {
  beforeEach(() => {
    localStorage.clear()
    resetPwaInstallStateForTests()
    setActivePinia(createPinia())
    vi.spyOn(useOfflineLibraryStore(), 'refreshEstimate').mockResolvedValue()
    mockedCheckForAppUpdate.mockReset()
    mockedCheckForAppUpdate.mockResolvedValue({ status: 'current' })
  })

  it('shows Install App when the app is not installed', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/', component: { template: '<div />' } }],
    })
    await router.push('/')

    const w = mount(AboutDialog, {
      props: { open: true },
      attachTo: document.body,
      global: { plugins: [createPinia(), router] },
    })
    await flushPromises()

    const installBtn = [...document.body.querySelectorAll('button')].find((b) =>
      /Install App/.test(b.textContent || ''),
    )
    expect(installBtn).toBeTruthy()
    w.unmount()
  })

  it('still shows Install App after a stale pwaInstalled flag (e.g. uninstall)', async () => {
    localStorage.setItem('singtags.pwaInstalled', '1')
    resetPwaInstallStateForTests()
    const pinia = createPinia()
    setActivePinia(pinia)
    vi.spyOn(useOfflineLibraryStore(), 'refreshEstimate').mockResolvedValue()

    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/', component: { template: '<div />' } }],
    })
    await router.push('/')

    const w = mount(AboutDialog, {
      props: { open: true },
      attachTo: document.body,
      global: { plugins: [pinia, router] },
    })
    await flushPromises()

    const installBtn = [...document.body.querySelectorAll('button')].find((b) =>
      /Install App/.test(b.textContent || ''),
    )
    expect(installBtn).toBeTruthy()
    w.unmount()
  })

  it('offers Check for app update on the about panel', async () => {
    const w = await mountAbout()
    const updateBtn = [...document.body.querySelectorAll('button')].find((b) =>
      /Check for app update/.test(b.textContent || ''),
    )
    expect(updateBtn).toBeTruthy()
    w.unmount()
  })

  it('opens the app update panel and shows Force refresh when current', async () => {
    const w = await mountAbout()
    const updateBtn = [...document.body.querySelectorAll('button')].find((b) =>
      /Check for app update/.test(b.textContent || ''),
    )
    expect(updateBtn).toBeTruthy()
    updateBtn!.click()
    await flushPromises()

    expect(document.getElementById('about-update-title')?.textContent).toMatch(/App update/)
    expect(mockedCheckForAppUpdate).toHaveBeenCalled()
    expect(document.body.textContent).toMatch(/No update waiting/)
    const forceBtn = [...document.body.querySelectorAll('button')].find((b) =>
      /^Force refresh$/.test((b.textContent || '').trim()),
    )
    expect(forceBtn).toBeTruthy()
    w.unmount()
  })

  it('returns from the update panel to about on Escape', async () => {
    const w = await mountAbout()
    const updateBtn = [...document.body.querySelectorAll('button')].find((b) =>
      /Check for app update/.test(b.textContent || ''),
    )
    updateBtn!.click()
    await flushPromises()
    expect(document.getElementById('about-update-title')).toBeTruthy()

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await flushPromises()

    expect(document.getElementById('about-update-title')).toBeFalsy()
    expect(document.getElementById('about-title')?.textContent).toMatch(/SingTags/)
    expect(w.emitted('close')).toBeFalsy()
    w.unmount()
  })

  it('shows how-to dialog when install prompt is unavailable', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    vi.spyOn(useOfflineLibraryStore(), 'refreshEstimate').mockResolvedValue()

    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/', component: { template: '<div />' } }],
    })
    await router.push('/')

    const w = mount(AboutDialog, {
      props: { open: true },
      attachTo: document.body,
      global: { plugins: [pinia, router] },
    })
    await flushPromises()

    const installBtn = [...document.body.querySelectorAll('button')].find((b) =>
      /Install App/.test(b.textContent || ''),
    )
    expect(installBtn).toBeTruthy()
    installBtn!.click()
    await flushPromises()

    expect(document.body.textContent).toMatch(/Got it/)
    expect(w.emitted('close')).toBeFalsy()
    w.unmount()
  })
})
