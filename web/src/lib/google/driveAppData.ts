/**
 * Google Drive Application Data folder helpers (appDataFolder space).
 *
 * Path layout (v1): appDataFolder/singtags/state/{app-state.json, app-state.meta.json}
 * See docs/plans/google-drive-sync-and-cache.md.
 */

import { getAccessToken, invalidateAccessToken, GoogleAuthError } from './googleAuth'

const DRIVE_API = 'https://www.googleapis.com/drive/v3'
const UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3'
const FOLDER_MIME = 'application/vnd.google-apps.folder'
const APPDATA_PARENT = 'appDataFolder'

export type DriveFileRef = {
  id: string
  name: string
  mimeType?: string
}

export type DriveAppDataFile = DriveFileRef & {
  /** Byte size reported by Drive. Folders are 0. */
  size: number
}

export async function sha256Hex(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export async function sha256Bytes(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', toArrayBuffer(bytes))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** Copy into a detached ArrayBuffer so fetch/Blob typings accept it. */
function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
}

async function authHeader(): Promise<string> {
  return `Bearer ${await getAccessToken()}`
}

function isInsufficientScopeError(status: number, body: string): boolean {
  if (status !== 403) return false
  return /insufficient|PERMISSION_DENIED|ACCESS_TOKEN_SCOPE_INSUFFICIENT/i.test(body)
}

async function driveFetch(path: string, init?: RequestInit): Promise<Response> {
  const headers = new Headers(init?.headers)
  headers.set('Authorization', await authHeader())
  const url = path.startsWith('http') ? path : `${DRIVE_API}${path}`
  const res = await fetch(url, { ...init, headers })
  if (res.status === 401) {
    invalidateAccessToken()
    throw new GoogleAuthError('reconnect', 'Google rejected the token — reconnect.')
  }
  return res
}

async function driveJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await driveFetch(path, init)
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    if (isInsufficientScopeError(res.status, text)) {
      invalidateAccessToken()
      throw new GoogleAuthError(
        'reconnect',
        'Drive access was denied (missing appData scope). Disconnect, then Connect again and approve Drive. If it still fails, add drive.appdata on the Google Cloud OAuth consent screen.',
      )
    }
    throw new Error(text || `Google Drive request failed (${res.status}).`)
  }
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

function escapeDriveQueryValue(name: string): string {
  return name.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
}

/** Find a child by exact name under a folder (or appDataFolder root). */
export async function findChildByName(
  name: string,
  parentId: string = APPDATA_PARENT,
): Promise<DriveFileRef | null> {
  const q = [
    `'${parentId}' in parents`,
    `name = '${escapeDriveQueryValue(name)}'`,
    'trashed = false',
  ].join(' and ')
  const data = await driveJson<{ files?: DriveFileRef[] }>(
    `/files?q=${encodeURIComponent(q)}&spaces=appDataFolder&fields=files(id,name,mimeType)&pageSize=10`,
  )
  return data.files?.[0] ?? null
}

/** List all non-trashed children under a folder (paginated). */
export async function listChildren(parentId: string): Promise<DriveFileRef[]> {
  const out: DriveFileRef[] = []
  let pageToken: string | undefined
  const q = `'${parentId}' in parents and trashed = false`
  do {
    const params = new URLSearchParams({
      q,
      spaces: 'appDataFolder',
      fields: 'nextPageToken,files(id,name,mimeType)',
      pageSize: '1000',
    })
    if (pageToken) params.set('pageToken', pageToken)
    const data = await driveJson<{ files?: DriveFileRef[]; nextPageToken?: string }>(
      `/files?${params.toString()}`,
    )
    if (data.files?.length) out.push(...data.files)
    pageToken = data.nextPageToken
  } while (pageToken)
  return out
}

/** Every non-trashed file in this app’s private Drive folder, including nested ones. */
export async function listAppDataFiles(): Promise<DriveAppDataFile[]> {
  const out: DriveAppDataFile[] = []
  let pageToken: string | undefined
  do {
    const params = new URLSearchParams({
      q: 'trashed = false',
      spaces: 'appDataFolder',
      fields: 'nextPageToken,files(id,name,mimeType,size)',
      pageSize: '1000',
    })
    if (pageToken) params.set('pageToken', pageToken)
    const data = await driveJson<{
      files?: { id?: string; name?: string; mimeType?: string; size?: string }[]
      nextPageToken?: string
    }>(`/files?${params.toString()}`)
    for (const file of data.files ?? []) {
      if (!file.id || !file.name) continue
      const size = file.size === undefined ? 0 : Number(file.size)
      out.push({
        id: file.id,
        name: file.name,
        mimeType: file.mimeType,
        size: Number.isFinite(size) && size > 0 ? size : 0,
      })
    }
    pageToken = data.nextPageToken
  } while (pageToken)
  return out
}

