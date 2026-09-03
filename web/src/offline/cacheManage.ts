/**
 * Export, import, and wipe SingTags offline data as a portable zip archive.
 *
 * Zip layout:
 * - `packs/sheets/` and `packs/audio/` — tier-2 library pack caches
 * - `starred/` — favorites media and `starred.tags.json` metadata (legacy path names)
 * - `preferences/pitch-pipe.json` — pitch-pipe settings snapshot
 * - `manifest.json` — format/version header
 *
 * Product UI refers to favorites; persistence and zip paths still use `starred*` names.
 */

import { unzipSync } from 'fflate'
import { buildZip, downloadBlob } from '../download/zip'
import { mediaBaseUrl, mediaUrl } from '../lib/mediaUrl'
import { HOSTED_AUDIO_MIME } from '../types/audio'
import type { TagDetail } from '../types/tag'
import { audioPack, sheetsPack, type PackKind } from './libraryPack'
import { clearAllPackProgress } from './packProgressDb'
import { clearCatalogSnapshot } from '../lib/catalogSnapshot'
import { clearIndexSnapshotsIdb } from './indexSnapshotDb'
import { clearPdfRasterCache, pdfRasterCacheBytes } from './pdfRasterCache'
import { clearLearningStereoCache } from './resolveMedia'
import {
  isBaseOfflineAudioPackPath,
  isUpgradeAudioCachePath,
} from '../lib/audioTiers'
import type { OfflineManifest } from './manifestTypes'
import {
  clearAllStarred,
  listStarred,
  parseStarredFile,
  putStarred,
  toStarredFile,
  type StarredTagRecord,
} from './favoritesDb'
import {
  applyPitchPipePrefsSnapshot,
  pitchPipePrefsSnapshot,
} from '../stores/preferences'

/** Progress payload emitted while building or restoring an offline-cache zip. */
export interface CacheProgress {
  /** Human-readable step label (e.g. "Reading sheets cache…"). */
  label: string
  /** Completed work units in the current operation. */
  done: number
  /** Total work units for the current operation. */
  total: number
  /** {@link done} / {@link total}, or `1` when {@link total} is zero. */
  ratio: number
}

/** Header written to `manifest.json` inside an offline-cache export zip. */
export interface OfflineCacheManifest {
  version: 1
  kind: 'singtags.offline-cache'
  /** ISO timestamp when the zip was built. */
  exportedAt: string
  /** Count of sheet pack entries at export time (informational). */
  sheetsFiles: number
  /** Count of audio pack entries at export time (informational). */
  audioFiles: number
  /** Count of favorite tags with metadata at export time (maps to `starredTags` in JSON). */
  starredTags: number
}

/** Summary returned after {@link importOfflineCacheZip} completes. */
export interface OfflineCacheImportResult {
  /** Sheet pack files restored from the zip. */
  sheetsFiles: number
  /** Audio pack files restored from the zip. */
  audioFiles: number
  /** Favorite tags restored (metadata + any bundled media blobs). */
  starredTags: number
  /** True when `preferences/pitch-pipe.json` was applied. */
  pitchPipePrefs?: boolean
}

const SW_CACHE_PREFIX = 'singtags'
/** localStorage key recording when the catalog was last cached for offline use. */
const CATALOG_CACHED_KEY = 'singtags.catalogCachedAt'

/** Emit a normalized {@link CacheProgress} snapshot when a callback is provided. */
function report(onProgress: ((p: CacheProgress) => void) | undefined, label: string, done: number, total: number): void {
  onProgress?.({
    label,
    done,
    total,
    ratio: total <= 0 ? 1 : done / total,
  })
}

/**
 * Map an absolute media URL back to a relative path for zip layout.
 *
 * @param url Absolute or origin-relative media URL.
 * @returns Path relative to {@link mediaBaseUrl}, or `null` when the URL is external.
 */
