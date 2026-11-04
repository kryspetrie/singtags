/**
 * @vitest-environment happy-dom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  GOOGLE_CONNECTED_KEY,
  GOOGLE_DRIVE_APPDATA_SCOPE,
  GOOGLE_SCOPES,
  GoogleAuthError,
  __resetGoogleAuthForTests,
  getAccessToken,
  googleAuthState,
  isDriveSyncEnabled,
  restoreGoogleConnection,
  setDriveSyncEnabled,
  signIn,
  signOut,
  testDriveConnection,
} from './googleAuth'

type Cb = (r: { access_token?: string; expires_in?: number; error?: string }) => void

function installGis(opts: { fail?: boolean } = {}) {
  const requests: Array<{ prompt?: string }> = []
  const revoke = vi.fn((_t: string, done?: () => void) => done?.())
  let n = 0
  window.google = {
    accounts: {
      oauth2: {
        initTokenClient: (cfg: { callback: Cb; error_callback?: (e: { message?: string }) => void }) => ({
          requestAccessToken: (o?: { prompt?: string }) => {
            requests.push(o ?? {})
            if (opts.fail) cfg.error_callback?.({ message: 'popup closed' })
            else cfg.callback({ access_token: `tok${++n}`, expires_in: 3600 })
          },
        }),
        revoke,
      },
    },
  }
  return { requests, revoke }
}

describe('googleAuth', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
    __resetGoogleAuthForTests()
    vi.stubEnv('VITE_GOOGLE_OAUTH_CLIENT_ID', 'test-client.apps.googleusercontent.com')
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input)
        if (url.includes('tokeninfo')) {
          return new Response(
            JSON.stringify({
              scope: `${GOOGLE_DRIVE_APPDATA_SCOPE} openid email profile`,
            }),
            { status: 200 },
          )
        }
        return new Response(JSON.stringify({ email: 'a@b.com' }), { status: 200 })
      }),
    )
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    delete window.google
  })

  it('requests only drive.appdata plus identity scopes', () => {
    expect(GOOGLE_SCOPES).toContain(GOOGLE_DRIVE_APPDATA_SCOPE)
    expect(GOOGLE_SCOPES).not.toMatch(/auth\/drive(\s|$)/)
  })

  it('stores Drive sync Labs flag, default off', () => {
    expect(isDriveSyncEnabled()).toBe(false)
    expect(googleAuthState.driveSyncEnabled).toBe(false)
    setDriveSyncEnabled(true)
    expect(isDriveSyncEnabled()).toBe(true)
    expect(googleAuthState.driveSyncEnabled).toBe(true)
  })

  it('signIn forces consent and persists connection marker and email, not the token', async () => {
    const { requests } = installGis()
    await signIn()
    expect(requests[0]).toEqual({ prompt: 'consent' })
    expect(googleAuthState.connected).toBe(true)
    expect(googleAuthState.email).toBe('a@b.com')
    const raw = localStorage.getItem(GOOGLE_CONNECTED_KEY)!
    expect(raw).not.toMatch(/tok1/)
    __resetGoogleAuthForTests()
    restoreGoogleConnection()
    expect(googleAuthState.connected).toBe(true)
    expect(googleAuthState.email).toBe('a@b.com')
  })

  it('rejects Connect when the token lacks drive.appdata', async () => {
    installGis()
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input)
        if (url.includes('tokeninfo')) {
          return new Response(JSON.stringify({ scope: 'openid email profile' }), { status: 200 })
        }
        return new Response(JSON.stringify({ email: 'a@b.com' }), { status: 200 })
      }),
    )
    await expect(signIn()).rejects.toMatchObject({ code: 'reconnect' })
    expect(googleAuthState.connected).toBe(false)
    expect(googleAuthState.error).toMatch(/Drive app data/i)
  })

  it('reuses the in-memory token and does not re-prompt', async () => {
    const { requests } = installGis()
    await signIn()
    expect(await getAccessToken()).toBe('tok1')
    expect(requests).toHaveLength(1)
  })

  it('restores a tab token from sessionStorage after module reset', async () => {
    installGis()
    await signIn()
    // Simulate SPA reload of the module globals while sessionStorage keeps the token.
    const raw = sessionStorage.getItem('singtags.google.accessToken.v1')
    expect(raw).toBeTruthy()
    __resetGoogleAuthForTests()
    // put token back (reset clears session); re-seed then restore
    sessionStorage.setItem(
      'singtags.google.accessToken.v1',
      JSON.stringify({ token: 'tok-session', expiresAt: Date.now() + 3_600_000 }),
    )
    localStorage.setItem(
      GOOGLE_CONNECTED_KEY,
      JSON.stringify({ email: 'a@b.com', connectedAt: new Date().toISOString() }),
    )
    vi.stubEnv('VITE_GOOGLE_OAUTH_CLIENT_ID', 'test-client.apps.googleusercontent.com')
    restoreGoogleConnection()
    expect(await getAccessToken()).toBe('tok-session')
  })

  it('interactive renew uses consent so Drive appData is granted', async () => {
    const { requests } = installGis()
    localStorage.setItem(
      GOOGLE_CONNECTED_KEY,
      JSON.stringify({ email: 'a@b.com', connectedAt: new Date().toISOString() }),
    )
    restoreGoogleConnection()
    await getAccessToken({ interactive: true })
    expect(requests[0]).toEqual({ prompt: 'consent' })
  })

  it('throws not-connected before sign-in', async () => {
    installGis()
    await expect(getAccessToken()).rejects.toMatchObject({ code: 'not-connected' })
  })

  it('throws not-configured without a client ID', async () => {
    vi.stubEnv('VITE_GOOGLE_OAUTH_CLIENT_ID', '')
    installGis()
    await expect(signIn()).rejects.toBeInstanceOf(GoogleAuthError)
    expect(googleAuthState.connected).toBe(false)
  })

  it('surfaces a cancelled popup as reconnect and stays disconnected', async () => {
    installGis({ fail: true })
    await expect(signIn()).rejects.toMatchObject({ code: 'reconnect' })
    expect(googleAuthState.connected).toBe(false)
    expect(googleAuthState.error).toMatch(/popup closed/)
  })

  it('signOut revokes the token and clears state', async () => {
    const { revoke } = installGis()
    await signIn()
    await signOut()
    expect(revoke).toHaveBeenCalledWith('tok1', expect.any(Function))
    expect(localStorage.getItem(GOOGLE_CONNECTED_KEY)).toBeNull()
    expect(googleAuthState.connected).toBe(false)
  })

  it('testDriveConnection maps about.get and sends the bearer token', async () => {
    installGis()
    await signIn()
    const f = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('tokeninfo')) {
        return new Response(
          JSON.stringify({ scope: `${GOOGLE_DRIVE_APPDATA_SCOPE} openid email profile` }),
          { status: 200 },
        )
      }
      return new Response(
        JSON.stringify({
          user: { emailAddress: 'a@b.com' },
          storageQuota: { usage: '10', limit: '100' },
        }),
        { status: 200 },
      )
    })
    vi.stubGlobal('fetch', f)
    const r = await testDriveConnection()
    expect(r).toEqual({ email: 'a@b.com', usedBytes: 10, limitBytes: 100 })
    const aboutCall = f.mock.calls.find((c) => String(c[0]).includes('/drive/v3/about')) as
      | [string, { headers: Record<string, string> }]
      | undefined
    expect(aboutCall?.[1].headers.Authorization).toBe('Bearer tok1')
  })
})
