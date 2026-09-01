/**
 * Browse list sorting, section keys, scrub rails, and shortcut query parsers.
 * Shared by the catalog browse UI and search engine (arranger splitting).
 */

import { foldText } from './normalize'
import type { TagSummary } from '../types/tag'
import { normalizeYear } from '../lib/year'
import {
  collectionBadge,
  collectionInfo,
  collectionLabel,
  collectionNumber,
  collectionNumberBadge,
  collectionSortKey,
  is100DaysCollection,
  isClassicCollection,
  isUserCollectionFilterId,
  parseUserCollectionFilterId,
  userCollectionFilterId,
} from '../lib/collections'

/** Sort modes exposed in the browse UI (classic booklet order removed — obscure). */
export type BrowseSortMode =
  | 'rating'
  | 'title'
  | 'year'
  | 'downloads'
  | 'id'
  | 'collection'

/** Last token of a personal name, ignoring trailing Jr/Sr/III. */
export function arrangerLastName(name: string | null | undefined): string {
  if (!name?.trim()) return ''
  const parts = name
    .trim()
    .replace(/,/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
  if (!parts.length) return ''
  const skip = /^(jr|sr|ii|iii|iv|phd|md|esq)\.?$/i
  while (parts.length > 1 && skip.test(parts[parts.length - 1]!)) parts.pop()
  return parts[parts.length - 1] || parts[0]!
}

/** Display "Last, First …" when possible. */
export function formatArrangerLastFirst(name: string | null | undefined): string {
  if (!name?.trim()) return '—'
  const last = arrangerLastName(name)
  const folded = name.trim()
  if (!last || foldText(folded) === foldText(last)) return folded
  const rest = folded.slice(0, folded.toLowerCase().lastIndexOf(last.toLowerCase())).trim()
  return rest ? `${last}, ${rest}` : last
}


/** Split a tag's arranger credit into individual people for filter facets. */
export function splitArrangerNames(raw: string | null | undefined): string[] {
  if (!raw?.trim()) return []
  let s = raw.trim()

  const arranged = s.match(/\barranged\s+by\s+(.+)$/i)
  if (arranged && /\b(words|music|lyrics)\b/i.test(s)) {
    s = arranged[1]!.trim()
  }
  s = s.replace(/\s*,?\s*lyrics\s+by\b.*$/i, '')
  s = s.replace(/^(?:words\s+and\s+music|music|words)(?:\s+by)?\s*[:\-]?\s*/i, '')
  s = s.replace(/^arranged\s+by\s*[:\-]?\s*/i, '')
  s = s.replace(/\s+/g, ' ').trim()
  if (!s) return []

  // Keep "Bobby Gray, Jr." as one person when splitting on commas.
  const protectedNames = s.replace(
    /,(\s*(?:jr\.|sr\.|jr|sr|ii|iii|iv|phd|md|esq))\b/gi,
    (_m, suf: string) => `«GEN»${suf}`,
  )

  const parts = protectedNames
    .split(/\s*(?:&+|\/|;|\+|\band\b|\bor\b|\band\/or\b)\s*|,\s*/i)
    .map((p) => p.replace(/«GEN»/g, ',').replace(/\s+/g, ' ').trim())
    .filter((p) => p && !/^(et\s+al\.?|anon\.?|unknown|originally)$/i.test(p))

  const out: string[] = []
  const seen = new Set<string>()
  for (const name of parts) {
    const key = foldText(name)
    if (!key || seen.has(key)) continue
    seen.add(key)
    out.push(name)
  }
  return out.length ? out : [s]
}


export function titleSortLetter(title: string | null | undefined): string {
  const f = foldText(title ?? '')
  if (!f) return '#'
  const ch = f[0]!
  if (ch >= 'a' && ch <= 'z') return ch.toUpperCase()
  if (ch >= '0' && ch <= '9') return '0–9'
  return '#'
}

/** Letters offered by browse “View by Title” sections / the Title filter sheet. */
export const TITLE_LETTER_FILTER_OPTIONS: string[] = [
  ...Array.from({ length: 26 }, (_, i) => String.fromCharCode(65 + i)),
  '0–9',
  '#',
]

/**
 * Hybrid year section key: `<1920` (also missing years), decade buckets through
 * the 1990s, then one key per calendar year from 2000 onward.
 */
export function yearSectionKey(year: number | null): string {
  if (year == null || year < 1920) return '<1920'
  if (year < 2000) return `${Math.floor(year / 10) * 10}s`
  return String(year)
}

/** Ruler-tick label for Tag # scrub: 0, 100, 200, … (not range text). */
export function tagIdHundredKey(id: number): string {
  const n = Number.isFinite(id) ? Math.trunc(id) : 0
  const safe = n < 0 ? 0 : n
  return String(Math.floor(safe / 100) * 100)
}

/** Snap a tag id to a tick label at `step` (100 / 50 / 25). */
export function tagIdTickKey(id: number, step: number): string {
  const n = Number.isFinite(id) ? Math.trunc(id) : 0
  const safe = n < 0 ? 0 : n
  const s = step > 0 ? Math.trunc(step) : 100
  return String(Math.floor(safe / s) * s)
}

/**
 * Loupe tick spacing for Tag # scrub from available width.
 * Narrow: 100s · medium: 50s · wide: 25s.
 */
export function tagIdLoupeTickStep(widthPx: number): 25 | 50 | 100 {
  if (widthPx >= 900) return 25
  if (widthPx >= 560) return 50
  return 100
}



/** Section key for a tag under the current browse sort mode. */
export function sectionKeyFor(tag: TagSummary, mode: BrowseSortMode): string {
  switch (mode) {
    case 'title':
      return titleSortLetter(tag.title)
    case 'year':
      return yearSectionKey(normalizeYear(tag.year))
    case 'id':
      return 'All'
    case 'collection': {
      const info = collectionInfo(tag.collection)
      return info?.label ?? 'Other'
    }
    case 'rating':
    case 'downloads':
      return 'All'
    default:
      return 'All'
  }
}

/** Human label for a section header key (mostly passthrough; year keys unchanged). */
export function sectionLabel(key: string, mode: BrowseSortMode): string {
  if (mode === 'year') return key
  if (key === '0–9') return '0–9'
  if (key === '#') return '#'
  return key
}

/** Jump-rail pill label for collection browse keys (catalog label or user collection name). */
export function collectionJumpLabel(
  key: string,
  userCollections: UserCollectionBrowse[],
): string {
  if (isUserCollectionFilterId(key)) {
    const uid = parseUserCollectionFilterId(key)
    if (uid) {
      const col = userCollections.find((c) => c.id === uid)
      if (col) return col.name
    }
    return key
  }
  return sectionLabel(key, 'collection')
}

/** Inclusive year bounds for a browse year-section key, or null if unknown. */
export function yearBoundsForSectionKey(
  key: string,
): { yearMin: number | null; yearMax: number | null } | null {
  if (key === '<1920') return { yearMin: null, yearMax: 1919 }
  const decade = /^(\d{3})0s$/.exec(key)
  if (decade) {
    const start = Number(decade[1] + '0')
    return { yearMin: start, yearMax: start + 9 }
  }
  if (/^\d{4}$/.test(key)) {
    const y = Number(key)
    return { yearMin: y, yearMax: y }
  }
  return null
}

/** Map a collection section label/key back to a filter id (catalog or `user:…`). */
export function collectionIdForSectionKey(
  key: string,
  knownIds: string[],
): string | null {
  if (!key || key === 'Other') return null
  // Custom browse sections use the filter id as the section key.
  if (isUserCollectionFilterId(key)) return key
  for (const id of knownIds) {
    const info = collectionInfo(id)
    if (info?.label === key || id === key) return id
  }
  const folded = key.trim().toLowerCase()
  for (const id of knownIds) {
    if (id.toLowerCase() === folded) return id
  }
  return null
}

/** User playlist shape for collection browse sections / jump keys. */
export type UserCollectionBrowse = {
  id: string
  name: string
  tagIds: number[]
}


/** Modes that show an A–Z / collection jump rail (chip buttons). */
export function hasJumpRail(mode: BrowseSortMode): boolean {
  return mode === 'title' || mode === 'collection'
}

/** Modes that show the density scrub rail (dock magnification). */
export function hasScrubRail(mode: BrowseSortMode): boolean {
  return mode === 'year' || mode === 'id'
}

/** Modes that insert section headers while walking the sorted list. */
export function hasSectionHeaders(mode: BrowseSortMode): boolean {
  return mode === 'title' || mode === 'year' || mode === 'collection'
}

/** Sort tags for browse (optionally reversed); stable tie-breakers per mode. */
export function sortBrowseTags(
  tags: TagSummary[],
  mode: BrowseSortMode,
  reverse = false,
): TagSummary[] {
  const copy = [...tags]
  const cmpStr = (a: string | null | undefined, b: string | null | undefined) =>
    foldText(a ?? '').localeCompare(foldText(b ?? ''), undefined, { sensitivity: 'base' })
  let sorted: TagSummary[]
  switch (mode) {
    case 'title':
      sorted = copy.sort((a, b) => cmpStr(a.title, b.title) || a.id - b.id)
      break
    case 'rating':
      sorted = copy.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0) || cmpStr(a.title, b.title))
      break
    case 'downloads':
      sorted = copy.sort(
        (a, b) => (b.downloads ?? 0) - (a.downloads ?? 0) || cmpStr(a.title, b.title),
      )
      break
    case 'year':
      sorted = copy.sort((a, b) => {
        const ya = normalizeYear(a.year) ?? 0
        const yb = normalizeYear(b.year) ?? 0
        return yb - ya || cmpStr(a.title, b.title) || a.id - b.id
      })
      break
    case 'id':
      sorted = copy.sort((a, b) => a.id - b.id)
      break
    case 'collection':
      sorted = copy.sort((a, b) => {
        const ka = collectionSortKey(a)
        const kb = collectionSortKey(b)
        return ka[0] - kb[0] || ka[1] - kb[1] || ka[2] - kb[2]
      })
      break
    default:
      sorted = copy
  }
  if (reverse) sorted.reverse()
  return sorted
}

