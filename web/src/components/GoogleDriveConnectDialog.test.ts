/**
 * @vitest-environment happy-dom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import GoogleDriveConnectDialog from './GoogleDriveConnectDialog.vue'
import {
  __resetGoogleAuthForTests,
  GOOGLE_DRIVE_APPDATA_SCOPE,
  googleAuthState,
  isDriveSyncEnabled,
} from '../lib/google/googleAuth'

vi.mock('../lib/google/driveAppStateSync', () => ({
  ensureDriveHydrate: vi.fn(async () => undefined),
}))

type Cb = (r: { access_token?: string; expires_in?: number; error?: string }) => void

function installGis() {
  window.google = {
    accounts: {
      oauth2: {
        initTokenClient: (cfg: { callback: Cb }) => ({
          requestAccessToken: () => {
            cfg.callback({ access_token: 'tok1', expires_in: 3600 })
          },
        }),
        revoke: vi.fn((_t: string, done?: () => void) => done?.()),
      },
    },
  }
}

describe('GoogleDriveConnectDialog', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
    __resetGoogleAuthForTests()
    setActivePinia(createPinia())
    vi.stubEnv('VITE_GOOGLE_OAUTH_CLIENT_ID', 'test-client.apps.googleusercontent.com')
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input)
        if (url.includes('tokeninfo')) {
          return {
            ok: true,
            json: async () => ({
              scope: `${GOOGLE_DRIVE_APPDATA_SCOPE} openid email profile`,
            }),
          }
        }
        return {
          ok: true,
          json: async () => ({ email: 'singer@example.com' }),
        }
      }),
    )
    installGis()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    document.body.innerHTML = ''
  })

  it('explains login value and defers song-cache choices until after connect', async () => {
    const w = mount(GoogleDriveConnectDialog, {
      props: { open: true },
      attachTo: document.body,
      global: { plugins: [createPinia()] },
    })
    await flushPromises()

    const text = document.body.textContent || ''
    expect(text).toMatch(/Sync across your devices/)
    expect(text).toMatch(/must.*be configured by Krys as a test user/i)
    expect(text).toMatch(/check your Drive for an existing song cache/i)
    expect(text).not.toMatch(/Enable local sheet music cache and sync/)
    expect(document.body.querySelectorAll('input[type="checkbox"]')).toHaveLength(0)
    w.unmount()
  })

  it('Connect enables Drive sync, signs in, and emits connected', async () => {
    const { ensureDriveHydrate } = await import('../lib/google/driveAppStateSync')
    const w = mount(GoogleDriveConnectDialog, {
      props: { open: true },
      attachTo: document.body,
      global: { plugins: [createPinia()] },
    })
    await flushPromises()

    const connect = [...document.body.querySelectorAll('button')].find((b) =>
      /^Connect$/.test((b.textContent || '').trim()),
    ) as HTMLButtonElement
    connect.click()
    await flushPromises()

    expect(isDriveSyncEnabled()).toBe(true)
    expect(googleAuthState.connected).toBe(true)
    expect(ensureDriveHydrate).toHaveBeenCalled()
    expect(w.emitted('connected')).toBeTruthy()
    w.unmount()
  })

  it('Cancel closes without signing in', async () => {
    const w = mount(GoogleDriveConnectDialog, {
      props: { open: true },
      attachTo: document.body,
      global: { plugins: [createPinia()] },
    })
    await flushPromises()

    const cancel = [...document.body.querySelectorAll('button')].find((b) =>
      /^Cancel$/.test((b.textContent || '').trim()),
    ) as HTMLButtonElement
    cancel.click()
    await flushPromises()

    expect(googleAuthState.connected).toBe(false)
    expect(w.emitted('close')).toBeTruthy()
    expect(w.emitted('connected')).toBeFalsy()
    w.unmount()
  })
})
