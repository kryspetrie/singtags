/**
 * Google Identity Services (GIS) token client for Drive sync.
 *
 * Public Web client ID only (`VITE_GOOGLE_OAUTH_CLIENT_ID`) — never a client secret.
 * Access tokens live in memory + sessionStorage (this tab only, with expiry).
 * The "connected" marker is in localStorage; never put a client secret in the SPA.
 * See docs/plans/google-drive-sync-and-cache.md.
 */

import { reactive } from 'vue'

export const GOOGLE_DRIVE_APPDATA_SCOPE = 'https://www.googleapis.com/auth/drive.appdata'
export const GOOGLE_SCOPES = `${GOOGLE_DRIVE_APPDATA_SCOPE} openid email profile`

export const DRIVE_SYNC_ENABLED_KEY = 'singtags.labs.driveSync.enabled.v1'
export const GOOGLE_CONNECTED_KEY = 'singtags.google.connected.v1'
/** Tab-scoped token cache so Sync after reload does not force the account picker. */
export const GOOGLE_TOKEN_SESSION_KEY = 'singtags.google.accessToken.v1'

const GIS_SRC = 'https://accounts.google.com/gsi/client'
const USERINFO_URL = 'https://www.googleapis.com/oauth2/v3/userinfo'
const DRIVE_ABOUT_URL = 'https://www.googleapis.com/drive/v3/about?fields=user,storageQuota'
/** Refresh slightly before Google's stated expiry. */
const EXPIRY_SKEW_MS = 60_000

export interface GoogleConnection {
  email?: string
  connectedAt: string
}

export type GoogleAuthErrorCode = 'not-configured' | 'not-connected' | 'reconnect' | 'load-failed'

export class GoogleAuthError extends Error {
  readonly code: GoogleAuthErrorCode
  constructor(code: GoogleAuthErrorCode, message: string) {
    super(message)
    this.name = 'GoogleAuthError'
    this.code = code
  }
}

interface TokenResponse {
  access_token?: string
  expires_in?: number | string
  error?: string
  error_description?: string
}

interface TokenClientConfig {
  client_id: string
  scope: string
  callback: (r: TokenResponse) => void
  error_callback?: (e: { type?: string; message?: string }) => void
}

interface TokenClient {
  requestAccessToken(overrides?: { prompt?: string }): void
}

export interface GoogleGis {
  accounts: {
    oauth2: {
      initTokenClient(config: TokenClientConfig): TokenClient
      revoke(token: string, done?: () => void): void
    }
  }
}

declare global {
  interface Window {
    google?: GoogleGis
  }
}

/** Reactive UI state (token itself is deliberately not exposed). */
export const googleAuthState = reactive({
  connected: false,
  email: '' as string,
  busy: false,
  error: '' as string,
})

let accessToken: string | null = null
let tokenExpiresAt = 0
let tokenClient: TokenClient | null = null
let pending: { resolve: (t: string) => void; reject: (e: Error) => void } | null = null
let gisPromise: Promise<GoogleGis> | null = null

export function googleClientId(): string {
  return ((import.meta.env.VITE_GOOGLE_OAUTH_CLIENT_ID as string | undefined) ?? '').trim()
}

export function isGoogleConfigured(): boolean {
  return googleClientId().length > 0
}

function readFlag(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function writeFlag(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
  } catch {
    /* storage unavailable */
  }
}

function persistAccessToken(token: string, expiresAt: number): void {
  accessToken = token
  tokenExpiresAt = expiresAt
  try {
    sessionStorage.setItem(GOOGLE_TOKEN_SESSION_KEY, JSON.stringify({ token, expiresAt }))
  } catch {
    /* private / blocked */
  }
}

function restoreAccessTokenFromSession(): void {
  try {
    const raw = sessionStorage.getItem(GOOGLE_TOKEN_SESSION_KEY)
    if (!raw) return
    const v = JSON.parse(raw) as { token?: unknown; expiresAt?: unknown }
    if (
      typeof v.token === 'string' &&
      typeof v.expiresAt === 'number' &&
      Date.now() < v.expiresAt - EXPIRY_SKEW_MS
    ) {
      accessToken = v.token
      tokenExpiresAt = v.expiresAt
      return
    }
    sessionStorage.removeItem(GOOGLE_TOKEN_SESSION_KEY)
  } catch {
    /* ignore */
  }
}

