/**
 * Opt-in Drive mirror for Browse offline packs (sheets / lo-fi tracks).
 *
 * Device-local prefs (`DRIVE_CACHE_*_KEY`): this browser wants a local song cache.
 * They are **not** in app-state sync — login on a phone must not force cache download
 * on a laptop. When a pref is on and the user is signed in, hydrate from Drive first,
 * fill gaps from SingTags/S3, then push new local objects up.
 *
 * Layout: appDataFolder/singtags/cache/{manifest.json, objects/{sha256}}
 * See docs/plans/google-drive-sync-and-cache.md Feature B / Phase 4.
 *
 * Format safety:
 * - Metadata / schema / missing `source` → rewrite manifest only; **keep** hashed
 *   objects on Drive (sheet/track bytes usually do not change).
 * - Media-format stamp mismatch → delete objects for that pack only + clear local
 *   pack, then refill from SingTags. The other pack’s Drive objects stay.
 */

import { reactive } from 'vue'
import { isSingTagsOffline } from '../appOffline'
import { mediaUrl } from '../mediaUrl'
import { currentOfflineContentFormat } from '../offlineContentFormat'
import { urlToRelativePath } from '../../offline/cacheManage'
import { audioPack, sheetsPack, type PackKind, type OfflinePackStore } from '../../offline/libraryPack'
import {
  downloadFileBytes,
  ensureAppDataPath,
  findChildByName,
  listChildren,
  sha256Bytes,
} from './driveAppData'
import {
  getAccessToken,
  hasUsableAccessToken,
  restoreGoogleConnection,
} from './googleAuth'
import { tagIdFromCachePath } from '../offlineReadiness'
import { ensureDriveCacheSync } from './driveCacheTransfer'

export { tagIdFromCachePath }

/** Device-local: this browser wants a sheets song cache (Drive and/or S3). */
export const DRIVE_CACHE_SHEETS_KEY = 'singtags.drive.cache.sheets.enabled.v1'
/** Device-local: this browser wants a tracks song cache (Drive and/or S3). */
export const DRIVE_CACHE_AUDIO_KEY = 'singtags.drive.cache.audio.enabled.v1'

export const DRIVE_CACHE_SEGMENTS = ['singtags', 'cache'] as const
export const DRIVE_CACHE_OBJECTS_SEGMENTS = ['singtags', 'cache', 'objects'] as const
export const DRIVE_CACHE_MANIFEST_FILE = 'manifest.json'

export const DRIVE_CACHE_FORMAT_ID = 'singtags-offline-cache-v1'
export const DRIVE_CACHE_SCHEMA_VERSION = 1 as const
/** Client accepts this schema and anything lower that shares {@link DRIVE_CACHE_FORMAT_ID}. */
export const DRIVE_CACHE_MAX_SCHEMA_VERSION = DRIVE_CACHE_SCHEMA_VERSION

export type DriveCachePackEntry = {
  path: string
  hash: string
  bytes: number
  mime?: string
}

/**
 * Origin *media* stamps — bump SPA constants only when SingTags.com file bytes
 * become unusable. Metadata-only changes must not bump these.
 */
export type DriveCacheSource = {
  sheetsContentFormat: string
  audioContentFormat: string
}

export type DriveCacheManifest = {
  kind: 'singtags.drive-cache'
  schemaVersion: number
  formatId: string
  exportedAt: string
  source: DriveCacheSource
  packs: {
    sheets: DriveCachePackEntry[]
    audio: DriveCachePackEntry[]
  }
}

/**
 * What to do with a cloud cache manifest.
 * Prefer `rewrite-metadata` over wiping objects whenever pack entries are still usable.
 */
export type DriveCacheDecision =
  | { action: 'use'; manifest: DriveCacheManifest }
  | { action: 'missing' }
  | { action: 'rewrite-metadata'; manifest: DriveCacheManifest; reason: string }
  | {
      action: 'purge-media'
      sheets: boolean
      audio: boolean
      manifest: DriveCacheManifest
      reason: string
    }
  | { action: 'unreadable'; reason: string }

