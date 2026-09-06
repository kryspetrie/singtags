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

describe('AboutDialog', () => {
  beforeEach(() => {
    localStorage.clear()
    resetPwaInstallStateForTests()
    setActivePinia(createPinia())
    vi.spyOn(useOfflineLibraryStore(), 'refreshEstimate').mockResolvedValue()
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
