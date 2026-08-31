/**
 * Favorites persistence in IndexedDB (legacy store name `starred`).
 *
 * Product UI calls these "favorites"; API/type names retain `star*` for compatibility
 * with export files (`singtags.starred`) and zip paths (`starred/`).
 */

import type { PartId, TagDetail, TagSummary } from '../types/tag'
import type { AudioEncodeQuality } from '../types/audio'
import { listAudioParts, storageAudioPath } from '../lib/audioTiers'
import { sampleUrl } from '../download/zip'
import { sheetDisplayPages } from '../lib/sheetPaths'
import { fetchAudioForStorage } from './compactAudio'
import { mediaCacheKey } from '../lib/mediaCacheKey'

const DB_NAME = 'singtags'
const DB_VERSION = 1
const STORE = 'starred'

/** Progress payload while favoriting a tag and caching its media. */
export interface StarProgress {
  label: string
  done: number
  total: number
  ratio: number
}

/** Options for {@link starTag} / {@link refreshStarMedia}. */
export interface StarOptions {
  /** Save summary/detail only — skip sheet and audio blob downloads. */
  metadataOnly?: boolean
  /** Skip fetching sheet blobs (e.g. when tier-2 pack already has them). */
  skipSheets?: boolean
  /** How to store audio on device. Default: standard (stereo AAC). */
  audioQuality?: AudioEncodeQuality
  onProgress?: (p: StarProgress) => void
}

/** One favorited tag row in IndexedDB (`starred` object store). */
export interface StarredTagRecord {
  tagId: number
  /** ISO timestamp when the tag was favorited. */
  starredAt: string
  summary: TagSummary
  detail: TagDetail | null
  /** Cached sheet page blobs (webp/png), same order as detail.sheet_pages when possible. */
  sheetBlobs?: Array<{ path: string; mime: string; data: ArrayBuffer }>
  /** Cached audio part blobs for offline play. */
  audioBlobs?: Record<
    string,
    { path: string; mime: string; data: ArrayBuffer; quality?: AudioEncodeQuality }
  >
  /** Whether any offline media blobs were stored for this favorite. */
  offlineMedia: boolean
  /**
   * Fingerprint of catalog media when blobs were cached
   * ({@link mediaCacheKey}); used to detect stale offline media.
   */
  mediaCacheKey?: string | null
  quotaWarning?: string | null
}

/** Portable JSON export of favorite tag metadata (no media blobs). */
export interface StarredTagsFile {
  version: 1
  kind: 'singtags.starred'
  exportedAt: string
  tags: Array<{
    starredAt: string
    summary: TagSummary
    detail: TagDetail | null
  }>
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onerror = () => reject(req.error ?? new Error('IndexedDB open failed'))
    req.onsuccess = () => resolve(req.result)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'tagId' })
      }
    }
  })
}

function idbReq<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('IndexedDB request failed'))
  })
}

function idbTx(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'))
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'))
  })
}

/** List all favorited tags, newest {@link StarredTagRecord.starredAt} first. */
export async function listStarred(): Promise<StarredTagRecord[]> {
  const db = await openDb()
  try {
    const tx = db.transaction(STORE, 'readonly')
    const rows = await idbReq(tx.objectStore(STORE).getAll())
    await idbTx(tx)
    return (rows as StarredTagRecord[]).sort((a, b) => b.starredAt.localeCompare(a.starredAt))
  } finally {
    db.close()
  }
}

/** Load one favorite by tag id, or `undefined` when not favorited. */
export async function getStarred(tagId: number): Promise<StarredTagRecord | undefined> {
  const db = await openDb()
  try {
    const tx = db.transaction(STORE, 'readonly')
    const row = (await idbReq(tx.objectStore(STORE).get(tagId))) as StarredTagRecord | undefined
    await idbTx(tx)
    return row
  } finally {
    db.close()
  }
}

/** Whether a tag id exists in the favorites store. */
export async function isStarred(tagId: number): Promise<boolean> {
  return !!(await getStarred(tagId))
}

/** Upsert a favorite record (clones via {@link cloneStarredRecord} for IndexedDB safety). */
export async function putStarred(record: StarredTagRecord): Promise<void> {
  const plain = cloneStarredRecord(record)
  const db = await openDb()
  try {
    const tx = db.transaction(STORE, 'readwrite')
    await idbReq(tx.objectStore(STORE).put(plain))
    await idbTx(tx)
  } finally {
    db.close()
  }
}

