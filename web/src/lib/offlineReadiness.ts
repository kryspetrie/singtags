import { listStarred } from '../offline/favoritesDb'
import { audioPack, sheetsPack } from '../offline/libraryPack'

export type TagCacheReady = { sheets: boolean; audio: boolean }
export type CachedFilter = 'any' | 'sheets' | 'audio' | 'both' | 'none' | null

/** Extract a tag id from a sheet or media storage path/URL. */
export function tagIdFromMediaPath(pathOrUrl: string): number | null {
  const match = pathOrUrl.match(/(?:^|\/)(?:sheets|media)\/(\d+)(?:\/|$)/)
  if (!match) return null
  const id = Number(match[1])
  return Number.isSafeInteger(id) ? id : null
}

/**
 * Build a per-tag offline-media index from bulk pack URL listings and favorites.
 */
export function buildReadinessFromUrlLists(
  sheetUrls: string[],
  audioUrls: string[],
  starred: Array<{
    tagId: number
    sheetBlobs?: unknown[]
    audioBlobs?: Record<string, unknown>
  }> = [],
): Map<number, TagCacheReady> {
  const ready = new Map<number, TagCacheReady>()
  const entry = (tagId: number): TagCacheReady => {
    let current = ready.get(tagId)
    if (!current) {
      current = { sheets: false, audio: false }
      ready.set(tagId, current)
    }
    return current
  }

  for (const url of sheetUrls) {
    const tagId = tagIdFromMediaPath(url)
    if (tagId != null) entry(tagId).sheets = true
  }
  for (const url of audioUrls) {
    const tagId = tagIdFromMediaPath(url)
    if (tagId != null) entry(tagId).audio = true
  }
  for (const record of starred) {
    const hasSheets = Array.isArray(record.sheetBlobs) && record.sheetBlobs.length > 0
    const hasAudio =
      record.audioBlobs != null &&
      typeof record.audioBlobs === 'object' &&
      Object.keys(record.audioBlobs).length > 0
    if (!hasSheets && !hasAudio) continue
    const current = entry(record.tagId)
    if (hasSheets) current.sheets = true
    if (hasAudio) current.audio = true
  }

  return ready
}

/** Test one tag's cached-media readiness against the catalog filter. */
export function matchesCachedFilter(
  ready: TagCacheReady | undefined,
  filter: CachedFilter,
): boolean {
  if (filter == null) return true
  const sheets = ready?.sheets ?? false
  const audio = ready?.audio ?? false
  if (filter === 'any') return sheets || audio
  if (filter === 'sheets') return sheets
  if (filter === 'audio') return audio
  if (filter === 'both') return sheets && audio
  return !sheets && !audio
}

export type OfflineBrowseMediaFilters = {
  cached: CachedFilter
  hasSheet: boolean | null
  hasAudio: boolean | null
}

/** True when the Available offline chip filter is active. */
export function isOfflineBrowseFilterActive(filters: OfflineBrowseMediaFilters): boolean {
  return filters.cached != null
}

/**
 * When Available offline is active, apply cached + has sheet/audio against device readiness.
 * When inactive, returns true (catalog hasSheet/hasAudio are handled by the search engine).
 */
export function matchesOfflineBrowseFilters(
  ready: TagCacheReady | undefined,
  filters: OfflineBrowseMediaFilters,
): boolean {
  if (!isOfflineBrowseFilterActive(filters)) return true
  if (!matchesCachedFilter(ready, filters.cached)) return false
  if (filters.hasSheet === true && !ready?.sheets) return false
  if (filters.hasAudio === true && !ready?.audio) return false
  return true
}

const CACHED_FILTER_LABELS: Record<Exclude<CachedFilter, null>, string> = {
  any: 'any files',
  sheets: 'sheet files',
  audio: 'audio files',
  both: 'sheet + audio',
  none: 'none',
}

/** Short label for the Available offline chip when a sub-filter is set. */
export function cachedFilterChipLabel(filter: CachedFilter): string {
  if (filter == null) return ''
  return CACHED_FILTER_LABELS[filter]
}

/** Load offline readiness with one bulk listing per pack plus one favorites read. */
export async function loadOfflineReadinessIndex(): Promise<Map<number, TagCacheReady>> {
  const [sheetUrls, audioUrls, starred] = await Promise.all([
    sheetsPack.listUrls(),
    audioPack.listUrls(),
    listStarred(),
  ])
  return buildReadinessFromUrlLists(sheetUrls, audioUrls, starred)
}
