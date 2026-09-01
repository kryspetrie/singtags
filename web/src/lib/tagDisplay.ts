/**
 * Tag title display helpers (alt title deduplication).
 */

/** Alt title when it adds information beyond the primary title. */
export function visibleAltTitle(
  altTitle: string | null | undefined,
  title: string | null | undefined,
): string | null {
  const alt = altTitle?.trim()
  if (!alt) return null
  const main = title?.trim()
  if (main && alt.localeCompare(main, undefined, { sensitivity: 'accent' }) === 0) return null
  return alt
}

/** Compact download count for list rows (null when zero or missing). */
export function formatDownloads(n: number | null | undefined): string | null {
  if (n == null || n <= 0) return null
  return n.toLocaleString()
}

/** Offline cache badge label from catalog cache-ready index. */
export function cacheReadyLabel(
  tagId: number,
  cacheReadyByTag: ReadonlyMap<number, { sheets: boolean; audio: boolean }>,
): string | null {
  const ready = cacheReadyByTag.get(tagId)
  if (!ready) return null
  if (ready.sheets && ready.audio) return 'Sheets+tracks'
  if (ready.sheets) return 'Sheets'
  if (ready.audio) return 'Tracks'
  return null
}
