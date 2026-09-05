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
import { useSnackbarStore } from '../stores/snackbar'

describe('AboutDialog', () => {
  beforeEach(() => {
    localStorage.clear()
    resetPwaInstallStateForTests()
    setActivePinia(createPinia())
    vi.spyOn(useOfflineLibraryStore(), 'refreshEstimate').mockResolvedValue()
  })

  it('shows Install when the app is not installed', async () => {
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
      /Install|How to install/.test(b.textContent || ''),
    )
    expect(installBtn).toBeTruthy()
    w.unmount()
  })

  it('hides Install when already marked installed', async () => {
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
      /Install|How to install/.test(b.textContent || ''),
    )
    expect(installBtn).toBeFalsy()
    w.unmount()
  })

  it('shows how-to snackbar when install prompt is unavailable', async () => {
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
      /How to install|Install/.test(b.textContent || ''),
    )
    expect(installBtn).toBeTruthy()
    installBtn!.click()
    await flushPromises()

    const snackbar = useSnackbarStore()
    expect(snackbar.title).toBe('Install SingTags')
    expect(w.emitted('close')).toBeTruthy()
    w.unmount()
  })
})