/** @deprecated Use {@link DriveCacheDecision}. */
export type DriveCacheCompat =
  | { ok: true; manifest: DriveCacheManifest }
  | { ok: false; reason: 'missing' }
  | {
      ok: false
      reason: 'unsupported-schema' | 'unsupported-format' | 'content-format-mismatch'
      raw: unknown
    }

export const driveCacheSyncState = reactive({
  status: 'idle' as 'idle' | 'hydrating' | 'uploading' | 'invalidating' | 'error',
  message: '' as string,
  done: 0,
  total: 0,
  lastInvalidationReason: '' as string,
  /** Mirrored device prefs for reactive Settings / toast UI. */
  sheetsEnabled: false,
  audioEnabled: false,
  /** Tag ids in the current Drive transfer, in first-seen order. */
  tagIds: [] as number[],
  /** Tag ids whose files in this transfer are finished. */
  finishedTagIds: [] as number[],
  /** Files finished / queued in the current transfer (moves while a tag is still copying). */
  filesDone: 0,
  filesTotal: 0,
  /** Active restore cap in megabits per second. 0 when a restore is not running. */
  downloadMbps: 0,
})

function syncPrefStateFromStorage(): void {
  driveCacheSyncState.sheetsEnabled = readFlag(DRIVE_CACHE_SHEETS_KEY)
  driveCacheSyncState.audioEnabled = readFlag(DRIVE_CACHE_AUDIO_KEY)
}

/** True while Drive song-cache hydrate / upload / invalidate is in flight. */
export function isDriveCacheTransferActive(): boolean {
  const s = driveCacheSyncState.status
  return s === 'hydrating' || s === 'uploading' || s === 'invalidating'
}

/**
 * Short UI label for the current Drive song-cache transfer (source-aware).
 * Empty when idle with no leftover status message.
 */
export function driveCacheTransferLabel(): string {
  const { status, message, done, total } = driveCacheSyncState
  const verb =
    status === 'hydrating'
      ? 'Downloading from Google Drive'
      : status === 'uploading'
        ? 'Uploading to Google Drive'
        : ''
  if (verb) {
    if (total <= 0) return message || `${verb}…`
    const shown = Math.min(Math.max(0, done), total)
    const cap =
      status === 'hydrating' && driveCacheSyncState.downloadMbps > 0
        ? ` · up to ${driveCacheSyncState.downloadMbps} Mb/s`
        : ''
    return `${verb}… ${shown.toLocaleString()}/${total.toLocaleString()} tags${cap}`
  }
  if (status === 'invalidating') {
    return message || 'Updating Google Drive cache…'
  }
  if (status === 'error') {
    return message || 'Google Drive cache error'
  }
  return message
}

/** Unique tag ids in cache paths. Untagged files count as one extra bucket. */
export function tagIdsInCachePaths(paths: readonly string[]): number[] {
  const ids = new Set<number>()
  let untagged = false
  for (const path of paths) {
    const id = tagIdFromCachePath(path)
    if (id == null) untagged = true
    else ids.add(id)
  }
  if (untagged) ids.add(0)
  return [...ids]
}

/**
 * Local pack rows whose content hash is not already on Drive.
 * Dedupes by hash so shared sheet/audio bytes upload once.
 */
export function selectCacheEntriesToUpload(
  local: readonly DriveCachePackEntry[],
  knownHashes: ReadonlySet<string>,
): DriveCachePackEntry[] {
  const seen = new Set<string>()
  const out: DriveCachePackEntry[] = []
  for (const entry of local) {
    if (!entry.hash || knownHashes.has(entry.hash) || seen.has(entry.hash)) continue
    seen.add(entry.hash)
    out.push(entry)
  }
  return out
}

