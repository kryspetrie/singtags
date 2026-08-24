/**
 * Resolve media for display: starred IndexedDB → offline pack → network URL.
 */

import { mediaUrl } from '../lib/mediaUrl'
import { blobUrlFromCached, getStarred, type StarredTagRecord } from './starredDb'
import { audioPack, sheetsPack, type PackKind } from './libraryPack'

export type ResolvedMedia =
  | { kind: 'blob'; url: string; source: 'star' | 'pack' }
  | { kind: 'network'; url: string; source: 'network' }

function packForPath(path: string): PackKind {
  // Audio lives under media/; sheets under sheets/
  if (path.startsWith('media/') || /\.(mp4|m4a|mp3|ogg|wav|aac)(\?|$)/i.test(path)) {
    return 'audio'
  }
  return 'sheets'
}

export async function resolvePathUrl(
  path: string,
  opts?: {
    starred?: StarredTagRecord | null
    /** When true, skip network preference and only return blob if cached. */
    offlineOnly?: boolean
  },
): Promise<ResolvedMedia | null> {
  const absolute = mediaUrl(path)

  // 1. Starred blobs
  const starred = opts?.starred
  if (starred) {
    const sheetHit = starred.sheetBlobs?.find((b) => b.path === path)
    if (sheetHit) {
      const url = blobUrlFromCached(sheetHit)
      if (url) return { kind: 'blob', url, source: 'star' }
    }
    for (const entry of Object.values(starred.audioBlobs ?? {})) {
      if (entry.path === path) {
        const url = blobUrlFromCached(entry)
        if (url) return { kind: 'blob', url, source: 'star' }
      }
    }
  }

  // 2. Offline pack (Cache API / OPFS)
  const pack = packForPath(path) === 'audio' ? audioPack : sheetsPack
  const res = await pack.get(absolute)
  if (res) {
    const buf = await res.arrayBuffer()
    const mime = res.headers.get('Content-Type') || 'application/octet-stream'
    const url = URL.createObjectURL(new Blob([buf], { type: mime }))
    return { kind: 'blob', url, source: 'pack' }
  }

  if (opts?.offlineOnly) return null

  // 3. Network
  return { kind: 'network', url: absolute, source: 'network' }
}

/** Resolve many relative paths; caller should track() blob URLs. */
export async function resolvePaths(
  paths: string[],
  opts?: { tagId?: number; offlineOnly?: boolean },
): Promise<Array<{ path: string; resolved: ResolvedMedia | null }>> {
  let starred: StarredTagRecord | undefined
  if (opts?.tagId != null) {
    starred = await getStarred(opts.tagId)
  }
  const out: Array<{ path: string; resolved: ResolvedMedia | null }> = []
  for (const path of paths) {
    out.push({
      path,
      resolved: await resolvePathUrl(path, {
        starred: starred ?? null,
        offlineOnly: opts?.offlineOnly,
      }),
    })
  }
  return out
}

export async function packHasPath(path: string): Promise<boolean> {
  const absolute = mediaUrl(path)
  const pack = packForPath(path) === 'audio' ? audioPack : sheetsPack
  return pack.has(absolute)
}

export async function packHasAnySheets(paths: string[]): Promise<boolean> {
  for (const p of paths) {
    if (await packHasPath(p)) return true
  }
  return false
}