/** Remove a tag from favorites. */
export async function removeStarred(tagId: number): Promise<void> {
  const db = await openDb()
  try {
    const tx = db.transaction(STORE, 'readwrite')
    await idbReq(tx.objectStore(STORE).delete(tagId))
    await idbTx(tx)
  } finally {
    db.close()
  }
}

async function fetchBlob(path: string): Promise<{ path: string; mime: string; data: ArrayBuffer } | null> {
  try {
    const res = await fetch(sampleUrl(path))
    if (!res.ok) return null
    const data = await res.arrayBuffer()
    const mime = res.headers.get('content-type') || 'application/octet-stream'
    return { path, mime, data }
  } catch {
    return null
  }
}

function report(
  onProgress: StarOptions['onProgress'],
  label: string,
  done: number,
  total: number,
): void {
  onProgress?.({
    label,
    done,
    total,
    ratio: total <= 0 ? 1 : done / total,
  })
}

/** Plain copy safe for IndexedDB (strips reactive proxies and non-cloneables). */
export function cloneStarredRecord(record: StarredTagRecord): StarredTagRecord {
  return {
    tagId: record.tagId,
    starredAt: record.starredAt,
    summary: JSON.parse(JSON.stringify(record.summary)) as TagSummary,
    detail: record.detail
      ? (JSON.parse(JSON.stringify(record.detail)) as TagDetail)
      : null,
    sheetBlobs: record.sheetBlobs?.map((b) => ({
      path: b.path,
      mime: b.mime,
      data: b.data,
    })),
    audioBlobs: record.audioBlobs
      ? Object.fromEntries(
          Object.entries(record.audioBlobs).map(([part, b]) => [
            part,
            {
              path: b.path,
              mime: b.mime,
              data: b.data,
              ...(b.quality != null ? { quality: b.quality } : {}),
            },
          ]),
        )
      : undefined,
    offlineMedia: record.offlineMedia,
    mediaCacheKey: record.mediaCacheKey ?? null,
    quotaWarning: record.quotaWarning ?? null,
  }
}

/**
 * Favorite a tag; optionally download sheet/audio blobs for offline playback.
 *
 * On quota failure, saves metadata-only with {@link StarredTagRecord.quotaWarning}.
 */
export async function starTag(
  summary: TagSummary,
  detail: TagDetail | null,
  options: StarOptions = {},
): Promise<StarredTagRecord> {
  const { metadataOnly = false, skipSheets = false, audioQuality = 'standard', onProgress } = options
  const record: StarredTagRecord = {
    tagId: summary.id,
    starredAt: new Date().toISOString(),
    summary,
    detail,
    offlineMedia: false,
    quotaWarning: null,
  }

  if (detail && !metadataOnly) {
    const sheetPaths = skipSheets ? [] : sheetDisplayPages(detail)
    const audioEntries = listAudioParts(detail)
      .map((part) => {
        const path = storageAudioPath(detail, part, audioQuality)
        return path ? ([part, path] as [PartId, string]) : null
      })
      .filter((e): e is [PartId, string] => e != null)
    const total = sheetPaths.length + audioEntries.length
    let done = 0
    report(onProgress, 'Caching media…', done, Math.max(total, 1))

    try {
      if (typeof navigator !== 'undefined' && navigator.storage?.persist) {
        try {
          await navigator.storage.persist()
        } catch {
          /* ignore */
        }
      }

      const sheets: StarredTagRecord['sheetBlobs'] = []
      for (const p of sheetPaths) {
        const b = await fetchBlob(p)
        if (b) sheets.push(b)
        done++
        report(onProgress, `Sheet ${done}/${total}`, done, Math.max(total, 1))
      }
      if (sheets.length) record.sheetBlobs = sheets

      const audio: NonNullable<StarredTagRecord['audioBlobs']> = {}
      for (const [part, path] of audioEntries) {
        const b = await fetchAudioForStorage(path, audioQuality, (label) => {
          report(onProgress, `${part}: ${label}`, done, Math.max(total, 1))
        })
        if (b) audio[part] = { path: b.path, mime: b.mime, data: b.data, quality: audioQuality }
        done++
        report(onProgress, `Audio ${part}`, done, Math.max(total, 1))
      }
      if (Object.keys(audio).length) {
        record.audioBlobs = audio
      }
      // offlineMedia: audio cached, or sheets cached when we fetched them
      record.offlineMedia = !!(
        Object.keys(audio).length ||
        sheets.length ||
        (skipSheets && (detail.sheet_pages?.length ?? 0) > 0)
      )
      if (record.offlineMedia) {
        record.mediaCacheKey = mediaCacheKey(detail)
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === 'QuotaExceededError') {
        record.quotaWarning = 'Storage full — starred metadata only (no offline media).'
      } else {
        record.quotaWarning = e instanceof Error ? e.message : String(e)
      }
    }
  } else {
    report(onProgress, 'Saving metadata…', 1, 1)
  }

  try {
    await putStarred(record)
  } catch (e) {
    const slim: StarredTagRecord = {
      tagId: summary.id,
      starredAt: record.starredAt,
      summary,
      detail,
      offlineMedia: false,
      quotaWarning: 'Storage full — saved metadata only.',
    }
    await putStarred(slim)
    return cloneStarredRecord(slim)
  }
  return cloneStarredRecord(record)
}

