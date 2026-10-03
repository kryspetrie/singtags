/**
 * Browse home URL query: search text, View-by sort, reverse, and filter chips.
 * Used so copy/paste (and reload) restores the same Browse state.
 */

import {
  filtersFromRouteQuery,
  filtersToRouteQuery,
  type CatalogFilters,
} from '../search/filters'
import type { BrowseSortMode } from '../search/browse'

export type BrowseRouteState = {
  q: string
  sort: BrowseSortMode
  rev: boolean
  filters: Partial<CatalogFilters>
}

/** Query keys owned by Browse (others on the location are left alone). */
export const BROWSE_ROUTE_KEYS = [
  'q',
  'sort',
  'rev',
  'ft',
  'sheet',
  'audio',
  'cache',
  'rated',
  'ymin',
  'ymax',
  'arr',
  'type',
  'col',
  'tl',
] as const

export type BrowseRouteKey = (typeof BROWSE_ROUTE_KEYS)[number]

function asOne(v: unknown): string {
  if (typeof v === 'string') return v
  if (Array.isArray(v) && typeof v[0] === 'string') return v[0]
  return ''
}

/** Flatten Vue Router query values to a single string map (Browse keys only). */
export function pickBrowseQuery(
  query: Record<string, unknown>,
): Record<string, string> {
  const out: Record<string, string> = {}
  for (const key of BROWSE_ROUTE_KEYS) {
    const s = asOne(query[key]).trim()
    if (s) out[key] = s
  }
  return out
}

/** True when the URL carries any Browse search / filter / non-default sort state. */
export function browseQueryHasState(query: Record<string, unknown>): boolean {
  return Object.keys(pickBrowseQuery(query)).length > 0
}

/** Search text or filter chips — not View-by / reverse alone. */
export function browseQueryHasFiltersOrSearch(query: Record<string, unknown>): boolean {
  const p = pickBrowseQuery(query)
  return Boolean(
    p.q ||
      p.ft ||
      p.sheet ||
      p.audio ||
      p.cache ||
      p.rated ||
      p.ymin ||
      p.ymax ||
      p.arr ||
      p.type ||
      p.col ||
      p.tl,
  )
}

/**
 * Build the Browse slice of the router query from live store fields.
 * Omits defaults so a clean `/` stays clean.
 */
export function browseStateToQuery(opts: {
  q: string
  sort: BrowseSortMode
  defaultSort: BrowseSortMode
  rev: boolean
  filters: CatalogFilters
}): Record<string, string> {
  const patch: Record<string, string | undefined> = {
    q: opts.q.trim() || undefined,
    sort: opts.sort === opts.defaultSort ? undefined : opts.sort,
    rev: opts.rev ? '1' : undefined,
    ...filtersToRouteQuery(opts.filters),
  }
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(patch)) {
    if (v != null && v !== '') out[k] = v
  }
  return out
}

/** Parse Browse fields from a router query object. */
export function browseQueryToState(
  query: Record<string, unknown>,
  defaultSort: BrowseSortMode,
): BrowseRouteState {
  const picked = pickBrowseQuery(query)
  const sortRaw = picked.sort || defaultSort
  return {
    q: picked.q || '',
    sort: sortRaw as BrowseSortMode,
    rev: picked.rev === '1' || picked.rev === 'true',
    filters: filtersFromRouteQuery(picked),
  }
}

/** Stable compare for whether a router.replace would change Browse params. */
export function browseQueriesEqual(
  a: Record<string, unknown>,
  b: Record<string, unknown>,
): boolean {
  const pa = pickBrowseQuery(a)
  const pb = pickBrowseQuery(b)
  const keys = new Set([...Object.keys(pa), ...Object.keys(pb)])
  for (const k of keys) {
    if ((pa[k] || '') !== (pb[k] || '')) return false
  }
  return true
}

/**
 * Merge a Browse patch into the current location query.
 * Clears omitted Browse keys; preserves unrelated params (e.g. future flags).
 */
export function mergeBrowseQuery(
  current: Record<string, unknown>,
  browsePatch: Record<string, string>,
): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(current)) {
    if ((BROWSE_ROUTE_KEYS as readonly string[]).includes(k)) continue
    const s = asOne(v).trim()
    if (s) out[k] = s
  }
  for (const [k, v] of Object.entries(browsePatch)) {
    if (v) out[k] = v
  }
  return out
}