/**
 * Pack rows whose bytes are already in an objects folder.
 * Cloud rows stay until this device has stored a replacement for the same path,
 * so a partial upload remains downloadable and the next sync can fill the gaps.
 */
export function mergeStoredDriveCachePack(
  local: readonly DriveCachePackEntry[],
  cloud: readonly DriveCachePackEntry[],
  knownHashes: ReadonlySet<string>,
): DriveCachePackEntry[] {
  const byPath = new Map<string, DriveCachePackEntry>()
  for (const entry of cloud) {
    if (!entry.path || !entry.hash || !knownHashes.has(entry.hash)) continue
    byPath.set(entry.path, entry)
  }
  for (const entry of local) {
    if (!entry.path || !entry.hash || !knownHashes.has(entry.hash)) continue
    byPath.set(entry.path, entry)
  }
  return [...byPath.values()]
}

function storedPack(
  enabled: boolean,
  local: readonly DriveCachePackEntry[],
  cloud: readonly DriveCachePackEntry[] | undefined,
  knownHashes: ReadonlySet<string>,
): DriveCachePackEntry[] {
  if (!enabled) return cloud ? [...cloud] : []
  // An empty object index means we could not see stored bytes. Keep the cloud list
  // instead of publishing an empty pack over a usable one.
  if (knownHashes.size === 0) return cloud ? [...cloud] : []
  return mergeStoredDriveCachePack(local, cloud ?? [], knownHashes)
}

/** Manifest that names only song files already stored on Drive. */
export function driveCacheManifestForStoredObjects(opts: {
  local: DriveCacheManifest
  cloud?: DriveCacheManifest | null
  knownHashes: ReadonlySet<string>
  sheets: boolean
  audio: boolean
}): DriveCacheManifest {
  const cloud = opts.cloud ?? null
  return {
    kind: 'singtags.drive-cache',
    schemaVersion: DRIVE_CACHE_SCHEMA_VERSION,
    formatId: DRIVE_CACHE_FORMAT_ID,
    exportedAt: new Date().toISOString(),
    source: opts.local.source,
    packs: {
      sheets: storedPack(opts.sheets, opts.local.packs.sheets, cloud?.packs.sheets, opts.knownHashes),
      audio: storedPack(opts.audio, opts.local.packs.audio, cloud?.packs.audio, opts.knownHashes),
    },
  }
}

export function clearDriveTagProgress(): void {
  driveCacheSyncState.tagIds = []
  driveCacheSyncState.finishedTagIds = []
  driveCacheSyncState.filesDone = 0
  driveCacheSyncState.filesTotal = 0
}

/** Count finished tags as each of their files completes. `done` never passes `total`. */
export function trackTagProgress(paths: readonly string[]): { mark(path: string): void } {
  const remaining = new Map<number, number>()
  const order: number[] = []
  for (const path of paths) {
    const id = tagIdFromCachePath(path) ?? 0
    if (!remaining.has(id)) order.push(id)
    remaining.set(id, (remaining.get(id) ?? 0) + 1)
  }
  driveCacheSyncState.done = 0
  driveCacheSyncState.total = remaining.size
  driveCacheSyncState.tagIds = order
  driveCacheSyncState.finishedTagIds = []
  driveCacheSyncState.filesDone = 0
  driveCacheSyncState.filesTotal = paths.length
  return {
    mark(path: string) {
      const id = tagIdFromCachePath(path) ?? 0
      driveCacheSyncState.filesDone = Math.min(
        driveCacheSyncState.filesTotal,
        driveCacheSyncState.filesDone + 1,
      )
      const left = (remaining.get(id) ?? 1) - 1
      if (left <= 0) {
        remaining.delete(id)
        if (!driveCacheSyncState.finishedTagIds.includes(id)) {
          driveCacheSyncState.finishedTagIds.push(id)
        }
        driveCacheSyncState.done = Math.min(driveCacheSyncState.total, driveCacheSyncState.done + 1)
      } else {
        remaining.set(id, left)
      }
    },
  }
}

