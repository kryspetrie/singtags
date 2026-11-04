/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import AppAccountControl from './AppAccountControl.vue'
import AppMoreMenu from './AppMoreMenu.vue'
import { resetPwaInstallStateForTests } from '../composables/usePwaInstall'
import {
  __resetAccountUiForTests,
  accountUiState,
} from '../lib/google/accountUi'
import {
  __resetGoogleAuthForTests,
  GOOGLE_CONNECTED_KEY,
  googleAuthState,
} from '../lib/google/googleAuth'
import { useOfflineModeStore } from '../stores/offlineMode'
import { usePreferencesStore } from '../stores/preferences'
import { useSnackbarStore } from '../stores/snackbar'

describe('AppMoreMenu', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
    __resetGoogleAuthForTests()
    __resetAccountUiForTests()
    resetPwaInstallStateForTests()
    document.body.innerHTML = ''
    vi.stubEnv('VITE_GOOGLE_OAUTH_CLIENT_ID', 'test-client.apps.googleusercontent.com')
    // Mobile path: More shows account; desktop chrome owns it instead.
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: (query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }),
    })
  })

  afterEach(() => {
    vi.unstubAllEnvs()
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

  it('does not list Tag Roulette in More when it is pinned to primary nav', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/', component: { template: '<div />' } },
        { path: '/roulette', name: 'roulette', component: { template: '<div />' } },
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

    expect(document.body.textContent).not.toContain('Tag Roulette')
    expect(document.body.querySelector('a[href="/roulette"]')).toBeNull()
    expect(document.body.querySelector('a[href="/labs/roulette"]')).toBeNull()
    w.unmount()
  })

  it('lists Roulette in More after it is moved out of the primary pins', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    usePreferencesStore().setPrimaryNavOrder([
      'browse',
      'recent',
      'favorites',
      'pitch-pipe',
      'settings',
      'roulette',
      'labs',
      'queue',
    ])
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/', component: { template: '<div />' } },
        { path: '/roulette', name: 'roulette', component: { template: '<div />' } },
        { path: '/settings', name: 'settings', component: { template: '<div />' } },
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

    expect(document.body.querySelector('a[href="/roulette"]')).toBeTruthy()
    expect(document.body.textContent).toMatch(/Roulette/)
    expect(document.body.querySelector('a[href="/settings"]')).toBeNull()
    w.unmount()
  })

  it('shows prominent Install App when PWA is not installed', async () => {
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
    await flushPromises()
    await new Promise((r) => setTimeout(r, 80))
    await flushPromises()

    const installBtn = document.body.querySelector('.menu-item-install') as HTMLButtonElement
    expect(installBtn).toBeTruthy()
    expect(installBtn.textContent).toMatch(/Install App/)
    expect(document.body.textContent).toMatch(/Settings/)
    expect(document.body.querySelector('[aria-label="Display size"]')).toBeNull()
    const menu = document.body.querySelector('nav.menu') as HTMLElement
    expect(menu?.lastElementChild).toBe(installBtn)
    w.unmount()
  })

  it('still shows Install App after a stale pwaInstalled flag (e.g. uninstall)', async () => {
    localStorage.setItem('singtags.pwaInstalled', '1')
    resetPwaInstallStateForTests()
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
    await flushPromises()
    await new Promise((r) => setTimeout(r, 80))
    await flushPromises()

    const installBtn = document.body.querySelector('.menu-item-install') as HTMLButtonElement
    expect(installBtn).toBeTruthy()
    expect(installBtn.textContent).toMatch(/Install App/)
    w.unmount()
  })

  it('shows Downloads & Exports in More on desktop and mobile', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/', component: { template: '<div />' } },
        { path: '/queue', name: 'queue', component: { template: '<div />' } },
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

    const link = document.body.querySelector('a[href="/queue"]') as HTMLAnchorElement
    expect(link).toBeTruthy()
    expect(link.textContent).toMatch(/Downloads & Exports/)
    expect(getComputedStyle(link).display).not.toBe('none')
    w.unmount()
  })

  it('shows Audio Recorder in More (promoted out of Labs)', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    expect(usePreferencesStore().audioRecorderEnabled).toBe(true)
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/', component: { template: '<div />' } },
        { path: '/recorder', name: 'recorder', component: { template: '<div />' } },
        { path: '/settings', name: 'settings', component: { template: '<div />' } },
        { path: '/labs', name: 'labs', component: { template: '<div />' } },
        { path: '/queue', name: 'queue', component: { template: '<div />' } },
        { path: '/tx', name: 'tx', component: { template: '<div />' } },
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

    expect(document.body.textContent).toMatch(/Audio Recorder/)
    const link = document.body.querySelector('a[href="/recorder"]') as HTMLAnchorElement
    expect(link).toBeTruthy()
    w.unmount()
  })

  it('shows Sing Together in More when the Labs flag is on', async () => {
    localStorage.setItem('singtags.labs.singTogether.enabled.v1', '1')
    const pinia = createPinia()
    setActivePinia(pinia)
    expect(usePreferencesStore().singTogetherEnabled).toBe(true)
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/', component: { template: '<div />' } },
        { path: '/matcher', name: 'matcher', component: { template: '<div />' } },
        { path: '/settings', name: 'settings', component: { template: '<div />' } },
        { path: '/labs', name: 'labs', component: { template: '<div />' } },
        { path: '/queue', name: 'queue', component: { template: '<div />' } },
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

    expect(document.body.textContent).toMatch(/Sing Together/)
    const link = document.body.querySelector('a[href="/matcher"]') as HTMLAnchorElement
    expect(link).toBeTruthy()
    w.unmount()
  })

  it('shows Tag Studio in More when the Labs flag is on', async () => {
    localStorage.setItem('singtags.labs.tagRoll.enabled.v1', '1')
    const pinia = createPinia()
    setActivePinia(pinia)
    expect(usePreferencesStore().tagRollEnabled).toBe(true)
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/', component: { template: '<div />' } },
        { path: '/tag-studio', name: 'tag-studio', component: { template: '<div />' } },
        { path: '/settings', name: 'settings', component: { template: '<div />' } },
        { path: '/labs', name: 'labs', component: { template: '<div />' } },
        { path: '/queue', name: 'queue', component: { template: '<div />' } },
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

    expect(document.body.textContent).toMatch(/Tag Studio/)
    const link = document.body.querySelector('a[href="/tag-studio"]') as HTMLAnchorElement
    expect(link).toBeTruthy()
    w.unmount()
  })

  it('opens the Drive connect modal from Log in with Google', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/', component: { template: '<div />' } }],
    })
    await router.push('/')

    const account = mount(AppAccountControl, {
      attachTo: document.body,
      global: { plugins: [pinia, router] },
    })
    const w = mount(AppMoreMenu, {
      props: { open: true },
      attachTo: document.body,
      global: { plugins: [pinia, router] },
    })
    await flushPromises()
    await new Promise((r) => setTimeout(r, 80))
    await flushPromises()

    const login = [...document.body.querySelectorAll('button.menu-item-account')].find((b) =>
      /Log in with Google/.test(b.textContent || ''),
    ) as HTMLButtonElement
    expect(login).toBeTruthy()
    login.click()
    await flushPromises()

    expect(accountUiState.connectOpen).toBe(true)
    expect(document.body.textContent).toMatch(/Sync across your devices/)
    expect(document.body.textContent).toMatch(/Your data & privacy/)
    w.unmount()
    account.unmount()
  })

  it('shows Log out when already connected and confirms disconnect', async () => {
    localStorage.setItem(
      GOOGLE_CONNECTED_KEY,
      JSON.stringify({ connectedAt: '2026-01-01T00:00:00.000Z', email: 'a@b.com' }),
    )
    googleAuthState.connected = true
    googleAuthState.email = 'a@b.com'

    const pinia = createPinia()
    setActivePinia(pinia)
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/', component: { template: '<div />' } }],
    })
    await router.push('/')

    const account = mount(AppAccountControl, {
      attachTo: document.body,
      global: { plugins: [pinia, router] },
    })
    const w = mount(AppMoreMenu, {
      props: { open: true },
      attachTo: document.body,
      global: { plugins: [pinia, router] },
    })
    await flushPromises()
    await new Promise((r) => setTimeout(r, 80))
    await flushPromises()

    const logout = [...document.body.querySelectorAll('button.menu-item-account')].find((b) =>
      /Log out/.test(b.textContent || ''),
    ) as HTMLButtonElement
    expect(logout).toBeTruthy()
    expect(logout.textContent).toMatch(/a@b\.com/)
    logout.click()
    await flushPromises()

    expect(accountUiState.logoutConfirmOpen).toBe(true)
    expect(document.body.textContent).toMatch(/Log out of Google/)
    const confirm = [...document.body.querySelectorAll('button')].find((b) =>
      /^Log out$/.test((b.textContent || '').trim()),
    ) as HTMLButtonElement
    confirm.click()
    await flushPromises()

    expect(googleAuthState.connected).toBe(false)
    expect(useSnackbarStore().title).toBe('Logged out')
    w.unmount()
    account.unmount()
  })
})
