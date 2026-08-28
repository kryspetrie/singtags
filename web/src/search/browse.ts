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

export function titleSortLetter(title: string | null | undefined): string {
  const f = foldText(title ?? '')
  if (!f) return '#'
  const ch = f[0]!
  if (ch >= 'a' && ch <= 'z') return ch.toUpperCase()
  if (ch >= '0' && ch <= '9') return '0–9'
  return '#'
}

export function sectionKeyFor(tag: TagSummary, mode: BrowseSortMode): string {
  switch (mode) {
    case 'title':
      return titleSortLetter(tag.title)
    case 'year': {
      const y = normalizeYear(tag.year)
      return y != null ? String(y) : 'Unknown year'
    }
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

export function sectionLabel(key: string, mode: BrowseSortMode): string {
  if (mode === 'year') return key === 'Unknown year' ? key : key
  if (key === '0–9') return '0–9'
  if (key === '#') return '#'
  return key
}

/** Modes that show an A–Z / year jump rail. */
export function hasJumpRail(mode: BrowseSortMode): boolean {
  return mode === 'title' || mode === 'year' || mode === 'collection'
}

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

export type BrowseRow =
  | { type: 'section'; key: string; label: string }
  | { type: 'tag'; tag: TagSummary }

/** Build sectioned rows for the visible window of sorted tags. */
export function buildBrowseRows(
  sorted: TagSummary[],
  mode: BrowseSortMode,
  limit: number,
): { rows: BrowseRow[]; jumpKeys: string[] } {
  const jumpKeys: string[] = []
  const seen = new Set<string>()
  for (const t of sorted) {
    const k = sectionKeyFor(t, mode)
    if (!seen.has(k)) {
      seen.add(k)
      jumpKeys.push(k)
    }
  }
  if (!hasJumpRail(mode)) {
    return {
      rows: sorted.slice(0, limit).map((tag) => ({ type: 'tag' as const, tag })),
      jumpKeys: [],
    }
  }
  const rows: BrowseRow[] = []
  let last = ''
  let shown = 0
  for (const tag of sorted) {
    if (shown >= limit) break
    const key = sectionKeyFor(tag, mode)
    if (key !== last) {
      rows.push({ type: 'section', key, label: sectionLabel(key, mode) })
      last = key
    }
    rows.push({ type: 'tag', tag })
    shown++
  }
  return { rows, jumpKeys }
}

/** Index of first tag in `sorted` belonging to section key. */
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