export function urlToRelativePath(url: string): string | null {
  const base = mediaBaseUrl()
  if (url.startsWith(base + '/')) return url.slice(base.length + 1)
  if (url.startsWith(base)) return url.slice(base.length).replace(/^\//, '')
  try {
    const u = new URL(url)
    const baseUrl = new URL(base)
    if (u.origin === baseUrl.origin && u.pathname.startsWith(baseUrl.pathname)) {
      return u.pathname.slice(baseUrl.pathname.length).replace(/^\//, '')
    }
  } catch {
    /* ignore */
  }
  return null
}

/** Zip entry path for a cached pack URL (`packs/{kind}/…`). */
function zipPathForUrl(kind: PackKind, url: string): string {
  const rel = urlToRelativePath(url) ?? `by-url/${encodeURIComponent(url)}`
  return `packs/${kind}/${rel}`
}

/**
 * Reverse of {@link zipPathForUrl} — resolve a pack zip entry to an absolute media URL.
 *
 * @param kind Pack kind (`sheets` or `audio`).
 * @param entryPath Zip path under `packs/{kind}/`.
 */
export function packUrlFromZipPath(kind: PackKind, entryPath: string): string | null {
  const prefix = `packs/${kind}/`
  if (!entryPath.startsWith(prefix) || entryPath.endsWith('/')) return null
  const rest = entryPath.slice(prefix.length)
  if (!rest) return null
  if (rest.startsWith('by-url/')) {
    try {
      return decodeURIComponent(rest.slice('by-url/'.length))
    } catch {
      return null
    }
  }
  return mediaUrl(rest)
}

function partFilename(path: string, part: string, mime: string): string {
  const ext = path.match(/\.([a-z0-9]+)$/i)?.[1] || mime.split('/')[1]?.split(';')[0] || 'bin'
  return `${part}.${ext}`
}

function mimeFromFilename(name: string): string {
  const lower = name.toLowerCase()
  if (lower.endsWith('.webp')) return 'image/webp'
  if (lower.endsWith('.png')) return 'image/png'
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg'
  if (lower.endsWith('.gif')) return 'image/gif'
  if (lower.endsWith('.m4a')) return HOSTED_AUDIO_MIME
  if (lower.endsWith('.ogg') || lower.endsWith('.opus')) return 'audio/ogg'
  if (lower.endsWith('.webm')) return 'audio/webm'
  if (lower.endsWith('.wav')) return 'audio/wav'
  if (lower.endsWith('.mp3')) return 'audio/mpeg'
  return 'application/octet-stream'
}

function sheetPathForRestore(tagId: number, filename: string, detail: TagDetail | null): string {
  const pages =
    detail?.sheet_pages?.length
      ? detail.sheet_pages
      : detail?.sheet
        ? [detail.sheet]
        : []
  const match = pages.find((p) => p.split('/').pop() === filename)
  return match || `sheets/${tagId}/pages/${filename}`
}

function audioPathForRestore(
  tagId: number,
  part: string,
  filename: string,
  detail: TagDetail | null,
): string {
  const fromDetail = detail?.audio?.[part]
  if (fromDetail) return fromDetail
  return `media/${tagId}/${filename}`
}

/** Delete all Cache API buckets whose names start with {@link SW_CACHE_PREFIX}. */
async function clearServiceWorkerCaches(): Promise<void> {
  if (typeof caches === 'undefined') return
  for (const name of await caches.keys()) {
    if (name.startsWith(SW_CACHE_PREFIX)) await caches.delete(name)
  }
}

/** Append all entries from one pack store into the in-memory zip file list. */
async function addPackFiles(
  kind: PackKind,
  store: typeof sheetsPack,
  files: Array<{ name: string; data: Uint8Array }>,
  onProgress: ((p: CacheProgress) => void) | undefined,
  doneOffset: number,
  total: number,
): Promise<number> {
  const urls = await store.listUrls()
  let done = doneOffset
  for (const url of urls) {
    const res = await store.get(url)
    if (!res) {
      done++
      report(onProgress, `Reading ${kind} cache…`, done, total)
      continue
    }
    const data = new Uint8Array(await res.arrayBuffer())
    files.push({ name: zipPathForUrl(kind, url), data })
    done++
    report(onProgress, `Reading ${kind} cache…`, done, total)
  }
  return done
}

/**
 * Remove all offline data: library packs, favorites (IndexedDB `starred` store),
 * pack progress, PDF rasters, catalog/index snapshots, and SingTags service-worker caches.
 */
export async function clearAllOfflineData(): Promise<void> {
  await Promise.all([
    sheetsPack.clear(),
    audioPack.clear(),
    clearAllStarred(),
    clearAllPackProgress(),
    clearPdfRasterCache(),
  ])
  clearLearningStereoCache()
  await clearServiceWorkerCaches()
  try {
    localStorage.removeItem(CATALOG_CACHED_KEY)
    clearCatalogSnapshot()
    await clearIndexSnapshotsIdb()
  } catch {
    /* ignore */
  }
  // Favorites metadata is in IDB; custom collections are in localStorage — clear both
  // so collection chips do not outlive the starred tags they reference.
  try {
    localStorage.removeItem('singtags.userCollections.v1')
    localStorage.removeItem('singtags.practiceOrder.v1')
  } catch {
    /* ignore */
  }
}

/** Result of {@link cullUpgradeCaches}. */
export type CullUpgradeResult = {
  /** High-res PDF raster cache was wiped. */
  pdfRastersCleared: boolean
  /** Bytes freed from PDF raster IDB/memory (best-effort). */
  pdfRasterBytesRemoved: number
  /** Bytes removed from the audio pack (playback/original warms). */
  audioPackBytesRemoved: number
  /** Audio pack URLs deleted. */
  audioPackFilesRemoved: number
  /** Favorite-tag audio parts demoted (HQ blobs deleted). */
  starredPartsRemoved: number
}

function pathFromPackUrl(url: string): string {
  if (!url) return ''
  return urlToRelativePath(url) ?? url
}

function shouldKeepAudioPackUrl(url: string, manifestKeep: Set<string> | null): boolean {
  if (!url) return false
  const rel = pathFromPackUrl(url)
  if (manifestKeep) {
    if (manifestKeep.has(url) || manifestKeep.has(rel)) return true
    try {
      const abs = mediaUrl(rel)
      if (manifestKeep.has(abs)) return true
    } catch {
      /* ignore */
    }
  }
  return isBaseOfflineAudioPackPath(rel)
}

/**
 * Remove browse-time quality upgrades while keeping the deliberate offline pack:
 * WebP sheets, ultra/lo-fi audio pack entries, and catalog metadata.
 *
 * Clears: 300dpi PDF rasters, warmed playback/original audio in the pack,
 * favorited original/playback blobs, and in-session learning-stereo cache.
 */
export async function cullUpgradeCaches(opts?: {
  audioManifest?: OfflineManifest | null
  onProgress?: (p: CacheProgress) => void
}): Promise<CullUpgradeResult> {
  const onProgress = opts?.onProgress
  report(onProgress, 'Clearing high-res sheet rasters…', 0, 4)

  const pdfBytesBefore = await pdfRasterCacheBytes()
  await clearPdfRasterCache()
  clearLearningStereoCache()

  report(onProgress, 'Culling upgraded learning tracks…', 1, 4)
  let manifestKeep: Set<string> | null = null
  const manifest = opts?.audioManifest
  if (manifest?.entries?.length) {
    manifestKeep = new Set<string>()
    for (const entry of manifest.entries) {
      for (const p of entry.paths) {
        manifestKeep.add(p)
        manifestKeep.add(mediaUrl(p))
      }
    }
  }

  let audioPackBytesRemoved = 0
  let audioPackFilesRemoved = 0
  const audioUrls = await audioPack.listUrls()
  for (const url of audioUrls) {
    if (!url) continue
    if (shouldKeepAudioPackUrl(url, manifestKeep)) continue
    // Without a manifest, only remove paths that look like HQ upgrades.
    if (!manifestKeep && !isUpgradeAudioCachePath(pathFromPackUrl(url))) continue
    try {
      const res = await audioPack.get(url)
      if (res) audioPackBytesRemoved += (await res.arrayBuffer()).byteLength
      await audioPack.delete(url)
      audioPackFilesRemoved++
    } catch {
      /* ignore */
    }
  }
  report(onProgress, 'Demoting favorited high-quality audio…', 2, 4)
  let starredPartsRemoved = 0
  const starred = await listStarred()
  for (const rec of starred) {
    const blobs = rec.audioBlobs
    if (!blobs) continue
    let changed = false
    const next: NonNullable<StarredTagRecord['audioBlobs']> = { ...blobs }
    for (const [part, entry] of Object.entries(blobs)) {
      // Keep deliberate ultra/lo-fi favorite blobs; drop playback/original upgrades.
      if (entry.quality === 'lofi' || isBaseOfflineAudioPackPath(entry.path)) continue
      const hq =
        entry.quality === 'original' ||
        entry.quality === 'standard' ||
        entry.quality === 'compact' ||
        isUpgradeAudioCachePath(entry.path)
      if (!hq) continue
      delete next[part]
      changed = true
      starredPartsRemoved++
    }
    if (!changed) continue
    await putStarred({
      ...rec,
      audioBlobs: Object.keys(next).length ? next : undefined,
      offlineMedia: Object.keys(next).length > 0 || !!rec.sheetBlobs?.length,
    })
  }

  report(onProgress, 'Done', 4, 4)
  return {
    pdfRastersCleared: true,
    pdfRasterBytesRemoved: pdfBytesBefore,
    audioPackBytesRemoved,
    audioPackFilesRemoved,
    starredPartsRemoved,
  }
}

/**
 * Build an offline-cache zip in memory (does not trigger a browser download).
 *
 * Collects tier-2 sheet/audio packs, favorite tag media from IndexedDB (`starred/` paths),
 * pitch-pipe preferences, and a {@link OfflineCacheManifest}.
 *
 * @param onProgress Optional progress callback.
 * @returns Raw zip bytes plus export metadata.
 */
export async function buildOfflineCacheZip(
  onProgress?: (p: CacheProgress) => void,
): Promise<{ fileCount: number; bytes: Uint8Array; exportedAt: string }> {
  const starred = await listStarred()
  const sheetUrls = await sheetsPack.listUrls()
  const audioUrls = await audioPack.listUrls()

  let blobCount = 0
  for (const rec of starred) {
    blobCount += rec.sheetBlobs?.length ?? 0
    blobCount += rec.audioBlobs ? Object.keys(rec.audioBlobs).length : 0
  }

  const total = sheetUrls.length + audioUrls.length + blobCount + 3
  let done = 0
  const files: Array<{ name: string; data: Uint8Array }> = []

  done = await addPackFiles('sheets', sheetsPack, files, onProgress, done, total)
  done = await addPackFiles('audio', audioPack, files, onProgress, done, total)

  const starredMeta = toStarredFile(starred)
  files.push({
    name: 'starred/starred.tags.json',
    data: new TextEncoder().encode(JSON.stringify(starredMeta, null, 2)),
  })
  done++
  report(onProgress, 'Writing starred metadata…', done, total)

  for (const rec of starred) {
    for (const sheet of rec.sheetBlobs ?? []) {
      const base = sheet.path.split('/').pop() || 'sheet.webp'
      files.push({
        name: `starred/${rec.tagId}/sheets/${base}`,
        data: new Uint8Array(sheet.data),
      })
      done++
      report(onProgress, `Favorite #${rec.tagId} sheets…`, done, total)
    }
    for (const [part, audio] of Object.entries(rec.audioBlobs ?? {})) {
      files.push({
        name: `starred/${rec.tagId}/audio/${partFilename(audio.path, part, audio.mime)}`,
        data: new Uint8Array(audio.data),
      })
      done++
      report(onProgress, `Favorite #${rec.tagId} audio…`, done, total)
    }
  }

  files.push({
    name: 'preferences/pitch-pipe.json',
    data: new TextEncoder().encode(JSON.stringify(pitchPipePrefsSnapshot(), null, 2)),
  })
  done++
  report(onProgress, 'Writing pitch pipe settings…', done, total)

  const manifest: OfflineCacheManifest = {
    version: 1,
    kind: 'singtags.offline-cache',
    exportedAt: new Date().toISOString(),
    sheetsFiles: sheetUrls.length,
    audioFiles: audioUrls.length,
    starredTags: starred.length,
  }
  files.push({
    name: 'manifest.json',
    data: new TextEncoder().encode(JSON.stringify(manifest, null, 2)),
  })
  done++
  report(onProgress, 'Building zip…', done, total)

  const zipped = buildZip(files)
  report(onProgress, 'Zip ready', total, total)

  return { fileCount: files.length, bytes: zipped, exportedAt: manifest.exportedAt }
}

/** Restore `packs/{kind}/…` zip entries into the matching {@link OfflinePackStore}. */
async function restorePackEntries(
  kind: PackKind,
  store: typeof sheetsPack,
  tree: Record<string, Uint8Array>,
  onProgress: ((p: CacheProgress) => void) | undefined,
  done: number,
  total: number,
): Promise<{ done: number; count: number }> {
  const prefix = `packs/${kind}/`
  let count = 0
  for (const [name, data] of Object.entries(tree)) {
    if (!name.startsWith(prefix) || name.endsWith('/')) continue
    const url = packUrlFromZipPath(kind, name)
    if (!url) {
      done++
      report(onProgress, `Restoring ${kind}…`, done, total)
      continue
    }
    const mime = mimeFromFilename(name)
    const copy = new Uint8Array(data.byteLength)
    copy.set(data)
    await store.put(
      url,
      new Response(copy.buffer, {
        status: 200,
        headers: { 'Content-Type': mime },
      }),
    )
    count++
    done++
    report(onProgress, `Restoring ${kind}…`, done, total)
  }
  return { done, count }
}

/**
 * Build an offline-cache zip and start a browser download.
 *
 * Thin wrapper around {@link buildOfflineCacheZip} that saves
 * `singtags-offline-cache-{date}.zip` via {@link downloadBlob}.
 *
 * @param onProgress Optional progress callback (includes a final "Download started" step).
 */
export async function exportOfflineCacheZip(
  onProgress?: (p: CacheProgress) => void,
): Promise<{ fileCount: number; bytes: number }> {
  const built = await buildOfflineCacheZip(onProgress)
  const stamp = built.exportedAt.slice(0, 10)
  downloadBlob(built.bytes, `singtags-offline-cache-${stamp}.zip`, 'application/zip')
  report(onProgress, 'Download started', 1, 1)
  return { fileCount: built.fileCount, bytes: built.bytes.byteLength }
}

/**
 * Restore packs and favorite-tag media from a SingTags offline-cache zip.
 *
 * Merges into existing IndexedDB / pack data (does not wipe first). Validates
 * `manifest.json` and restores `starred/starred.tags.json` plus any bundled blobs.
 *
 * @param input Zip bytes as a Blob, ArrayBuffer, or Uint8Array.
 * @param onProgress Optional progress callback.
 * @throws When the input is not a supported SingTags offline-cache zip.
 */
export async function importOfflineCacheZip(
  input: Blob | ArrayBuffer | Uint8Array,
  onProgress?: (p: CacheProgress) => void,
): Promise<OfflineCacheImportResult> {
  const bytes =
    input instanceof Uint8Array
      ? input
      : new Uint8Array(input instanceof ArrayBuffer ? input : await input.arrayBuffer())

  report(onProgress, 'Reading zip…', 0, 1)
  let tree: Record<string, Uint8Array>
  try {
    tree = unzipSync(bytes) as Record<string, Uint8Array>
  } catch {
    throw new Error('Could not read zip — is this a SingTags offline cache export?')
  }

  const manifestBytes = tree['manifest.json']
  if (!manifestBytes) throw new Error('Not a SingTags offline cache zip (missing manifest.json)')
  let manifest: OfflineCacheManifest
  try {
    manifest = JSON.parse(new TextDecoder().decode(manifestBytes)) as OfflineCacheManifest
  } catch {
    throw new Error('Invalid offline cache manifest.json')
  }
  if (manifest.kind !== 'singtags.offline-cache' || manifest.version !== 1) {
    throw new Error('Unsupported offline cache zip format')
  }

  const packNames = Object.keys(tree).filter(
    (n) => (n.startsWith('packs/sheets/') || n.startsWith('packs/audio/')) && !n.endsWith('/'),
  )
  const starredSheetNames = Object.keys(tree).filter(
    (n) => /^starred\/\d+\/sheets\//.test(n) && !n.endsWith('/'),
  )
  const starredAudioNames = Object.keys(tree).filter(
    (n) => /^starred\/\d+\/audio\//.test(n) && !n.endsWith('/'),
  )
  const total = packNames.length + starredSheetNames.length + starredAudioNames.length + 3
  let done = 0

  const sheets = await restorePackEntries('sheets', sheetsPack, tree, onProgress, done, total)
  done = sheets.done
  const audio = await restorePackEntries('audio', audioPack, tree, onProgress, done, total)
  done = audio.done

  const metaBytes = tree['starred/starred.tags.json']
  let starredTags = 0
  if (metaBytes) {
    const file = parseStarredFile(JSON.parse(new TextDecoder().decode(metaBytes)))
    done++
    report(onProgress, 'Restoring favorites…', done, total)

    for (const t of file.tags) {
      if (!t.summary?.id) continue
      const tagId = t.summary.id
      const sheetBlobs: NonNullable<StarredTagRecord['sheetBlobs']> = []
      for (const name of starredSheetNames) {
        const m = name.match(/^starred\/(\d+)\/sheets\/(.+)$/)
        if (!m || Number(m[1]) !== tagId) continue
        const filename = m[2]!
        const data = tree[name]!
        const copy = new Uint8Array(data.byteLength)
        copy.set(data)
        sheetBlobs.push({
          path: sheetPathForRestore(tagId, filename, t.detail),
          mime: mimeFromFilename(filename),
          data: copy.buffer,
        })
        done++
        report(onProgress, `Favorite #${tagId} sheets…`, done, total)
      }

      const audioBlobs: NonNullable<StarredTagRecord['audioBlobs']> = {}
      for (const name of starredAudioNames) {
        const m = name.match(/^starred\/(\d+)\/audio\/(.+)$/)
        if (!m || Number(m[1]) !== tagId) continue
        const filename = m[2]!
        const part = filename.replace(/\.[^.]+$/, '') || 'audio'
        const data = tree[name]!
        const copy = new Uint8Array(data.byteLength)
        copy.set(data)
        audioBlobs[part] = {
          path: audioPathForRestore(tagId, part, filename, t.detail),
          mime: mimeFromFilename(filename),
          data: copy.buffer,
        }
        done++
        report(onProgress, `Favorite #${tagId} audio…`, done, total)
      }

      const hasMedia = sheetBlobs.length > 0 || Object.keys(audioBlobs).length > 0
      await putStarred({
        tagId,
        starredAt: t.starredAt || new Date().toISOString(),
        summary: t.summary,
        detail: t.detail ?? null,
        sheetBlobs: sheetBlobs.length ? sheetBlobs : undefined,
        audioBlobs: Object.keys(audioBlobs).length ? audioBlobs : undefined,
        offlineMedia: hasMedia,
        quotaWarning: null,
      })
      starredTags++
    }
  } else {
    done++
    report(onProgress, 'No favorites metadata in zip', done, total)
  }

  let pitchPipePrefs = false
  const pipeBytes = tree['preferences/pitch-pipe.json']
  if (pipeBytes) {
    try {
      const raw = JSON.parse(new TextDecoder().decode(pipeBytes)) as unknown
      pitchPipePrefs = applyPitchPipePrefsSnapshot(raw)
    } catch {
      pitchPipePrefs = false
    }
  }
  done++
  report(
    onProgress,
    pitchPipePrefs ? 'Restored pitch pipe settings…' : 'No pitch pipe settings in zip',
    done,
    total,
  )

  report(onProgress, 'Restore complete', total, total)
  return {
    sheetsFiles: sheets.count,
    audioFiles: audio.count,
    starredTags,
    pitchPipePrefs,
  }
}

/** @internal Re-exported for tests — clears SingTags-prefixed Cache API entries. */
export { clearServiceWorkerCaches, CATALOG_CACHED_KEY }
