/**
 * Canonical tag-detail ladder for queueing, transfer, and other offline-aware callers.
 *
 * Order: Cache/network fetch → sheets pack → starred IDB → optional transferred IDB.
 * Keep `as TagDetail` casting here (Phase I may add parseTagDetail).
 */
import type { TagDetail } from '../types/tag'
import { tagDetailUrl } from './mediaUrl'
import { fetchCached } from './manualOfflineFetch'
import { sheetsPack } from '../offline/libraryPack'
import { getStarred } from '../offline/favoritesDb'
import { getTransferredTag } from '../offline/transferredDb'

export type LoadTagDetailCachedOpts = {
  /** Include peer-received optical transfer records (default false). */
  includeTransferred?: boolean
}

/**
 * Load tag metadata from the first available offline/online source.
 * Returns null when no ladder step has detail for `id`.
 */
export async function loadTagDetailCached(
  id: number,
  opts: LoadTagDetailCachedOpts = {},
): Promise<TagDetail | null> {
  try {
    const res = await fetchCached(tagDetailUrl(id))
    if (res.ok) return (await res.json()) as TagDetail
  } catch {
    /* try pack / favorites / transferred */
  }
  try {
    const packed = await sheetsPack.get(tagDetailUrl(id))
    if (packed) return (await packed.json()) as TagDetail
  } catch {
    /* try favorites / transferred */
  }
  const starred = await getStarred(id)
  if (starred?.detail) return starred.detail
  if (opts.includeTransferred) {
    const transferred = await getTransferredTag(id)
    return transferred?.detail ?? null
  }
  return null
}
