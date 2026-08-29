import { unzipSync } from 'fflate'
import { buildZip, downloadBlob } from '../download/zip'
import { mediaBaseUrl, mediaUrl } from '../lib/mediaUrl'
import { HOSTED_AUDIO_MIME } from '../types/audio'
import type { TagDetail } from '../types/tag'
import { audioPack, sheetsPack, type PackKind } from './libraryPack'
import { clearAllPackProgress } from './packProgressDb'
import { clearCatalogSnapshot } from '../lib/catalogSnapshot'
import { clearIndexSnapshotsIdb } from './indexSnapshotDb'
import { clearPdfRasterCache } from './pdfRasterCache'
import {
  clearAllStarred,
  listStarred,
  parseStarredFile,
  putStarred,
  toStarredFile,
  type StarredTagRecord,
} from './starredDb'
import {
  applyPitchPipePrefsSnapshot,
  pitchPipePrefsSnapshot,
} from '../stores/preferences'

export interface CacheProgress {
  label: string
  done: number
  total: number
  ratio: number
}

export interface OfflineCacheManifest {
  version: 1
  kind: 'singtags.offline-cache'
  exportedAt: string
  sheetsFiles: number
  audioFiles: number
  starredTags: number
}

export interface OfflineCacheImportResult {
  sheetsFiles: number
  audioFiles: number
  starredTags: number
  /** True when preferences/pitch-pipe.json was applied. */
  pitchPipePrefs?: boolean
}

const SW_CACHE_PREFIX = 'singtags'
const CATALOG_CACHED_KEY = 'singtags.catalogCachedAt'

function report(onProgress: ((p: CacheProgress) => void) | undefined, label: string, done: number, total: number): void {
  onProgress?.({
    label,
    done,
    total,
    ratio: total <= 0 ? 1 : done / total,
  })
}

/** Map an absolute media URL back to a relative path for zip layout. */
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

function zipPathForUrl(kind: PackKind, url: string): string {
  const rel = urlToRelativePath(url) ?? `by-url/${encodeURIComponent(url)}`
  return `packs/${kind}/${rel}`
}

/** Reverse of zipPathForUrl — absolute media URL for a pack zip entry. */
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

async function clearServiceWorkerCaches(): Promise<void> {
  if (typeof caches === 'undefined') return
  for (const name of await caches.keys()) {
    if (name.startsWith(SW_CACHE_PREFIX)) await caches.delete(name)
  }
}

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

/** Remove all offline packs, starred data, pack progress, and SingTags service-worker caches. */
export async function clearAllOfflineData(): Promise<void> {
  await Promise.all([
    sheetsPack.clear(),
    audioPack.clear(),
    clearAllStarred(),
    clearAllPackProgress(),
    clearPdfRasterCache(),
  ])
  await clearServiceWorkerCaches()
  try {
    localStorage.removeItem(CATALOG_CACHED_KEY)
    clearCatalogSnapshot()
    await clearIndexSnapshotsIdb()
  } catch {
    /* ignore */
  }
}

/** Export cached sheets/audio packs and starred blobs as a zip archive. */
/** Build an offline-cache zip in memory (does not download). */
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

/** Restore packs + starred media from a SingTags offline-cache zip (merges into existing data). */

/** Build and download an offline-cache zip. */
export async function exportOfflineCacheZip(
  onProgress?: (p: CacheProgress) => void,
): Promise<{ fileCount: number; bytes: number }> {
  const built = await buildOfflineCacheZip(onProgress)
  const stamp = built.exportedAt.slice(0, 10)
  downloadBlob(built.bytes, `singtags-offline-cache-${stamp}.zip`, 'application/zip')
  report(onProgress, 'Download started', 1, 1)
  return { fileCount: built.fileCount, bytes: built.bytes.byteLength }
}

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

export { clearServiceWorkerCaches, CATALOG_CACHED_KEY }
