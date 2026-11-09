/**
 * @vitest-environment happy-dom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import AppAccountControl from './AppAccountControl.vue'
import GoogleDriveDataDialog from './GoogleDriveDataDialog.vue'
import { accountUiState, __resetAccountUiForTests } from '../lib/google/accountUi'
import { loadDriveAccountSummary } from '../lib/google/driveAccountSummary'
import { GOOGLE_CONNECTED_KEY, googleAuthState } from '../lib/google/googleAuth'
import { useSnackbarStore } from '../stores/snackbar'

vi.mock('../lib/google/driveAccountSummary', () => ({
  loadDriveAccountSummary: vi.fn(),
}))

const summary = {
  totalBytes: 2048,
  fileCount: 3,
  settingsBytes: 400,
  settingsPresent: true,
  favoriteCount: 2,
  collectionCount: 0,
  settingsUpdatedAt: '2026-11-05T15:00:00.000Z',
  sheets: { present: true, files: 4, tags: 1, bytes: 500 },
  audio: { present: false, files: 0, tags: 0, bytes: 0 },
  objectBytes: 1500,
  objectCount: 2,
  catalogBytes: 500,
}

describe('Google Drive data modal', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    __resetAccountUiForTests()
    setActivePinia(createPinia())
    vi.mocked(loadDriveAccountSummary).mockReset()
    vi.mocked(loadDriveAccountSummary).mockResolvedValue(summary)
    googleAuthState.connected = true
    googleAuthState.email = 'singer@example.com'
  })

  it('shows Drive contents and the privacy note', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/', component: { template: '<div />' } }],
    })
    const wrapper = mount(GoogleDriveDataDialog, {
      attachTo: document.body,
      props: { open: true },
      global: { plugins: [createPinia(), router] },
    })
    await flushPromises()
    const text = document.body.textContent || ''
    expect(text).toMatch(/Your Google Drive/)
    expect(text).toMatch(/App data stored/)
    expect(text).toMatch(/2\.0 KB/)
    expect(text).toMatch(/Settings & favorites/)
    expect(text).toMatch(/2 favorites/)
    expect(text).toMatch(/1 tag/)
    expect(text).toMatch(/no user database and no telemetry/)
    expect(text).toMatch(/host no servers or databases/)
    expect(text).toMatch(/your Google Drive/)
    wrapper.unmount()
  })

  it('opens from the signed-in account menu', async () => {
    localStorage.setItem(
      GOOGLE_CONNECTED_KEY,
      JSON.stringify({ connectedAt: '2026-01-01T00:00:00.000Z', email: 'singer@example.com' }),
    )
    googleAuthState.connected = true
    googleAuthState.email = 'singer@example.com'
    const pinia = createPinia()
    setActivePinia(pinia)
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/', component: { template: '<div />' } }],
    })
    await router.push('/')
    const wrapper = mount(AppAccountControl, {
      attachTo: document.body,
      global: { plugins: [pinia, router] },
    })
    await flushPromises()
    const account = document.body.querySelector('.account-btn') as HTMLButtonElement
    account.click()
    await flushPromises()
    const drive = [...document.body.querySelectorAll('button')].find((b) =>
      /Your Drive data/.test(b.textContent || ''),
    ) as HTMLButtonElement
    expect(drive).toBeTruthy()
    drive.click()
    await flushPromises()
    expect(accountUiState.driveDataOpen).toBe(true)
    expect(accountUiState.chromeMenuOpen).toBe(false)
    expect(document.body.textContent).toMatch(/Your Google Drive/)
    expect(document.body.textContent).toMatch(/no telemetry/)
    wrapper.unmount()
  })

  it('checks Drive from the account menu', async () => {
    localStorage.setItem(
      GOOGLE_CONNECTED_KEY,
      JSON.stringify({ connectedAt: '2026-01-01T00:00:00.000Z', email: 'singer@example.com' }),
    )
    googleAuthState.connected = true
    googleAuthState.email = 'singer@example.com'
    googleAuthState.driveSyncEnabled = false
    const pinia = createPinia()
    setActivePinia(pinia)
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/', component: { template: '<div />' } }],
    })
    await router.push('/')
    const wrapper = mount(AppAccountControl, {
      attachTo: document.body,
      global: { plugins: [pinia, router] },
    })
    await flushPromises()
    const account = document.body.querySelector('.account-btn') as HTMLButtonElement
    account.click()
    await flushPromises()
    const check = [...document.body.querySelectorAll('button')].find((b) =>
      /Check for updates/.test(b.textContent || ''),
    ) as HTMLButtonElement
    expect(check).toBeTruthy()
    check.click()
    await flushPromises()
    expect(useSnackbarStore().title).toBe('Google Drive')
    expect(useSnackbarStore().message).toMatch(/Turn on Google Drive sync in Labs/)
    expect(accountUiState.chromeMenuOpen).toBe(false)
    wrapper.unmount()
  })
})