/** One virtualized browse row: section header or tag entry with sort index. */
export type BrowseRow =
  | { type: 'section'; key: string; label: string; custom?: boolean }
  | { type: 'tag'; tag: TagSummary; index: number }

/**
 * Collection browse: catalog series (existing order), then custom collections A–Z,
 * then Other last. Tags in a custom collection also keep their catalog section.
 */
function buildCollectionBrowseRows(
  sorted: TagSummary[],
  limit: number,
  userCollections: UserCollectionBrowse[],
  activeUserCollectionFilters?: string[],
): { rows: BrowseRow[]; jumpKeys: string[] } {
  const byId = new Map(sorted.map((t) => [t.id, t]))
  const inResults = new Set(byId.keys())

  const groups = new Map<string, TagSummary[]>()
  const order: string[] = []
  for (const tag of sorted) {
    const key = sectionKeyFor(tag, 'collection')
    if (!groups.has(key)) {
      groups.set(key, [])
      order.push(key)
    }
    groups.get(key)!.push(tag)
  }

  const defaultKeys = order.filter((k) => k !== 'Other')
  const otherTags = groups.get('Other') ?? []
  const activeUser = activeUserCollectionFilters?.filter(isUserCollectionFilterId) ?? []
  const userSecs = [...userCollections]
    .filter((c) => c.tagIds.some((id) => inResults.has(id)))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))

  const activeUserSet = new Set(activeUser)
  const pinnedUserSecs =
    activeUser.length > 0
      ? activeUser
          .map((fid) => userSecs.find((c) => userCollectionFilterId(c.id) === fid))
          .filter((c): c is UserCollectionBrowse => !!c)
      : []
  const restUserSecs =
    activeUser.length > 0
      ? userSecs.filter((c) => !activeUserSet.has(userCollectionFilterId(c.id)))
      : userSecs

  const jumpKeys =
    activeUser.length > 0
      ? [
          ...pinnedUserSecs.map((c) => userCollectionFilterId(c.id)),
          ...defaultKeys,
          ...restUserSecs.map((c) => userCollectionFilterId(c.id)),
          ...(otherTags.length ? ['Other'] : []),
        ]
      : [
          ...defaultKeys,
          ...userSecs.map((c) => userCollectionFilterId(c.id)),
          ...(otherTags.length ? ['Other'] : []),
        ]

  const rows: BrowseRow[] = []
  let shown = 0

  const pushSection = (key: string, label: string, tags: TagSummary[], custom = false) => {
    if (!tags.length || shown >= limit) return
    rows.push({ type: 'section', key, label, custom: custom || undefined })
    for (const tag of tags) {
      if (shown >= limit) break
      const index = sorted.findIndex((t) => t.id === tag.id)
      rows.push({ type: 'tag', tag, index: index >= 0 ? index : shown })
      shown++
    }
  }

  const pushUserSec = (c: UserCollectionBrowse) => {
    const tags = c.tagIds.map((id) => byId.get(id)).filter((t): t is TagSummary => !!t)
    pushSection(userCollectionFilterId(c.id), c.name, tags, true)
  }

  if (activeUser.length > 0) {
    for (const c of pinnedUserSecs) pushUserSec(c)
    for (const key of defaultKeys) {
      pushSection(key, sectionLabel(key, 'collection'), groups.get(key) ?? [])
    }
    for (const c of restUserSecs) pushUserSec(c)
  } else {
    for (const key of defaultKeys) {
      pushSection(key, sectionLabel(key, 'collection'), groups.get(key) ?? [])
    }
    for (const c of userSecs) pushUserSec(c)
  }
  if (otherTags.length) pushSection('Other', 'Other', otherTags)

  return { rows, jumpKeys }
}