/** Rewrite manifest.json after this many newly stored files. */
export const DRIVE_CACHE_MANIFEST_FLUSH_FILES = 30
/** Rewrite manifest.json at least this often while an upload is storing files. */
export const DRIVE_CACHE_MANIFEST_FLUSH_MS = 10_000

function readFlag(key: string): boolean {
  try {
    return localStorage.getItem(key) === '1'
  } catch {
    return false
  }
}

/** Persist explicit on/off (`1`/`0`) so Connect can default unset → recommended on. */
function writeFlag(key: string, on: boolean): void {
  try {
    localStorage.setItem(key, on ? '1' : '0')
  } catch {
    /* ignore */
  }
}

/** `true` / `false` when set; `null` when the user has never chosen. */
export function readDriveCachePref(key: string): boolean | null {
  try {
    const v = localStorage.getItem(key)
    if (v === '1') return true
    if (v === '0') return false
    return null
  } catch {
    return null
  }
}

export function isDriveSheetsCacheEnabled(): boolean {
  return readFlag(DRIVE_CACHE_SHEETS_KEY)
}

export function isDriveAudioCacheEnabled(): boolean {
  return readFlag(DRIVE_CACHE_AUDIO_KEY)
}

export function setDriveSheetsCacheEnabled(on: boolean): void {
  writeFlag(DRIVE_CACHE_SHEETS_KEY, on)
  driveCacheSyncState.sheetsEnabled = on
}

export function setDriveAudioCacheEnabled(on: boolean): void {
  writeFlag(DRIVE_CACHE_AUDIO_KEY, on)
  driveCacheSyncState.audioEnabled = on
}

/** Refresh reactive pref mirrors from localStorage (e.g. Settings mount). */
export function restoreDriveCachePrefs(): void {
  syncPrefStateFromStorage()
}

export function isDriveCacheSyncEnabled(): boolean {
  return isDriveSheetsCacheEnabled() || isDriveAudioCacheEnabled()
}

export function pathForPackUrl(url: string): string {
  return urlToRelativePath(url) ?? `by-url/${encodeURIComponent(url)}`
}

export function urlFromPackPath(path: string): string {
  if (path.startsWith('by-url/')) {
    try {
      return decodeURIComponent(path.slice('by-url/'.length))
    } catch {
      return path
    }
  }
  return mediaUrl(path)
}

export function currentDriveCacheSource(): DriveCacheSource {
  const c = currentOfflineContentFormat()
  return {
    sheetsContentFormat: c.sheets,
    audioContentFormat: c.audio,
  }
}

function isDriveCacheManifestShape(raw: unknown): raw is DriveCacheManifest {
  if (!raw || typeof raw !== 'object') return false
  const m = raw as Partial<DriveCacheManifest>
  if (m.kind !== 'singtags.drive-cache') return false
  if (typeof m.schemaVersion !== 'number' || typeof m.formatId !== 'string') return false
  if (typeof m.exportedAt !== 'string') return false
  if (!m.packs || !Array.isArray(m.packs.sheets) || !Array.isArray(m.packs.audio)) return false
  return true
}

function normalizePackEntries(raw: unknown): DriveCachePackEntry[] {
  if (!Array.isArray(raw)) return []
  const out: DriveCachePackEntry[] = []
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue
    const e = row as Partial<DriveCachePackEntry>
    if (typeof e.path !== 'string' || typeof e.hash !== 'string') continue
    if (typeof e.bytes !== 'number') continue
    out.push({
      path: e.path,
      hash: e.hash,
      bytes: e.bytes,
      mime: typeof e.mime === 'string' ? e.mime : undefined,
    })
  }
  return out
}

