import type { TagSummary } from '../types/tag'

/**
 * Catalog collections that publish a booklet / series number in `classic`.
 * (BarbershopTags stores that number in the classic field for every numbered series.)
 */
export type CollectionId = 'classic' | '100' | 'easytags' | string

export interface CollectionInfo {
  /** Raw catalog value (filter chip id). */
  id: string
  /** Human label for UI / filters. */
  label: string
  /**
   * Search shortcut letter for booklet numbers (`c12`, `p7`).
   * Null when the collection has no booklet numbers.
   */
  prefix: string | null
  /** Sort rank for “Collection” browse order (lower first). */
  sortRank: number
}

const KNOWN: Record<string, CollectionInfo> = {
  classic: { id: 'classic', label: 'Classic', prefix: 'c', sortRank: 0 },
  '100': { id: '100', label: '100 Days: 100 Tags', prefix: 'p', sortRank: 1 },
  easytags: { id: 'easytags', label: 'Easy Tags', prefix: null, sortRank: 2 },
}

export function normalizeCollectionId(raw: string | null | undefined): string | null {
  if (raw == null) return null
  const s = String(raw).trim().toLowerCase()
  return s || null
}

export function collectionInfo(raw: string | null | undefined): CollectionInfo | null {
  const id = normalizeCollectionId(raw)
  if (!id) return null
  return (
    KNOWN[id] ?? {
      id,
      label: String(raw).trim(),
      prefix: null,
      sortRank: 50 + id.charCodeAt(0),
    }
  )
}

/** Friendly name for filter chips / detail rows. */
export function collectionLabel(raw: string | null | undefined): string | null {
  const info = collectionInfo(raw)
  return info?.label ?? null
}

/** Booklet / series number stored in the classic field (null if unset). */
export function collectionNumber(
  classic: string | number | null | undefined,
): number | null {
  if (classic == null || classic === '') return null
  const n = Number(classic)
  return Number.isFinite(n) ? n : null
}

export function isClassicCollection(raw: string | null | undefined): boolean {
  return normalizeCollectionId(raw) === 'classic'
}

export function is100DaysCollection(raw: string | null | undefined): boolean {
  return normalizeCollectionId(raw) === '100'
}

export interface CollectionBadge {
  /** e.g. "Classic #12", "100 Days #7", or "Easy Tags" */
  label: string
  /** Chip text in browse rows */
  short: string
  /** CSS modifier */
  kind: 'classic' | 'days100' | 'easytags' | 'other'
  /** Booklet # when the collection publishes one */
  number: number | null
}

/** @deprecated Prefer collectionBadge */
export type CollectionNumberBadge = CollectionBadge

/**
 * Browse / detail pill for a tag's collection.
 * Numbered series show "Classic #N" / "100 Days #N"; Easy Tags (and other
 * known collections without a booklet #) still get a membership pill.
 */
export function collectionBadge(
  collection: string | null | undefined,
  classic: string | number | null | undefined,
): CollectionBadge | null {
  const info = collectionInfo(collection)
  if (!info) return null

  const num = collectionNumber(classic)
  if (info.prefix && num != null) {
    if (info.id === 'classic') {
      return { label: `Classic #${num}`, short: `Classic #${num}`, kind: 'classic', number: num }
    }
    if (info.id === '100') {
      return {
        label: `100 Days #${num}`,
        short: `100 Days #${num}`,
        kind: 'days100',
        number: num,
      }
    }
    return {
      label: `${info.label} #${num}`,
      short: `${info.label} #${num}`,
      kind: 'other',
      number: num,
    }
  }

  // Membership-only pill (e.g. Easy Tags has no series numbers).
  if (info.id === 'easytags') {
    return { label: info.label, short: info.label, kind: 'easytags', number: null }
  }
  // Unknown / unnumbered collection — still show the label if it's a known series.
  if (KNOWN[info.id] && !info.prefix) {
    return { label: info.label, short: info.label, kind: 'other', number: null }
  }
  return null
}

/** @deprecated Prefer collectionBadge */
export function collectionNumberBadge(
  collection: string | null | undefined,
  classic: string | number | null | undefined,
): CollectionBadge | null {
  return collectionBadge(collection, classic)
}