/** Build sectioned rows for the visible window of sorted tags. */
export function buildBrowseRows(
  sorted: TagSummary[],
  mode: BrowseSortMode,
  limit: number,
  options?: {
    userCollections?: UserCollectionBrowse[]
    /** When set, pinned user-collection sections render first (filtered group stays in view). */
    activeUserCollectionFilters?: string[]
    /** One collection chip/section filter — flat tag list, no section headers. */
    singleCollectionFilter?: string
  },
): { rows: BrowseRow[]; jumpKeys: string[] } {
  if (mode === 'collection' && options?.singleCollectionFilter) {
    return {
      rows: sorted.slice(0, limit).map((tag, index) => ({ type: 'tag' as const, tag, index })),
      jumpKeys: [],
    }
  }

  if (mode === 'collection' && (options?.userCollections?.length ?? 0) > 0) {
    return buildCollectionBrowseRows(
      sorted,
      limit,
      options!.userCollections!,
      options?.activeUserCollectionFilters,
    )
  }

  const jumpKeys: string[] = []
  const seen = new Set<string>()
  for (const t of sorted) {
    const k = sectionKeyFor(t, mode)
    if (!seen.has(k)) {
      seen.add(k)
      jumpKeys.push(k)
    }
  }
  if (!hasSectionHeaders(mode)) {
    return {
      rows: sorted.slice(0, limit).map((tag, index) => ({ type: 'tag' as const, tag, index })),
      jumpKeys: [],
    }
  }
  const rows: BrowseRow[] = []
  let last = ''
  let shown = 0
  for (let index = 0; index < sorted.length; index++) {
    if (shown >= limit) break
    const tag = sorted[index]!
    const key = sectionKeyFor(tag, mode)
    if (key !== last) {
      rows.push({ type: 'section', key, label: sectionLabel(key, mode) })
      last = key
    }
    rows.push({ type: 'tag', tag, index })
    shown++
  }
  return { rows, jumpKeys }
}

