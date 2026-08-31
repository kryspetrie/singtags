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