/**
 * Re-fetch sheet/audio blobs for an existing favorite (online refresh).
 *
 * Preserves the original {@link StarredTagRecord.starredAt} timestamp.
 */
export async function refreshStarMedia(
  existing: StarredTagRecord,
  detail: TagDetail,
  options: StarOptions = {},
): Promise<StarredTagRecord> {
  const rec = await starTag(existing.summary, detail, {
    ...options,
    metadataOnly: false,
  })
  return {
    ...rec,
    starredAt: existing.starredAt,
  }
}

/**
 * Replace one cached audio part on a favorite (e.g. upgrade compressed → original).
 *
 * @returns Updated record, or `undefined` when the tag is not favorited.
 */
export async function upgradeStarredAudioPart(
  tagId: number,
  part: string,
  blob: { path: string; mime: string; data: ArrayBuffer; quality?: AudioEncodeQuality },
): Promise<StarredTagRecord | undefined> {
  const existing = await getStarred(tagId)
  if (!existing) return undefined
  const next: StarredTagRecord = {
    ...existing,
    audioBlobs: {
      ...(existing.audioBlobs ?? {}),
      [part]: blob,
    },
    offlineMedia: true,
    mediaCacheKey: existing.detail ? mediaCacheKey(existing.detail) : existing.mediaCacheKey,
  }
  await putStarred(next)
  return next
}

/** Serialize favorite records to a portable metadata file (no blobs). */
export function toStarredFile(records: StarredTagRecord[]): StarredTagsFile {
  return {
    version: 1,
    kind: 'singtags.starred',
    exportedAt: new Date().toISOString(),
    tags: records.map((r) => ({
      starredAt: r.starredAt,
      summary: r.summary,
      detail: r.detail,
    })),
  }
}

/** Parse and validate a `starred.tags.json` / favorites export file. */
export function parseStarredFile(raw: unknown): StarredTagsFile {
  if (!raw || typeof raw !== 'object') throw new Error('Invalid starred.tags file')
  const obj = raw as Partial<StarredTagsFile>
  if (obj.kind !== 'singtags.starred' || obj.version !== 1 || !Array.isArray(obj.tags)) {
    throw new Error('Not a SingTags starred.tags v1 file')
  }
  return obj as StarredTagsFile
}

/**
 * Merge imported favorites metadata into IndexedDB.
 *
 * Does not restore media blobs — existing blobs on matching tag ids are preserved.
 *
 * @returns Number of tags written.
 */
export async function importStarredFile(file: StarredTagsFile): Promise<number> {
  let n = 0
  for (const t of file.tags) {
    if (!t.summary?.id) continue
    const existing = await getStarred(t.summary.id)
    await putStarred({
      tagId: t.summary.id,
      starredAt: t.starredAt || existing?.starredAt || new Date().toISOString(),
      summary: t.summary,
      detail: t.detail ?? existing?.detail ?? null,
      sheetBlobs: existing?.sheetBlobs,
      audioBlobs: existing?.audioBlobs,
      offlineMedia: existing?.offlineMedia ?? false,
      quotaWarning: existing?.quotaWarning ?? null,
    })
    n += 1
  }
  return n
}

/** Delete every favorite (used by "clear offline data"). */
export async function clearAllStarred(): Promise<void> {
  const db = await openDb()
  try {
    const tx = db.transaction(STORE, 'readwrite')
    await idbReq(tx.objectStore(STORE).clear())
    await idbTx(tx)
  } finally {
    db.close()
  }
}

/**
 * Create a temporary `blob:` URL from a cached sheet/audio entry.
 *
 * Caller must revoke the URL when done (see {@link useObjectUrls}).
 */
export function blobUrlFromCached(
  entry: { mime: string; data: ArrayBuffer } | undefined,
): string | null {
  if (!entry) return null
  return URL.createObjectURL(new Blob([entry.data], { type: entry.mime }))
}