/** Best-effort parse so we can keep object hashes across metadata upgrades. */
export function coerceDriveCacheManifest(raw: unknown): DriveCacheManifest | null {
  if (!raw || typeof raw !== 'object') return null
  const m = raw as Partial<DriveCacheManifest>
  if (m.kind !== 'singtags.drive-cache') return null
  const packs = m.packs
  if (!packs || typeof packs !== 'object') return null
  return {
    kind: 'singtags.drive-cache',
    schemaVersion:
      typeof m.schemaVersion === 'number' ? m.schemaVersion : DRIVE_CACHE_SCHEMA_VERSION,
    formatId: typeof m.formatId === 'string' ? m.formatId : DRIVE_CACHE_FORMAT_ID,
    exportedAt: typeof m.exportedAt === 'string' ? m.exportedAt : new Date().toISOString(),
    source: {
      sheetsContentFormat:
        typeof m.source?.sheetsContentFormat === 'string'
          ? m.source.sheetsContentFormat
          : '',
      audioContentFormat:
        typeof m.source?.audioContentFormat === 'string'
          ? m.source.audioContentFormat
          : '',
    },
    packs: {
      sheets: normalizePackEntries((packs as DriveCacheManifest['packs']).sheets),
      audio: normalizePackEntries((packs as DriveCacheManifest['packs']).audio),
    },
  }
}

/**
 * Decide how to treat a Drive cache manifest.
 * Metadata/schema drift → rewrite metadata, keep hashed objects.
 * Media-format stamp mismatch → purge only the affected pack’s objects.
 */
export function decideDriveCacheAction(
  raw: unknown,
  currentSource: DriveCacheSource = currentDriveCacheSource(),
): DriveCacheDecision {
  if (raw == null) return { action: 'missing' }
  const coerced = coerceDriveCacheManifest(raw)
  if (!coerced) return { action: 'unreadable', reason: 'unreadable-manifest' }

  const sheetsMediaOk =
    !coerced.source.sheetsContentFormat ||
    coerced.source.sheetsContentFormat === currentSource.sheetsContentFormat
  const audioMediaOk =
    !coerced.source.audioContentFormat ||
    coerced.source.audioContentFormat === currentSource.audioContentFormat

  if (!sheetsMediaOk || !audioMediaOk) {
    return {
      action: 'purge-media',
      sheets: !sheetsMediaOk,
      audio: !audioMediaOk,
      manifest: coerced,
      reason: 'media-format-mismatch',
    }
  }

  const schemaOk =
    coerced.formatId === DRIVE_CACHE_FORMAT_ID &&
    coerced.schemaVersion >= 1 &&
    coerced.schemaVersion <= DRIVE_CACHE_MAX_SCHEMA_VERSION
  const sourceComplete =
    coerced.source.sheetsContentFormat === currentSource.sheetsContentFormat &&
    coerced.source.audioContentFormat === currentSource.audioContentFormat

  if (schemaOk && sourceComplete && isDriveCacheManifestShape(raw)) {
    return { action: 'use', manifest: coerced }
  }

  // Legacy / schema bump / missing source stamps: keep bytes, refresh metadata only.
  return {
    action: 'rewrite-metadata',
    manifest: coerced,
    reason: !sourceComplete
      ? 'metadata-source-upgrade'
      : !schemaOk
        ? 'metadata-schema-upgrade'
        : 'metadata-refresh',
  }
}

/** @deprecated Prefer {@link decideDriveCacheAction}. */
export function evaluateDriveCacheManifest(
  raw: unknown,
  currentSource: DriveCacheSource = currentDriveCacheSource(),
): DriveCacheCompat {
  const d = decideDriveCacheAction(raw, currentSource)
  if (d.action === 'use') return { ok: true, manifest: d.manifest }
  if (d.action === 'missing') return { ok: false, reason: 'missing' }
  if (d.action === 'purge-media') {
    return { ok: false, reason: 'content-format-mismatch', raw }
  }
  if (d.action === 'rewrite-metadata') {
    // Compatible enough to keep objects; callers of this legacy API should migrate.
    return { ok: true, manifest: { ...d.manifest, source: currentSource } }
  }
  return { ok: false, reason: 'unsupported-format', raw }
}