function clearAccessToken(): void {
  accessToken = null
  tokenExpiresAt = 0
  try {
    sessionStorage.removeItem(GOOGLE_TOKEN_SESSION_KEY)
  } catch {
    /* ignore */
  }
}

export function isDriveSyncEnabled(): boolean {
  return readFlag(DRIVE_SYNC_ENABLED_KEY) === '1'
}

export function setDriveSyncEnabled(on: boolean): void {
  writeFlag(DRIVE_SYNC_ENABLED_KEY, on ? '1' : '0')
}

export function readConnection(): GoogleConnection | null {
  const raw = readFlag(GOOGLE_CONNECTED_KEY)
  if (!raw) return null
  try {
    const v = JSON.parse(raw) as Partial<GoogleConnection>
    if (typeof v.connectedAt !== 'string') return null
    return { connectedAt: v.connectedAt, email: typeof v.email === 'string' ? v.email : undefined }
  } catch {
    return null
  }
}

/** Sync reactive state from localStorage + restore tab token from sessionStorage. */
export function restoreGoogleConnection(): void {
  const c = readConnection()
  googleAuthState.connected = c !== null
  googleAuthState.email = c?.email ?? ''
  restoreAccessTokenFromSession()
}

function loadGis(): Promise<GoogleGis> {
  if (window.google?.accounts?.oauth2) return Promise.resolve(window.google)
  if (gisPromise) return gisPromise
  gisPromise = new Promise<GoogleGis>((resolve, reject) => {
    const fail = (): void => {
      gisPromise = null
      reject(new GoogleAuthError('load-failed', 'Could not load Google sign-in. Check your connection.'))
    }
    const s = document.createElement('script')
    s.src = GIS_SRC
    s.async = true
    s.onload = () => (window.google?.accounts?.oauth2 ? resolve(window.google) : fail())
    s.onerror = fail
    document.head.appendChild(s)
  })
  return gisPromise
}

async function ensureClient(): Promise<TokenClient> {
  const clientId = googleClientId()
  if (!clientId) {
    throw new GoogleAuthError('not-configured', 'Google sign-in is not configured for this build.')
  }
  if (tokenClient) return tokenClient
  const gis = await loadGis()
  tokenClient = gis.accounts.oauth2.initTokenClient({
    client_id: clientId,
    scope: GOOGLE_SCOPES,
    callback: (r) => {
      const p = pending
      pending = null
      if (!p) return
      if (r.error || !r.access_token) {
        p.reject(new GoogleAuthError('reconnect', r.error_description || r.error || 'Google sign-in failed.'))
        return
      }
      const expiresAt = Date.now() + (Number(r.expires_in) || 3600) * 1000
      persistAccessToken(r.access_token, expiresAt)
      p.resolve(r.access_token)
    },
    error_callback: (e) => {
      const p = pending
      pending = null
      p?.reject(new GoogleAuthError('reconnect', e.message || e.type || 'Google sign-in was cancelled.'))
    },
  })
  return tokenClient
}

async function requestToken(prompt: string): Promise<string> {
  const client = await ensureClient()
  if (pending) {
    pending.reject(new GoogleAuthError('reconnect', 'Superseded by a newer sign-in request.'))
  }
  return new Promise<string>((resolve, reject) => {
    pending = { resolve, reject }
    client.requestAccessToken({ prompt })
  })
}

async function fetchEmail(token: string): Promise<string | undefined> {
  try {
    const res = await fetch(USERINFO_URL, { headers: { Authorization: `Bearer ${token}` } })
    if (!res.ok) return undefined
    const j = (await res.json()) as { email?: unknown }
    return typeof j.email === 'string' ? j.email : undefined
  } catch {
    return undefined
  }
}

async function markConnectedFromToken(token: string): Promise<GoogleConnection> {
  const conn: GoogleConnection = {
    email: await fetchEmail(token),
    connectedAt: new Date().toISOString(),
  }
  writeFlag(GOOGLE_CONNECTED_KEY, JSON.stringify(conn))
  googleAuthState.connected = true
  googleAuthState.email = conn.email ?? ''
  googleAuthState.error = ''
  return conn
}

