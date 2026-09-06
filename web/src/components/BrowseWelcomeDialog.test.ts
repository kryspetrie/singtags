/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import BrowseWelcomeDialog from './BrowseWelcomeDialog.vue'
import { resetPwaInstallStateForTests } from '../composables/usePwaInstall'

describe('BrowseWelcomeDialog', () => {
  beforeEach(() => {
    localStorage.clear()
    resetPwaInstallStateForTests()
    setActivePinia(createPinia())
  })

  it('shows Install App button for first-open install on this device', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/', component: { template: '<div />' } }],
    })
    await router.push('/')

    const w = mount(BrowseWelcomeDialog, {
      props: { open: true },
      attachTo: document.body,
      global: { plugins: [createPinia(), router] },
    })
    await flushPromises()

    expect(document.body.textContent).toMatch(/Install App on this device/)
    const installBtn = [...document.body.querySelectorAll('button')].find((b) =>
      /^Install App$/.test((b.textContent || '').trim()),
    )
    expect(installBtn).toBeTruthy()
    expect(installBtn!.className).toMatch(/btn-install-app/)
    w.unmount()
  })

  it('triggers native install prompt when available', async () => {
    resetPwaInstallStateForTests()
    const { startPwaInstallListeners, stopPwaInstallListeners } = await import(
      '../composables/usePwaInstall'
    )
    startPwaInstallListeners()
    const prompt = vi.fn(async () => {})
    const ev = new Event('beforeinstallprompt')
    Object.assign(ev, {
      prompt,
      userChoice: Promise.resolve({ outcome: 'accepted' }),
      preventDefault: () => {},
    })
    window.dispatchEvent(ev)

    const pinia = createPinia()
    setActivePinia(pinia)
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/', component: { template: '<div />' } }],
    })
    await router.push('/')

    const w = mount(BrowseWelcomeDialog, {
      props: { open: true },
      attachTo: document.body,
      global: { plugins: [pinia, router] },
    })
    await flushPromises()

    const installBtn = [...document.body.querySelectorAll('button')].find((b) =>
      /^Install App$/.test((b.textContent || '').trim()),
    )
    expect(installBtn).toBeTruthy()
    await installBtn!.click()
    await flushPromises()
    expect(prompt).toHaveBeenCalled()
    stopPwaInstallListeners()
    w.unmount()
  })

  it('shows how-to dialog when install prompt is unavailable', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/', component: { template: '<div />' } }],
    })
    await router.push('/')

    const w = mount(BrowseWelcomeDialog, {
      props: { open: true },
      attachTo: document.body,
      global: { plugins: [pinia, router] },
    })
    await flushPromises()

    const installBtn = [...document.body.querySelectorAll('button')].find((b) =>
      /^Install App$/.test((b.textContent || '').trim()),
    )
    await installBtn!.click()
    await flushPromises()

    expect(document.body.textContent).toMatch(/Install SingTags/)
    expect(document.body.textContent).toMatch(/Got it/)
    w.unmount()
  })

  it('shows Continue and Skip, offline note, and no Offline settings link', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/', component: { template: '<div />' } }],
    })
    await router.push('/')

    const w = mount(BrowseWelcomeDialog, {
      props: { open: true },
      attachTo: document.body,
      global: { plugins: [createPinia(), router] },
    })
    await flushPromises()

    expect(document.body.textContent).toMatch(
      /Once sheets and tracks are cached, this site and app can be used entirely offline/,
    )
    expect(document.body.textContent).not.toMatch(/Offline settings/)

    const continueBtn = [...document.body.querySelectorAll('button')].find((b) =>
      /^Continue$/.test((b.textContent || '').trim()),
    )
    const skipBtn = [...document.body.querySelectorAll('button')].find((b) =>
      /^Skip$/.test((b.textContent || '').trim()),
    )
    expect(continueBtn).toBeTruthy()
    expect(skipBtn).toBeTruthy()

    await skipBtn!.click()
    expect(w.emitted('close')).toBeTruthy()
    w.unmount()
  })
})