export function isSupportedDriveCacheManifest(
  raw: Partial<DriveCacheManifest> | null | undefined,
): raw is DriveCacheManifest {
  const d = decideDriveCacheAction(raw)
  return d.action === 'use' || d.action === 'rewrite-metadata'
}

export function packStore(kind: PackKind): OfflinePackStore {
  return kind === 'sheets' ? sheetsPack : audioPack
}

export async function clearLocalPacksForKinds(opts: {
  sheets: boolean
  audio: boolean
}): Promise<void> {
  if (opts.sheets) await sheetsPack.clear()
  if (opts.audio) await audioPack.clear()
}

export const hashSources = new Map<string, { kind: PackKind; url: string; mime?: string }>()

async function buildPackEntries(kind: PackKind): Promise<DriveCachePackEntry[]> {
  const store = packStore(kind)
  const urls = await store.listUrls()
  const entries: DriveCachePackEntry[] = []
  for (const url of urls) {
    const res = await store.get(url)
    if (!res) continue
    const bytes = new Uint8Array(await res.arrayBuffer())
    if (!bytes.byteLength) continue
    const hash = await sha256Bytes(bytes)
    if (!hashSources.has(hash)) {
      hashSources.set(hash, {
        kind,
        url,
        mime: res.headers.get('Content-Type') || undefined,
      })
    }
    entries.push({
      path: pathForPackUrl(url),
      hash,
      bytes: bytes.byteLength,
      mime: res.headers.get('Content-Type') || undefined,
    })
  }
  return entries
}

export async function buildLocalDriveCacheManifest(
  opts: { sheets: boolean; audio: boolean },
): Promise<DriveCacheManifest> {
  hashSources.clear()
  const packs = {
    sheets: opts.sheets ? await buildPackEntries('sheets') : ([] as DriveCachePackEntry[]),
    audio: opts.audio ? await buildPackEntries('audio') : ([] as DriveCachePackEntry[]),
  }
  return {
    kind: 'singtags.drive-cache',
    schemaVersion: DRIVE_CACHE_SCHEMA_VERSION,
    formatId: DRIVE_CACHE_FORMAT_ID,
    exportedAt: new Date().toISOString(),
    source: currentDriveCacheSource(),
    packs,
  }
}

export async function readCloudManifestRaw(): Promise<unknown | null> {
  const folderId = await ensureAppDataPath(DRIVE_CACHE_SEGMENTS)
  const file = await findChildByName(DRIVE_CACHE_MANIFEST_FILE, folderId)
  if (!file) return null
  const bytes = await downloadFileBytes(file.id)
  try {
    return JSON.parse(new TextDecoder().decode(bytes)) as unknown
  } catch {
    return { kind: 'singtags.drive-cache-corrupt' }
  }
}

export type DriveCachePackPresence = {
  /** True when Drive already lists at least one file for this pack. */
  present: boolean
  files: number
  bytes: number
  tags: number
}

export type DriveCachePresence = {
  sheets: DriveCachePackPresence
  audio: DriveCachePackPresence
}

function packPresence(entries: DriveCachePackEntry[]): DriveCachePackPresence {
  let bytes = 0
  for (const e of entries) bytes += e.bytes || 0
  return {
    present: entries.length > 0,
    files: entries.length,
    bytes,
    tags: tagIdsInCachePaths(entries.map((e) => e.path)).filter((id) => id !== 0).length,
  }
}

/**
 * Read-only look at whether sheet/track caches already exist on Drive.
 * Does not migrate, purge, download, or upload — safe to call to choose post-login copy.
 */
