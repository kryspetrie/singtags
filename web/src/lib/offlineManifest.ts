import type { OfflineManifest, OfflineManifestEntry } from '../offline/manifestTypes'
import type { DownloadItem } from '../offline/downloadQueue'
import { mediaUrl, tagDetailUrl } from './mediaUrl'
import {
  normalizeCustomParts,
  partFromMediaPath,
  pathMatchesParts,
  type LibraryAudioPartsMode,
} from './audioParts'
import { isPublishedTierPath } from './audioTiers'
import type { AudioEncodeQuality } from '../types/audio'
import { storageSizeFactor } from '../types/audio'

function mixFirst(path: string): number {
  return partFromMediaPath(path) === 'mix' ? 0 : 1
}

export function filterAudioManifest(
  manifest: OfflineManifest,
  mode: LibraryAudioPartsMode,
  customParts: string[],
): { entries: OfflineManifestEntry[]; totalBytes: number; fileCount: number } {
  const wanted = normalizeCustomParts(customParts)
  const entries: OfflineManifestEntry[] = []
  let totalBytes = 0
  let fileCount = 0

  for (const entry of manifest.entries) {
    const paths = entry.paths
      .filter((p) => pathMatchesParts(p, mode, wanted))
      .slice()
      .sort((a, b) => mixFirst(a) - mixFirst(b))
    if (!paths.length) continue
    const ratio = entry.paths.length ? paths.length / entry.paths.length : 1
    const bytes = Math.round(entry.bytes * ratio)
    entries.push({ ...entry, paths, bytes })
    totalBytes += bytes
    fileCount += paths.length
  }

  return { entries, totalBytes, fileCount }
}

export function flattenManifestEntries(manifest: OfflineManifest): DownloadItem[] {
  const items: DownloadItem[] = []
  for (const e of manifest.entries) {
    const per = e.paths.length ? Math.round(e.bytes / e.paths.length) : 0
    for (const path of e.paths) {
      items.push({ path, url: mediaUrl(path), bytes: per })
    }
    if (e.detailPath) {
      const detailMatch = e.detailPath.match(/(?:^|\/)tags\/(\d+)\/metadata\.json$/)
      const url = detailMatch
        ? tagDetailUrl(detailMatch[1])
        : e.detailPath.startsWith('/')
          ? e.detailPath
          : mediaUrl(e.detailPath)
      items.push({
        path: e.detailPath,
        url,
        bytes: 800,
      })
    }
  }
  return items
}

export function flattenFilteredAudioManifest(
  manifest: OfflineManifest,
  mode: LibraryAudioPartsMode,
  customParts: string[],
): DownloadItem[] {
  const { entries } = filterAudioManifest(manifest, mode, customParts)
  const items: DownloadItem[] = []
  for (const e of entries) {
    const per = e.paths.length ? Math.round(e.bytes / e.paths.length) : 0
    for (const path of e.paths) {
      items.push({ path, url: mediaUrl(path), bytes: per })
    }
  }
  // Download every Mix track before other parts so browsing is useful sooner.
  items.sort((a, b) => mixFirst(a.path) - mixFirst(b.path))
  return items
}

export function estimateAudioDownloadBytes(
  manifest: OfflineManifest | null,
  mode: LibraryAudioPartsMode,
  customParts: string[],
  quality: AudioEncodeQuality,
): number {
  if (!manifest) return 0
  const { entries, totalBytes } = filterAudioManifest(manifest, mode, customParts)
  const paths = entries.flatMap((e) => e.paths)
  if (paths.length && paths.every(isPublishedTierPath)) return totalBytes
  return Math.round(totalBytes * storageSizeFactor(quality))
}