/** Index of first tag in `sorted` belonging to section key. */
/** Jump-rail index of the first tag in `sorted` with the given section key. */
export function indexOfSection(sorted: TagSummary[], mode: BrowseSortMode, key: string): number {
  return sorted.findIndex((t) => sectionKeyFor(t, mode) === key)
}

/** Parse bare `123` as a tag id when the whole query is just digits. */
export function parseExactTagIdQuery(raw: string): number | null {
  const m = raw.trim().match(/^(\d+)$/)
  if (!m) return null
  const n = Number(m[1])
  return Number.isFinite(n) ? n : null
}

/** `n123`, `N123`, `n:123` → site Tag # (exact; not a bare digit). */
export function parseTagNumberQuery(raw: string): number | null {
  const m = raw.trim().match(/^n\s*:?\s*(\d+)$/i)
  if (!m) return null
  const n = Number(m[1])
  return Number.isFinite(n) ? n : null
}

/** @deprecated Prefer parseTagNumberQuery (`n123`). */
export function parseHashTagIdQuery(raw: string): number | null {
  return parseTagNumberQuery(raw)
}

/** `c99`, `C99`, `classic:99`, `classic 99` → Classic booklet number. */
export function parseClassicNumberQuery(raw: string): number | null {
  const m = raw.trim().match(/^(?:c|classic)\s*:?\s*(\d+)$/i)
  if (!m) return null
  const n = Number(m[1])
  return Number.isFinite(n) ? n : null
}

/** `p12`, `P12`, `100days:12` → 100 Days: 100 Tags booklet number. */
export function parse100DaysNumberQuery(raw: string): number | null {
  const m = raw.trim().match(/^(?:p|100days)\s*:?\s*(\d+)$/i)
  if (!m) return null
  const n = Number(m[1])
  return Number.isFinite(n) ? n : null
}

/** @deprecated Prefer collectionNumberBadge — returns raw classic field digits. */
export function classicLabel(classic: string | number | null | undefined): string | null {
  if (classic == null || classic === '') return null
  const s = String(classic).trim()
  return s || null
}

/** Browse-row / header pill for a tag's collection (booklet # or membership). */
export function bookletBadgeForTag(tag: {
  collection?: string | null
  classic?: string | number | null
}): ReturnType<typeof collectionBadge> {
  return collectionBadge(tag.collection ?? null, tag.classic ?? null)
}

export {
  collectionBadge,
  collectionInfo,
  collectionLabel,
  collectionNumber,
  collectionNumberBadge,
  is100DaysCollection,
  isClassicCollection,
}

/** Group arranger names by last-name initial for filter drilldown. */
export function arrangersByLastInitial(arrangers: string[]): Array<{ letter: string; names: string[] }> {
  const map = new Map<string, string[]>()
  for (const name of arrangers) {
    const last = arrangerLastName(name)
    const letter = titleSortLetter(last || name)
    const list = map.get(letter) ?? []
    list.push(name)
    map.set(letter, list)
  }
  const letters = [...map.keys()].sort((a, b) => a.localeCompare(b))
  return letters.map((letter) => ({
    letter,
    names: (map.get(letter) ?? []).sort((a, b) =>
      foldText(arrangerLastName(a)).localeCompare(foldText(arrangerLastName(b))) ||
      foldText(a).localeCompare(foldText(b)),
    ),
  }))
}
