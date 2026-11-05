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
  deleteFile,
  downloadFileBytes,
  ensureAppDataPath,
  findChildByName,
  listChildren,
  sha256Bytes,
  uploadNewFile,
  upsertTextFile,
} from './driveAppData'
import {
  getAccessToken,
  hasUsableAccessToken,
  isDriveSyncEnabled,
  restoreGoogleConnection,
} from './googleAuth'
import { tagIdFromCachePath } from '../offlineReadiness'

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
    return `${verb}… ${shown.toLocaleString()}/${total.toLocaleString()} tags`
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

function clearDriveTagProgress(): void {
  driveCacheSyncState.tagIds = []
  driveCacheSyncState.finishedTagIds = []
  driveCacheSyncState.filesDone = 0
  driveCacheSyncState.filesTotal = 0
}

/** Count finished tags as each of their files completes. `done` never passes `total`. */
function trackTagProgress(paths: readonly string[]): { mark(path: string): void } {
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

let syncInFlight: Promise<void> | null = null
let uploadInFlight: Promise<{ uploaded: number }> | null = null
let uploadFollowUp = false
let pushTimer: ReturnType<typeof setTimeout> | null = null
const PUSH_DEBOUNCE_MS = 12_000
const UPLOAD_CONCURRENCY = 3

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

function packStore(kind: PackKind): OfflinePackStore {
  return kind === 'sheets' ? sheetsPack : audioPack
}

export async function clearLocalPacksForKinds(opts: {
  sheets: boolean
  audio: boolean
}): Promise<void> {
  if (opts.sheets) await sheetsPack.clear()
  if (opts.audio) await audioPack.clear()
}

const hashSources = new Map<string, { kind: PackKind; url: string; mime?: string }>()

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

async function readCloudManifestRaw(): Promise<unknown | null> {
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

async function readCloudManifest(): Promise<DriveCacheManifest | null> {
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

const DRIVE_FOLDER_MIME = 'application/vnd.google-apps.folder'

/**
 * Every content-addressed object Drive already has, including copies that landed
 * in a duplicate `objects` folder. New uploads go into the folder that already
 * holds the most files.
 */
async function collectDriveObjects(): Promise<{ folderId: string; index: Map<string, string> }> {
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

async function mapPool<T>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<void>,
): Promise<void> {
  let next = 0
  const runners = Array.from({ length: Math.max(1, concurrency) }, async () => {
    while (next < items.length) {
      const i = next++
      await worker(items[i]!, i)
    }
  })
  await Promise.all(runners)
}

async function writeDriveCacheManifest(manifest: DriveCacheManifest): Promise<void> {
  const cacheFolderId = await ensureAppDataPath(DRIVE_CACHE_SEGMENTS)
  await upsertTextFile({
    name: DRIVE_CACHE_MANIFEST_FILE,
    parentId: cacheFolderId,
    text: JSON.stringify(manifest),
    mimeType: 'application/json',
  })
}

/** Rewrite Drive manifest metadata/source; leave `objects/{hash}` untouched. */
export async function rewriteDriveCacheMetadata(
  previous: DriveCacheManifest,
  reason: string,
): Promise<DriveCacheManifest> {
  driveCacheSyncState.status = 'invalidating'
  driveCacheSyncState.message = 'Updating Drive song-cache metadata…'
  driveCacheSyncState.lastInvalidationReason = reason
  const next: DriveCacheManifest = {
    ...previous,
    schemaVersion: DRIVE_CACHE_SCHEMA_VERSION,
    formatId: DRIVE_CACHE_FORMAT_ID,
    exportedAt: new Date().toISOString(),
    source: currentDriveCacheSource(),
  }
  await writeDriveCacheManifest(next)
  driveCacheSyncState.status = 'idle'
  driveCacheSyncState.message = 'Drive song-cache metadata updated (media kept)'
  return next
}

/** Delete Drive objects for the given hashes only (content-addressed media). */
export async function deleteDriveCacheObjectsByHash(hashes: string[]): Promise<number> {
  const unique = [...new Set(hashes.filter(Boolean))]
  if (!unique.length) return 0
  const index = (await collectDriveObjects()).index
  driveCacheSyncState.done = 0
  driveCacheSyncState.total = unique.length
  let deleted = 0
  await mapPool(unique, UPLOAD_CONCURRENCY, async (hash) => {
    const id = index.get(hash)
    if (id) {
      await deleteFile(id)
      deleted++
    }
    driveCacheSyncState.done++
  })
  return deleted
}

/**
 * Purge Drive media for selected packs only, keep the other pack’s objects, rewrite manifest.
 */
export async function purgeIncompatibleDriveMedia(opts: {
  sheets: boolean
  audio: boolean
  manifest?: DriveCacheManifest | null
  reason?: string
}): Promise<{ deleted: number }> {
  driveCacheSyncState.status = 'invalidating'
  driveCacheSyncState.message = 'Song media format changed — removing obsolete Drive files…'
  driveCacheSyncState.lastInvalidationReason = opts.reason || 'media-format-mismatch'

  const previous =
    opts.manifest ??
    coerceDriveCacheManifest(await readCloudManifestRaw()) ??
    ({
      kind: 'singtags.drive-cache',
      schemaVersion: DRIVE_CACHE_SCHEMA_VERSION,
      formatId: DRIVE_CACHE_FORMAT_ID,
      exportedAt: new Date().toISOString(),
      source: currentDriveCacheSource(),
      packs: { sheets: [], audio: [] },
    } satisfies DriveCacheManifest)

  const toDelete = [
    ...(opts.sheets ? previous.packs.sheets : []),
    ...(opts.audio ? previous.packs.audio : []),
  ].map((e) => e.hash)

  const deleted = await deleteDriveCacheObjectsByHash(toDelete)

  const next: DriveCacheManifest = {
    kind: 'singtags.drive-cache',
    schemaVersion: DRIVE_CACHE_SCHEMA_VERSION,
    formatId: DRIVE_CACHE_FORMAT_ID,
    exportedAt: new Date().toISOString(),
    source: currentDriveCacheSource(),
    packs: {
      sheets: opts.sheets ? [] : previous.packs.sheets,
      audio: opts.audio ? [] : previous.packs.audio,
    },
  }
  await writeDriveCacheManifest(next)

  driveCacheSyncState.status = 'idle'
  driveCacheSyncState.message =
    deleted > 0
      ? `Removed ${deleted} obsolete Drive media files (other packs kept)`
      : 'Drive media already clear for updated format'
  return { deleted }
}

/**
 * Full wipe of Drive cache objects + empty manifest.
 * Prefer {@link purgeIncompatibleDriveMedia} / {@link rewriteDriveCacheMetadata}.
 */
export async function invalidateDriveCache(reason: string): Promise<void> {
  driveCacheSyncState.status = 'invalidating'
  driveCacheSyncState.message = 'Clearing Drive song cache…'
  driveCacheSyncState.lastInvalidationReason = reason

  const cacheFolderId = await ensureAppDataPath(DRIVE_CACHE_SEGMENTS)
  const folders = (await listChildren(cacheFolderId)).filter(
    (f) => f.name === 'objects' && f.mimeType === DRIVE_FOLDER_MIME,
  )
  const children = (await Promise.all(folders.map((f) => listChildren(f.id)))).flat()
  driveCacheSyncState.done = 0
  driveCacheSyncState.total = children.length
  await mapPool(children, UPLOAD_CONCURRENCY, async (f) => {
    if (f.id) await deleteFile(f.id)
    driveCacheSyncState.done++
  })

  await writeDriveCacheManifest({
    kind: 'singtags.drive-cache',
    schemaVersion: DRIVE_CACHE_SCHEMA_VERSION,
    formatId: DRIVE_CACHE_FORMAT_ID,
    exportedAt: new Date().toISOString(),
    source: currentDriveCacheSource(),
    packs: { sheets: [], audio: [] },
  })

  driveCacheSyncState.status = 'idle'
  driveCacheSyncState.message = 'Drive song cache cleared'
}

/**
 * Align Drive cache with this client without wiping media unless media stamps changed.
 */
export async function ensureDriveCacheFormatCompatible(): Promise<{
  compatible: boolean
  clearedLocal: boolean
  reason: string
}> {
  const raw = await readCloudManifestRaw()
  const decision = decideDriveCacheAction(raw)

  if (decision.action === 'use' || decision.action === 'missing') {
    return { compatible: true, clearedLocal: false, reason: decision.action === 'missing' ? 'missing' : '' }
  }

  if (decision.action === 'rewrite-metadata') {
    await rewriteDriveCacheMetadata(decision.manifest, decision.reason)
    return { compatible: true, clearedLocal: false, reason: decision.reason }
  }

  if (decision.action === 'purge-media') {
    await purgeIncompatibleDriveMedia({
      sheets: decision.sheets,
      audio: decision.audio,
      manifest: decision.manifest,
      reason: decision.reason,
    })
    await clearLocalPacksForKinds({ sheets: decision.sheets, audio: decision.audio })
    return {
      compatible: false,
      clearedLocal: decision.sheets || decision.audio,
      reason: decision.reason,
    }
  }

  // Unreadable: keep orphaned objects; write empty current metadata so upload can relink.
  await writeDriveCacheManifest({
    kind: 'singtags.drive-cache',
    schemaVersion: DRIVE_CACHE_SCHEMA_VERSION,
    formatId: DRIVE_CACHE_FORMAT_ID,
    exportedAt: new Date().toISOString(),
    source: currentDriveCacheSource(),
    packs: { sheets: [], audio: [] },
  })
  driveCacheSyncState.lastInvalidationReason = decision.reason
  driveCacheSyncState.message =
    'Drive cache metadata was unreadable — media objects kept; will relink from this device'
  return { compatible: true, clearedLocal: false, reason: decision.reason }
}

async function hydratePackFromManifest(
  kind: PackKind,
  entries: DriveCachePackEntry[],
  objectIds: Map<string, string>,
  onFile: (path: string) => void,
): Promise<string[]> {
  const store = packStore(kind)
  const installed: string[] = []
  for (const entry of entries) {
    const url = urlFromPackPath(entry.path)
    const fileId = objectIds.get(entry.hash)
    if (!(await store.has(url)) && fileId) {
      const bytes = await downloadFileBytes(fileId)
      // Copy into a fresh ArrayBuffer — Response BodyInit rejects shared/generic ArrayBufferLike.
      const body = new Uint8Array(bytes.byteLength)
      body.set(bytes)
      await store.put(
        url,
        new Response(body.buffer, {
          status: 200,
          headers: { 'Content-Type': entry.mime || 'application/octet-stream' },
        }),
      )
      installed.push(entry.path)
    }
    onFile(entry.path)
  }
  return installed
}

/** Pull missing pack files from Drive into local Cache API / OPFS. */
export async function hydrateDriveCache(): Promise<{ sheets: number; audio: number }> {
  const wantSheets = isDriveSheetsCacheEnabled()
  const wantAudio = isDriveAudioCacheEnabled()
  if (!wantSheets && !wantAudio) return { sheets: 0, audio: 0 }
  if (isSingTagsOffline()) {
    driveCacheSyncState.message = 'Offline — Drive cache sync paused'
    return { sheets: 0, audio: 0 }
  }

  restoreGoogleConnection()
  if (!hasUsableAccessToken()) await getAccessToken()

  driveCacheSyncState.status = 'hydrating'
  driveCacheSyncState.done = 0
  driveCacheSyncState.total = 0
  clearDriveTagProgress()
  driveCacheSyncState.message = 'Checking Google Drive…'

  const cloud = await readCloudManifest()
  if (!cloud) {
    driveCacheSyncState.status = 'idle'
    driveCacheSyncState.message = ''
    return { sheets: 0, audio: 0 }
  }

  const { index: objectIds } = await collectDriveObjects()

  const sheetsEntries = wantSheets ? cloud.packs.sheets : []
  const audioEntries = wantAudio ? cloud.packs.audio : []
  const progress = trackTagProgress([...sheetsEntries, ...audioEntries].map((e) => e.path))
  driveCacheSyncState.message = 'Downloading song cache from Google Drive…'

  const sheets = await hydratePackFromManifest('sheets', sheetsEntries, objectIds, progress.mark)
  const audio = await hydratePackFromManifest('audio', audioEntries, objectIds, progress.mark)
  const restoredTags = tagIdsInCachePaths([...sheets, ...audio]).length

  driveCacheSyncState.status = 'idle'
  driveCacheSyncState.done = 0
  driveCacheSyncState.total = 0
  driveCacheSyncState.message =
    restoredTags > 0 ? `Restored ${restoredTags} tag${restoredTags === 1 ? '' : 's'} from Google Drive` : ''
  return { sheets: sheets.length, audio: audio.length }
}

/** Upload local pack files that Drive does not already have; rewrite manifest. */
export async function uploadDriveCache(): Promise<{ uploaded: number }> {
  if (uploadInFlight) {
    uploadFollowUp = true
    return uploadInFlight
  }
  const run = (async () => {
    try {
      let result = await uploadDriveCacheOnce()
      while (uploadFollowUp) {
        uploadFollowUp = false
        result = await uploadDriveCacheOnce()
      }
      return result
    } finally {
      uploadInFlight = null
    }
  })()
  uploadInFlight = run
  return run
}

async function uploadDriveCacheOnce(): Promise<{ uploaded: number }> {
  const wantSheets = isDriveSheetsCacheEnabled()
  const wantAudio = isDriveAudioCacheEnabled()
  if (!wantSheets && !wantAudio) return { uploaded: 0 }
  if (isSingTagsOffline()) {
    driveCacheSyncState.message = 'Offline — Drive cache sync paused'
    return { uploaded: 0 }
  }

  restoreGoogleConnection()
  if (!hasUsableAccessToken()) await getAccessToken()

  driveCacheSyncState.status = 'uploading'
  driveCacheSyncState.done = 0
  driveCacheSyncState.total = 0
  clearDriveTagProgress()
  driveCacheSyncState.message = 'Checking songs saved on this device…'

  const local = await buildLocalDriveCacheManifest({ sheets: wantSheets, audio: wantAudio })
  driveCacheSyncState.message = 'Checking which songs are already on Google Drive…'
  const { folderId: objectsFolderId, index: objectIds } = await collectDriveObjects()
  const cloud = await readCloudManifest()
  // Only bytes that are actually in an objects folder count as uploaded.
  // A manifest can name hashes whose files never finished copying.
  const known = new Set<string>(objectIds.keys())

  const all = [
    ...(wantSheets ? local.packs.sheets : []),
    ...(wantAudio ? local.packs.audio : []),
  ]
  const uniqueMissing = selectCacheEntriesToUpload(all, known)
  const progress = trackTagProgress(uniqueMissing.map((e) => e.path))
  if (uniqueMissing.length > 0) {
    driveCacheSyncState.message = 'Uploading song cache to Google Drive…'
  }

  let uploaded = 0
  const uploadedPaths: string[] = []
  await mapPool(uniqueMissing, UPLOAD_CONCURRENCY, async (entry) => {
    const src = hashSources.get(entry.hash)
    if (!src) {
      progress.mark(entry.path)
      return
    }
    const res = await packStore(src.kind).get(src.url)
    if (!res) {
      progress.mark(entry.path)
      return
    }
    const bytes = new Uint8Array(await res.arrayBuffer())
    const created = await uploadNewFile({
      name: entry.hash,
      parentId: objectsFolderId,
      mimeType: entry.mime || src.mime || 'application/octet-stream',
      bytes,
    })
    objectIds.set(entry.hash, created.id)
    known.add(entry.hash)
    uploaded++
    uploadedPaths.push(entry.path)
    progress.mark(entry.path)
  })

  const merged: DriveCacheManifest = {
    ...local,
    packs: {
      sheets: wantSheets ? local.packs.sheets : cloud?.packs.sheets ?? [],
      audio: wantAudio ? local.packs.audio : cloud?.packs.audio ?? [],
    },
  }

  const cacheFolderId = await ensureAppDataPath(DRIVE_CACHE_SEGMENTS)
  await upsertTextFile({
    name: DRIVE_CACHE_MANIFEST_FILE,
    parentId: cacheFolderId,
    text: JSON.stringify(merged),
    mimeType: 'application/json',
  })

  const uploadedTags = tagIdsInCachePaths(uploadedPaths).length
  driveCacheSyncState.status = 'idle'
  driveCacheSyncState.done = 0
  driveCacheSyncState.total = 0
  driveCacheSyncState.message =
    uploadedTags > 0
      ? `Uploaded ${uploadedTags} tag${uploadedTags === 1 ? '' : 's'} to Google Drive`
      : 'Song cache already on Google Drive'
  return { uploaded }
}

/**
 * Hydrate from Drive, then upload whatever is local.
 * Safe to call repeatedly; concurrent calls share one in-flight promise.
 *
 * Background callers should pass `{ allowTokenPrompt: false }` (default) so we
 * never open a Google popup without a user gesture.
 */
export async function ensureDriveCacheSync(opts?: {
  allowTokenPrompt?: boolean
}): Promise<void> {
  if (!isDriveSyncEnabled() || !isDriveCacheSyncEnabled()) return
  if (isSingTagsOffline()) {
    driveCacheSyncState.status = 'idle'
    driveCacheSyncState.message = 'Offline — Drive cache sync paused'
    return
  }
  restoreGoogleConnection()
  if (!hasUsableAccessToken()) {
    if (!opts?.allowTokenPrompt) return
    await getAccessToken({ interactive: true })
  }
  if (syncInFlight) return syncInFlight
  syncInFlight = (async () => {
    try {
      const format = await ensureDriveCacheFormatCompatible()
      if (format.compatible) {
        await hydrateDriveCache()
      } else if (format.clearedLocal) {
        // Media stamps changed for some packs — objects for those packs were purged only.
        driveCacheSyncState.message =
          'Song media format updated — refill cleared packs from SingTags (other Drive media kept)'
      }
      await uploadDriveCache()
    } catch (e) {
      driveCacheSyncState.status = 'error'
      driveCacheSyncState.message = e instanceof Error ? e.message : String(e)
      throw e
    } finally {
      syncInFlight = null
    }
  })()
  return syncInFlight
}

/** Debounced upload after local packs grow (e.g. pack download finished). */
export function scheduleDriveCachePush(): void {
  if (!isDriveSyncEnabled() || !isDriveCacheSyncEnabled()) return
  if (isSingTagsOffline()) {
    driveCacheSyncState.message = 'Offline — Drive cache upload pending'
    return
  }
  if (pushTimer) clearTimeout(pushTimer)
  pushTimer = setTimeout(() => {
    pushTimer = null
    void uploadDriveCache().catch(() => {
      /* message on driveCacheSyncState */
    })
  }, PUSH_DEBOUNCE_MS)
}

/** Test helper. */
export function __resetDriveCacheSyncForTests(): void {
  if (pushTimer) clearTimeout(pushTimer)
  pushTimer = null
  syncInFlight = null
  uploadInFlight = null
  uploadFollowUp = false
  driveCacheSyncState.status = 'idle'
  driveCacheSyncState.message = ''
  driveCacheSyncState.done = 0
  driveCacheSyncState.total = 0
  driveCacheSyncState.lastInvalidationReason = ''
  driveCacheSyncState.sheetsEnabled = false
  driveCacheSyncState.audioEnabled = false
  driveCacheSyncState.tagIds = []
  driveCacheSyncState.finishedTagIds = []
  driveCacheSyncState.filesDone = 0
  driveCacheSyncState.filesTotal = 0
}