export async function probeDriveCachePresence(opts?: {
  allowTokenPrompt?: boolean
}): Promise<DriveCachePresence> {
  const empty: DriveCachePresence = {
    sheets: { present: false, files: 0, bytes: 0, tags: 0 },
    audio: { present: false, files: 0, bytes: 0, tags: 0 },
  }
  if (isSingTagsOffline()) return empty
  restoreGoogleConnection()
  if (!hasUsableAccessToken()) {
    if (!opts?.allowTokenPrompt) return empty
    await getAccessToken({ interactive: true })
  }
  const raw = await readCloudManifestRaw()
  const coerced = coerceDriveCacheManifest(raw)
  if (!coerced) return empty
  return {
    sheets: packPresence(coerced.packs.sheets),
    audio: packPresence(coerced.packs.audio),
  }
}

/**
 * Apply post-login cache choices: persist prefs, hydrate/upload, start local packs.
 */
export async function applyDriveCacheOffer(opts: {
  sheets: boolean
  audio: boolean
  startLocalPacks?: (kind: 'sheets' | 'audio') => Promise<void>
}): Promise<void> {
  setDriveSheetsCacheEnabled(opts.sheets)
  setDriveAudioCacheEnabled(opts.audio)
  if (!opts.sheets && !opts.audio) return
  if (isSingTagsOffline()) {
    driveCacheSyncState.message = 'Offline — Drive cache sync paused'
    return
  }
  await ensureDriveCacheSync({ allowTokenPrompt: true })
  if (opts.startLocalPacks) {
    const jobs: Promise<void>[] = []
    if (opts.sheets) jobs.push(opts.startLocalPacks('sheets'))
    if (opts.audio) jobs.push(opts.startLocalPacks('audio'))
    if (jobs.length) await Promise.all(jobs)
  }
}

export async function readCloudManifest(): Promise<DriveCacheManifest | null> {
  const decision = decideDriveCacheAction(await readCloudManifestRaw())
  if (decision.action === 'use') return decision.manifest
  if (decision.action === 'rewrite-metadata') {
    return {
      ...decision.manifest,
      schemaVersion: DRIVE_CACHE_SCHEMA_VERSION,
      formatId: DRIVE_CACHE_FORMAT_ID,
      source: currentDriveCacheSource(),
    }
  }
  return null
}

export const DRIVE_FOLDER_MIME = 'application/vnd.google-apps.folder'

/**
 * Every content-addressed object Drive already has, including copies that landed
 * in a duplicate `objects` folder. New uploads go into the folder that already
 * holds the most files.
 */
export async function collectDriveObjects(): Promise<{ folderId: string; index: Map<string, string> }> {
  const cacheFolderId = await ensureAppDataPath(DRIVE_CACHE_SEGMENTS)
  const children = await listChildren(cacheFolderId)
  const folders = children.filter(
    (f) => f.name === 'objects' && f.id && f.mimeType === DRIVE_FOLDER_MIME,
  )
  if (!folders.length) {
    return {
      folderId: await ensureAppDataPath(DRIVE_CACHE_OBJECTS_SEGMENTS),
      index: new Map(),
    }
  }
  const index = new Map<string, string>()
  let folderId = folders[0]!.id
  let bestCount = -1
  for (const folder of folders) {
    const listed = await listChildren(folder.id)
    if (listed.length > bestCount) {
      bestCount = listed.length
      folderId = folder.id
    }
    for (const file of listed) {
      if (file.name && !index.has(file.name)) index.set(file.name, file.id)
    }
  }
  return { folderId, index }
}

export {
  rewriteDriveCacheMetadata,
  deleteDriveCacheObjectsByHash,
  purgeIncompatibleDriveMedia,
  invalidateDriveCache,
  ensureDriveCacheFormatCompatible,
  hydrateDriveCache,
  uploadDriveCache,
  ensureDriveCacheSync,
  scheduleDriveCachePush,
  __resetDriveCacheSyncForTests,
} from './driveCacheTransfer'
