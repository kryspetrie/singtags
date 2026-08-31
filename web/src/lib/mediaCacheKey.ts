/**
 * Fingerprint catalog media so favorited offline blobs can be refreshed only when
 * the published tag’s media sync marker or media paths change.
 */
import type { TagDetail } from '../types/tag'

/** Collect sheet + audio paths from tag detail (order-independent). */
export function collectTagMediaPaths(detail: TagDetail): string[] {
  const out = new Set<string>()
  const add = (p: string | null | undefined) => {
    if (p) out.add(p)
  }
  add(detail.sheet)
  add(detail.sheet_preview)
  for (const p of detail.sheets ?? []) add(p)
  for (const p of detail.sheet_pages ?? []) add(p)
  for (const p of Object.values(detail.audio ?? {})) add(p)
  const tiers = detail.audio_tiers
  if (tiers) {
    for (const part of Object.values(tiers)) {
      if (!part) continue
      for (const p of Object.values(part)) add(p)
    }
  }
  return [...out].sort()
}

/**
 * Stable key for the media set a favorite was cached against.
 * Prefers `downloaded_at` (mirror media sync), then `last_updated_remote`, plus paths.
 */
export function mediaCacheKey(detail: TagDetail): string {
  const sync = detail.downloaded_at || detail.last_updated_remote || ''
  return `${sync}\0${collectTagMediaPaths(detail).join('\n')}`
}

/** Whether a favorited record’s offline blobs look older than live catalog detail. */
export function isFavoriteMediaStale(
  record: {
    offlineMedia: boolean
    mediaCacheKey?: string | null
    detail?: TagDetail | null
  },
  live: TagDetail,
): boolean {
  if (!record.offlineMedia) return false
  const liveKey = mediaCacheKey(live)
  if (record.mediaCacheKey) return record.mediaCacheKey !== liveKey
  if (record.detail) return mediaCacheKey(record.detail) !== liveKey
  // Offline media with no fingerprint / detail — refresh once to stamp the key.
  return true
}
