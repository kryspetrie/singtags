/**
 * Browse list position in the URL (beyond search top).
 * `at` = tag id under the sticky chrome — coarse, shareable, layout-stable.
 */

export const BROWSE_SCROLL_KEYS = ['at'] as const

/** Older list-position keys — still cleared on write, never written. */
const LEGACY_SCROLL_KEYS = ['sec', 'scroll', 'sy'] as const

export type BrowseScrollUrl = {
  /** Tag id under sticky chrome when scrolled into the list. */
  at: number | null
}

/** At or near document top — treat as search chrome (no scroll URL). */
export const BROWSE_SEARCH_TOP_EPS = 24

function asOne(v: unknown): string {
  if (typeof v === 'string') return v
  if (Array.isArray(v) && typeof v[0] === 'string') return v[0]
  return ''
}

function parseAtParam(query: Record<string, unknown>): number | null {
  const raw = asOne(query.at).trim()
  if (!/^\d+$/.test(raw)) return null
  const n = Number(raw)
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null
}

export function parseBrowseScrollQuery(query: Record<string, unknown>): BrowseScrollUrl {
  return { at: parseAtParam(query) }
}

/** Serialize list anchor for the router query (omit when at search top). */
export function browseScrollToQuery(
  tagId: number | null,
  scrollY: number,
): Record<string, string> {
  const y = Math.max(0, Math.round(scrollY || 0))
  if (y <= BROWSE_SEARCH_TOP_EPS) return {}
  if (tagId == null || tagId <= 0) return {}
  return { at: String(tagId) }
}

export function browseScrollQueriesEqual(
  a: Record<string, unknown>,
  b: Record<string, unknown>,
): boolean {
  const pa = parseBrowseScrollQuery(a)
  const pb = parseBrowseScrollQuery(b)
  return pa.at === pb.at
}

/** True when only `at` differs (filter/sort/search unchanged). */
export function onlyBrowseScrollQueryChanged(
  next: Record<string, unknown>,
  prev: Record<string, unknown> | undefined,
  browseKeyEqual: (a: Record<string, unknown>, b: Record<string, unknown>) => boolean,
): boolean {
  if (!prev) return false
  if (!browseKeyEqual(next, prev)) return false
  return !browseScrollQueriesEqual(next, prev)
}

/**
 * Merge scroll params into a query map.
 * Clears `at` (and legacy list-position keys) when the scroll patch is empty (search top).
 */
export function mergeBrowseScrollQuery(
  current: Record<string, unknown>,
  scrollPatch: Record<string, string>,
): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(current)) {
    if ((BROWSE_SCROLL_KEYS as readonly string[]).includes(k)) continue
    if ((LEGACY_SCROLL_KEYS as readonly string[]).includes(k)) continue
    const s = asOne(v).trim()
    if (s) out[k] = s
  }
  for (const [k, v] of Object.entries(scrollPatch)) {
    if (v) out[k] = v
  }
  return out
}

/**
 * Browse virtualizer row estimates — must match HomeView `.virt-row` locked
 * heights (title + reserved alt + meta + reserved lyrics + card chrome).
 * Undersized estimates reflow after measureElement and shift scroll restore.
 */
export const BROWSE_SECTION_ROW_H = 56
export const BROWSE_TAG_ROW_H = 128

/**
 * Approximate window.scrollY so browse row `rowIndex` sits under sticky chrome.
 * Coarse (estimateSize), used to pre-position before the list is revealed.
 */
export function estimateBrowseScrollY(opts: {
  rows: ReadonlyArray<{ type: string }>
  rowIndex: number
  listScrollMargin: number
  stickyPad: number
  sectionH?: number
  tagH?: number
}): number {
  const sectionH = opts.sectionH ?? BROWSE_SECTION_ROW_H
  const tagH = opts.tagH ?? BROWSE_TAG_ROW_H
  const idx = Math.max(0, Math.min(opts.rowIndex, opts.rows.length))
  let offset = 0
  for (let i = 0; i < idx; i++) {
    offset += opts.rows[i]?.type === 'section' ? sectionH : tagH
  }
  return Math.max(0, Math.round(opts.listScrollMargin + offset - opts.stickyPad))
}
