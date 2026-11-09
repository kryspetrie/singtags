/**
 * Sheet page URLs for a tag: favorite blobs first, then the offline pack.
 */
import type { TagDetail } from '../types/tag'
import { sheetDisplayPages } from '../lib/sheetPaths'
import { blobUrlFromCached, type StarredTagRecord } from '../offline/favoritesDb'
import { resolvePathUrl } from '../offline/resolveMedia'

/**
 * Resolve sheet display URLs from favorites / pack blobs when possible.
 * Returns untracked blob URLs — caller must {@link track} (or revoke) them.
 */
export async function collectSheetBlobPages(
  d: TagDetail,
  cached: StarredTagRecord | undefined,
  offlineOnly: boolean,
  signal?: AbortSignal,
): Promise<{ pages: string[] | null; sources: Set<'star' | 'pack' | 'network'> }> {
  const sources = new Set<'star' | 'pack' | 'network'>()
  const sheetPaths = sheetDisplayPages(d)

  if (cached?.sheetBlobs?.length && sheetPaths.length) {
    const pages: string[] = []
    for (let i = 0; i < sheetPaths.length; i++) {
      if (signal?.aborted) {
        for (const u of pages) URL.revokeObjectURL(u)
        return { pages: null, sources }
      }
      const path = sheetPaths[i]!
      const byPath = cached.sheetBlobs.find((b) => b.path === path)
      const entry = byPath ?? cached.sheetBlobs[i]
      if (!entry) break
      const url = blobUrlFromCached(entry)
      if (!url) break
      pages.push(url)
      sources.add('star')
    }
    return {
      pages: pages.length === sheetPaths.length ? pages : null,
      sources,
    }
  }

  if (sheetPaths.length) {
    const pages: string[] = []
    let allBlob = true
    for (const path of sheetPaths) {
      if (signal?.aborted) {
        for (const u of pages) URL.revokeObjectURL(u)
        return { pages: null, sources }
      }
      const resolved = await resolvePathUrl(path, {
        starred: cached ?? null,
        offlineOnly,
      })
      if (!resolved || resolved.kind !== 'blob') {
        allBlob = false
        for (const u of pages) URL.revokeObjectURL(u)
        return { pages: null, sources }
      }
      sources.add(resolved.source === 'reconstruct' ? 'pack' : resolved.source)
      pages.push(resolved.url)
    }
    return { pages: allBlob && pages.length ? pages : null, sources }
  }

  if (cached?.sheetBlobs?.length) {
    const pages: string[] = []
    for (const b of cached.sheetBlobs) {
      if (signal?.aborted) {
        for (const u of pages) URL.revokeObjectURL(u)
        return { pages: null, sources }
      }
      const url = blobUrlFromCached(b)
      if (url) pages.push(url)
    }
    if (pages.length) sources.add('star')
    return { pages: pages.length ? pages : null, sources }
  }

  return { pages: null, sources }
}