export async function createFolder(
  name: string,
  parentId: string = APPDATA_PARENT,
): Promise<DriveFileRef> {
  return driveJson<DriveFileRef>('/files?spaces=appDataFolder&fields=id,name,mimeType', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name,
      mimeType: FOLDER_MIME,
      parents: [parentId],
    }),
  })
}

export async function ensureFolder(
  name: string,
  parentId: string = APPDATA_PARENT,
): Promise<DriveFileRef> {
  const existing = await findChildByName(name, parentId)
  if (existing) return existing
  return createFolder(name, parentId)
}

/** Ensure nested folders under appDataFolder; returns the leaf folder id. */
export async function ensureAppDataPath(segments: readonly string[]): Promise<string> {
  let parent = APPDATA_PARENT
  for (const name of segments) {
    const folder = await ensureFolder(name, parent)
    parent = folder.id
  }
  return parent
}

export async function uploadNewFile(opts: {
  name: string
  parentId: string
  mimeType: string
  bytes: Uint8Array
}): Promise<DriveFileRef> {
  const token = await getAccessToken()
  const boundary = `singtags_${Date.now().toString(36)}`
  const metaPart =
    `--${boundary}\r\n` +
    `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${JSON.stringify({ name: opts.name, parents: [opts.parentId] })}\r\n`
  const binHeader = `--${boundary}\r\n` + `Content-Type: ${opts.mimeType}\r\n\r\n`
  const end = `\r\n--${boundary}--`
  const metaBytes = new TextEncoder().encode(metaPart)
  const headerBytes = new TextEncoder().encode(binHeader)
  const endBytes = new TextEncoder().encode(end)
  const body = new Uint8Array(
    metaBytes.length + headerBytes.length + opts.bytes.length + endBytes.length,
  )
  body.set(metaBytes, 0)
  body.set(headerBytes, metaBytes.length)
  body.set(opts.bytes, metaBytes.length + headerBytes.length)
  body.set(endBytes, metaBytes.length + headerBytes.length + opts.bytes.length)

  const res = await fetch(
    `${UPLOAD_API}/files?uploadType=multipart&spaces=appDataFolder&fields=id,name,mimeType`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body: new Blob([toArrayBuffer(body)]),
    },
  )
  if (res.status === 401) {
    invalidateAccessToken()
    throw new GoogleAuthError('reconnect', 'Google rejected the token — reconnect.')
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(text || `Drive upload failed (${res.status}).`)
  }
  return (await res.json()) as DriveFileRef
}

export async function updateFileMedia(opts: {
  fileId: string
  mimeType: string
  bytes: Uint8Array
}): Promise<DriveFileRef> {
  const token = await getAccessToken()
  const res = await fetch(
    `${UPLOAD_API}/files/${encodeURIComponent(opts.fileId)}?uploadType=media&fields=id,name,mimeType`,
    {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': opts.mimeType,
      },
      body: new Blob([toArrayBuffer(opts.bytes)]),
    },
  )
  if (res.status === 401) {
    invalidateAccessToken()
    throw new GoogleAuthError('reconnect', 'Google rejected the token — reconnect.')
  }
  if (!res.ok) throw new Error(`Drive update failed (${res.status}).`)
  return (await res.json()) as DriveFileRef
}

/** Create or replace a text/JSON file by name under a parent folder. */
export async function upsertTextFile(opts: {
  name: string
  parentId: string
  text: string
  mimeType?: string
}): Promise<DriveFileRef> {
  const mime = opts.mimeType || 'application/json'
  const bytes = new TextEncoder().encode(opts.text)
  const existing = await findChildByName(opts.name, opts.parentId)
  if (!existing) {
    return uploadNewFile({
      name: opts.name,
      parentId: opts.parentId,
      mimeType: mime,
      bytes,
    })
  }
  return updateFileMedia({ fileId: existing.id, mimeType: mime, bytes })
}

export async function downloadFileBytes(fileId: string): Promise<Uint8Array> {
  const res = await driveFetch(`/files/${encodeURIComponent(fileId)}?alt=media`)
  if (!res.ok) throw new Error(`Could not download Drive file (${res.status}).`)
  return new Uint8Array(await res.arrayBuffer())
}

export async function downloadTextFile(fileId: string): Promise<string> {
  return new TextDecoder().decode(await downloadFileBytes(fileId))
}

export async function downloadJsonFile<T = unknown>(fileId: string): Promise<T> {
  return JSON.parse(await downloadTextFile(fileId)) as T
}

/** Permanently delete a Drive file (appData). */
export async function deleteFile(fileId: string): Promise<void> {
  const res = await driveFetch(`/files/${encodeURIComponent(fileId)}`, { method: 'DELETE' })
  if (res.status === 404 || res.status === 204) return
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(text || `Drive delete failed (${res.status}).`)
  }
}
