/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import AppMoreMenu from './AppMoreMenu.vue'
import { useOfflineModeStore } from '../stores/offlineMode'
import { usePreferencesStore } from '../stores/preferences'
import { useSnackbarStore } from '../stores/snackbar'

describe('AppMoreMenu', () => {
  beforeEach(() => {
    localStorage.clear()
    document.body.innerHTML = ''
  })

  it('toggles sing mode, closes, and shows snackbar', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/', component: { template: '<div />' } },
        { path: '/settings', name: 'settings', component: { template: '<div />' } },
        { path: '/queue', name: 'queue', component: { template: '<div />' } },
      ],
    })
    await router.push('/')

    const w = mount(AppMoreMenu, {
      props: { open: true },
      attachTo: document.body,
      global: { plugins: [pinia, router] },
    })
    const prefs = usePreferencesStore()
    const snackbar = useSnackbarStore()

    await flushPromises()
    await new Promise((r) => setTimeout(r, 80))
    await flushPromises()

    const toggle = document.body.querySelector(
      'input.setting-switch[aria-label="Sing mode"]',
    ) as HTMLInputElement
    expect(toggle).toBeTruthy()
    toggle.checked = true
    toggle.dispatchEvent(new Event('change'))
    await flushPromises()

    expect(prefs.singMode).toBe(true)
    expect(snackbar.title).toBe('Sing Mode On')
    expect(snackbar.message).toBe('Tags open in the fullscreen sheet')
    expect(snackbar.placement).toBe('center')
    expect(w.emitted('close')).toBeTruthy()
    w.unmount()
  })

  it('toggles offline mode, closes, and shows centered snackbar', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/', component: { template: '<div />' } }],
    })
    await router.push('/')

    const w = mount(AppMoreMenu, {
      props: { open: true },
      attachTo: document.body,
      global: { plugins: [pinia, router] },
    })
    const offlineMode = useOfflineModeStore()
    const snackbar = useSnackbarStore()

    await flushPromises()
    await new Promise((r) => setTimeout(r, 80))
    await flushPromises()

    const toggle = document.body.querySelector(
      'input.setting-switch[aria-label="Offline mode"]',
    ) as HTMLInputElement
    expect(toggle).toBeTruthy()
    toggle.checked = true
    toggle.dispatchEvent(new Event('change'))
    await flushPromises()

    expect(offlineMode.manualOffline).toBe(true)
    expect(snackbar.title).toBe('Offline Mode On')
    expect(snackbar.message).toBe('Using cached content only')
    expect(snackbar.placement).toBe('center')
    expect(w.emitted('close')).toBeTruthy()
    w.unmount()
  })

  it('shows Tag Roulette in More when Labs flag is on', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    usePreferencesStore().setTagRouletteEnabled(true)
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/', component: { template: '<div />' } },
        { path: '/labs/roulette', name: 'labs-roulette', component: { template: '<div />' } },
      ],
    })
    await router.push('/')

    const w = mount(AppMoreMenu, {
      props: { open: true },
      attachTo: document.body,
      global: { plugins: [pinia, router] },
    })
    await flushPromises()
    await new Promise((r) => setTimeout(r, 80))
    await flushPromises()

    expect(document.body.textContent).toContain('Tag Roulette')
    expect(document.body.querySelector('a[href="/labs/roulette"]')).toBeTruthy()
    w.unmount()
  })
})
