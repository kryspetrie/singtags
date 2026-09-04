/**
 * Offline library pack sync helpers: expected file counts, update detection,
 * and resume cursor when manifest version changes.
 */

import type { OfflineManifest } from '../offline/manifestTypes'
import { filterAudioManifest, flattenManifestEntries } from './offlineManifest'

/** Expected file count for the sheets pack (pages + per-tag detail JSON). */
export function expectedSheetsFileCount(manifest: OfflineManifest | null | undefined): number {
  if (!manifest) return 0
  return flattenManifestEntries(manifest).length
}

/** Expected file count for the full learning-tracks pack. */
export function expectedAudioFileCount(manifest: OfflineManifest | null | undefined): number {
  if (!manifest) return 0
  return filterAudioManifest(manifest, 'all', []).fileCount
}

/** True when the remote manifest lists more files than this device has cached. */
export function packIncomplete(cachedCount: number, expectedCount: number): boolean {
  return expectedCount > 0 && cachedCount < expectedCount
}

/**
 * Normalize IDB pack status after reload / kill.
 * Orphaned `running` or `error`, and false `done` with missing files, become `paused`
 * so Settings can offer Resume and reconnect can continue.
 */
export function normalizePackStatus(
  saved: string | undefined,
  cachedCount: number,
  expectedCount: number,
): 'idle' | 'running' | 'paused' | 'done' | 'error' | 'quota' {
  const incomplete = packIncomplete(cachedCount, expectedCount)
  if (saved === 'running' || saved === 'error') return 'paused'
  if (saved === 'done' && incomplete) return 'paused'
  if (saved === 'paused' || saved === 'quota' || saved === 'done') return saved
  if (incomplete && cachedCount > 0) return 'paused'
  return 'idle'
}

/**
 * True when this device already finished a pack (or has files) but the remote
 * manifest lists more — typically after new tags were published.
 * Mid-download pause/quota/error is not treated as a library update.
 */
export function packSyncAvailable(
  cachedCount: number,
  expectedCount: number,
  status?: string,
): boolean {
  if (status === 'running' || status === 'paused' || status === 'quota' || status === 'error') {
    return false
  }
  return packIncomplete(cachedCount, expectedCount) && cachedCount > 0
}

/** Number of new files available when {@link packSyncAvailable} is true. */
export function packMissingFileCount(
  cachedCount: number,
  expectedCount: number,
  status?: string,
): number {
  if (!packSyncAvailable(cachedCount, expectedCount, status)) return 0
  return expectedCount - cachedCount
}

/**
 * Resume mid-download when paused/quota/running/error on the same manifest version.
 * Otherwise start at 0 so already-cached files are skipped and new ones are filled in.
 */
export function packStartIndex(opts: {
  status: string | undefined
  progressVersion: number | undefined
  manifestVersion: number
  cursor: number | undefined
  itemCount: number
}): number {
  const { status, progressVersion, manifestVersion, cursor = 0, itemCount } = opts
  const resumable =
    status === 'paused' || status === 'quota' || status === 'running' || status === 'error'
  if (!resumable || progressVersion !== manifestVersion) return 0
  return Math.max(0, Math.min(cursor, itemCount))
}