/** Sort key: collection rank, then booklet # (missing last), then tag id. */
export function collectionSortKey(tag: Pick<TagSummary, 'id' | 'collection' | 'classic'>): [
  number,
  number,
  number,
] {
  const info = collectionInfo(tag.collection)
  const rank = info?.sortRank ?? (tag.collection ? 40 : 90)
  const num = collectionNumber(tag.classic)
  return [rank, num == null ? Number.POSITIVE_INFINITY : num, tag.id]
}

/** Tokens to index for booklet shortcuts (exact match only). */
export function collectionSearchTokens(
  collection: string | null | undefined,
  classic: string | number | null | undefined,
): string[] {
  const num = collectionNumber(classic)
  if (num == null) return []
  const info = collectionInfo(collection)
  if (!info?.prefix) return []
  const n = String(num)
  if (info.id === 'classic') {
    return [n, `c${n}`, `classic${n}`]
  }
  if (info.id === '100') {
    return [`p${n}`, `100days${n}`]
  }
  return [`${info.prefix}${n}`]
}

/** Extra free-text tokens so “100 days” finds the collection. */
export function collectionTextTokens(collection: string | null | undefined): string[] {
  const info = collectionInfo(collection)
  if (!info) return []
  if (info.id === '100') return ['100', 'days', '100days', 'p']
  if (info.id === 'classic') return ['classic']
  if (info.id === 'easytags') return ['easytags', 'easy']
  return [info.id]
}

/** Prefix for user-defined collection filter / section ids (vs catalog series). */
export const USER_COLLECTION_FILTER_PREFIX = 'user:'

export function userCollectionFilterId(collectionId: string): string {
  return `${USER_COLLECTION_FILTER_PREFIX}${collectionId}`
}

export function parseUserCollectionFilterId(raw: string | null | undefined): string | null {
  if (raw == null || !raw.startsWith(USER_COLLECTION_FILTER_PREFIX)) return null
  const id = raw.slice(USER_COLLECTION_FILTER_PREFIX.length)
  return id || null
}

export function isUserCollectionFilterId(raw: string | null | undefined): boolean {
  return parseUserCollectionFilterId(raw) != null
}

/** Catalog filter chips / browse options (catalog series + custom playlists). */
export type BrowseCollectionOption = {
  id: string
  label: string
  /** True when this is a user-defined collection (not a barbershoptags series). */
  custom: boolean
}

/** Catalog series by sortRank, then custom collections A–Z. */
export function mergeBrowseCollectionOptions(
  catalogIds: string[],
  userCollections: Array<{ id: string; name: string }>,
): BrowseCollectionOption[] {
  const catalog = [...catalogIds].sort((a, b) => {
    const ia = collectionInfo(a)
    const ib = collectionInfo(b)
    const ra = ia?.sortRank ?? 40
    const rb = ib?.sortRank ?? 40
    if (ra !== rb) return ra - rb
    return (ia?.label ?? a).localeCompare(ib?.label ?? b, undefined, { sensitivity: 'base' })
  })
  const custom = [...userCollections].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
  )
  return [
    ...catalog.map((id) => ({
      id,
      label: collectionLabel(id) || id,
      custom: false as const,
    })),
    ...custom.map((c) => ({
      id: userCollectionFilterId(c.id),
      label: c.name,
      custom: true as const,
    })),
  ]
}

/**
 * Keep tags that match any selected collection filter (catalog id OR user membership).
 * Empty `collectionFilters` → all tags.
 */
export function filterTagsByCollectionOptions(
  tags: TagSummary[],
  collectionFilters: string[],
  userCollections: Array<{ id: string; tagIds: number[] }>,
): TagSummary[] {
  if (!collectionFilters.length) return tags
  const catalogIds = new Set<string>()
  const memberIds = new Set<number>()
  for (const f of collectionFilters) {
    const uid = parseUserCollectionFilterId(f)
    if (uid) {
      const col = userCollections.find((c) => c.id === uid)
      if (col) for (const id of col.tagIds) memberIds.add(id)
    } else {
      const nid = normalizeCollectionId(f)
      if (nid) catalogIds.add(nid)
    }
  }
  return tags.filter((t) => {
    const cid = normalizeCollectionId(t.collection)
    if (cid && catalogIds.has(cid)) return true
    if (memberIds.has(t.id)) return true
    return false
  })
}