/** Interactive consent — call from a user gesture (popup). */
export async function signIn(): Promise<GoogleConnection> {
  googleAuthState.busy = true
  googleAuthState.error = ''
  try {
    const token = await requestToken('select_account')
    return await markConnectedFromToken(token)
  } catch (e) {
    googleAuthState.error = e instanceof Error ? e.message : String(e)
    throw e
  } finally {
    googleAuthState.busy = false
  }
}

/** True when we already hold a non-expired access token (memory or session). */
export function hasUsableAccessToken(): boolean {
  if (!!accessToken && Date.now() < tokenExpiresAt - EXPIRY_SKEW_MS) return true
  restoreAccessTokenFromSession()
  return !!accessToken && Date.now() < tokenExpiresAt - EXPIRY_SKEW_MS
}

/**
 * Valid access token for Drive calls.
 *
 * Default: return cached token only — never open a popup from background work.
 * `{ interactive: true }` (button click): reuse cache, else try `prompt: ''` (often no UI
 * under a user gesture), and only then fall back to the account picker.
 */
export async function getAccessToken(opts?: { interactive?: boolean }): Promise<string> {
  if (!opts?.interactive && !googleAuthState.connected) {
    throw new GoogleAuthError('not-connected', 'Connect Google Drive first.')
  }
  if (hasUsableAccessToken()) return accessToken!
  if (!opts?.interactive) {
    const err = new GoogleAuthError(
      'reconnect',
      'Reconnect Google Drive (tap Connect or Sync now) — the sign-in popup cannot run in the background.',
    )
    googleAuthState.error = err.message
    throw err
  }
  try {
    let token: string
    try {
      // Under a real click, empty prompt usually renews with little or no UI.
      token = await requestToken('')
    } catch {
      token = await requestToken('select_account')
    }
    if (!googleAuthState.connected) {
      await markConnectedFromToken(token)
    } else if (!googleAuthState.email) {
      googleAuthState.email = (await fetchEmail(token)) ?? ''
    }
    googleAuthState.error = ''
    return token
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    googleAuthState.error = msg || 'Reconnect Google Drive to continue syncing.'
    throw e instanceof GoogleAuthError
      ? e
      : new GoogleAuthError('reconnect', googleAuthState.error)
  }
}

/** Drop the cached token (e.g. after a Drive 401) so the next call re-requests. */
export function invalidateAccessToken(): void {
  clearAccessToken()
}

/** Revoke the token with Google when possible and clear all local connection state. */
export async function signOut(): Promise<void> {
  const token = accessToken
  clearAccessToken()
  tokenClient = null
  pending = null
  writeFlag(GOOGLE_CONNECTED_KEY, null)
  googleAuthState.connected = false
  googleAuthState.email = ''
  googleAuthState.error = ''
  if (token && window.google?.accounts?.oauth2) {
    await new Promise<void>((resolve) => {
      try {
        window.google!.accounts.oauth2.revoke(token, () => resolve())
      } catch {
        resolve()
      }
    })
  }
}

export interface DriveAboutSummary {
  email?: string
  usedBytes?: number
  limitBytes?: number
}

/** Phase 1 smoke test: Drive `about.get` with the current token. */
export async function testDriveConnection(): Promise<DriveAboutSummary> {
  const token = await getAccessToken({ interactive: true })
  const res = await fetch(DRIVE_ABOUT_URL, { headers: { Authorization: `Bearer ${token}` } })
  if (res.status === 401) {
    invalidateAccessToken()
    throw new GoogleAuthError('reconnect', 'Google rejected the token — reconnect.')
  }
  if (!res.ok) throw new Error(`Drive about failed (${res.status})`)
  const j = (await res.json()) as {
    user?: { emailAddress?: string }
    storageQuota?: { usage?: string; limit?: string }
  }
  const num = (v?: string): number | undefined => (v === undefined ? undefined : Number(v))
  return {
    email: j.user?.emailAddress,
    usedBytes: num(j.storageQuota?.usage),
    limitBytes: num(j.storageQuota?.limit),
  }
}

/** Test hook: reset module state. */
export function __resetGoogleAuthForTests(): void {
  clearAccessToken()
  tokenClient = null
  pending = null
  gisPromise = null
  googleAuthState.connected = false
  googleAuthState.email = ''
  googleAuthState.busy = false
  googleAuthState.error = ''
  try {
    sessionStorage.removeItem(GOOGLE_TOKEN_SESSION_KEY)
  } catch {
    /* ignore */
  }
}
