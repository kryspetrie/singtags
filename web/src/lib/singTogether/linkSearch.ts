/**
 * Pure library / tag link-picker search helpers for Sing Together.
 */

export type LibrarySearchEntry = {
  id: string
  title: string
  arranger?: string
  notes?: string
}

export type TagSearchHit = {
  id: number
  title?: string | null
}

export type QuickLinkHit =
  | { kind: 'tag'; id: number; title: string }
  | { kind: 'library'; id: string; title: string; arranger?: string }

const DEFAULT_LIMIT = 12

/** Case-insensitive substring filter over title / arranger / notes. */
export function filterLibraryEntries<T extends LibrarySearchEntry>(
  entries: readonly T[],
  rawQuery: string,
  limit = DEFAULT_LIMIT,
): T[] {
  const q = rawQuery.trim().toLowerCase()
  if (!q) return entries.slice(0, limit)
  return entries
    .filter((e) => {
      const hay = `${e.title}\n${e.arranger ?? ''}\n${e.notes ?? ''}`.toLowerCase()
      return hay.includes(q)
    })
    .slice(0, limit)
}

export function mapTagHitsToQuickLinks(
  hits: readonly TagSearchHit[],
  limit = DEFAULT_LIMIT,
): QuickLinkHit[] {
  return hits.slice(0, limit).map((hit) => ({
    kind: 'tag' as const,
    id: hit.id,
    title: hit.title || `Tag ${hit.id}`,
  }))
}

export function mapLibraryEntriesToQuickLinks(
  entries: readonly LibrarySearchEntry[],
): QuickLinkHit[] {
  return entries.map((e) => ({
    kind: 'library' as const,
    id: e.id,
    title: e.title || 'Untitled',
    arranger: e.arranger || undefined,
  }))
}

/** Build quick-link hits for tag mode or library mode. */
export function buildQuickLinkHits(opts: {
  isTag: boolean
  query: string
  libraryEnabled: boolean
  tagHits: readonly TagSearchHit[]
  libraryEntries: readonly LibrarySearchEntry[]
  limit?: number
}): QuickLinkHit[] {
  const limit = opts.limit ?? DEFAULT_LIMIT
  if (opts.isTag) {
    if (!opts.query.trim()) return []
    return mapTagHitsToQuickLinks(opts.tagHits, limit)
  }
  if (!opts.libraryEnabled) return []
  return mapLibraryEntriesToQuickLinks(
    filterLibraryEntries(opts.libraryEntries, opts.query, limit),
  )
}

/** Collect linked My Library entry ids from repertoire songs. */
export function linkedLibraryEntryIds(
  songs: readonly { localEntryId?: string | null }[],
): string[] {
  return songs
    .map((s) => s.localEntryId?.trim())
    .filter((id): id is string => !!id)
}

export function isLibrarySourceLocked(
  song: { localEntryId?: string | null },
  opts: { libraryEnabled: boolean; entryIds: ReadonlySet<string> | readonly string[] },
): boolean {
  const id = song.localEntryId?.trim()
  if (!id || !opts.libraryEnabled) return false
  const ids = opts.entryIds
  if (Array.isArray(ids)) return (ids as readonly string[]).includes(id)
  return (ids as ReadonlySet<string>).has(id)
}

/** Patch when linking a library entry (optionally copy title/arranger/key). */
export function libraryLinkPatch(
  song: { title: string },
  entry: { title: string; arranger: string; key?: string | null } | null | undefined,
  entryId: string,
): {
  localEntryId: string
  tagId: undefined
  isTag: undefined
  title?: string
  arranger?: string
  key?: string
} {
  if (!entry) {
    return { localEntryId: entryId, tagId: undefined, isTag: undefined }
  }
  return {
    localEntryId: entryId,
    tagId: undefined,
    isTag: undefined,
    title: entry.title.trim() || song.title,
    arranger: entry.arranger.trim(),
    key: entry.key?.trim() || undefined,
  }
}

export function isTagLinkPatch(hitId: number): {
  tagId: number
  localEntryId: undefined
  isTag: true
} {
  return { tagId: hitId, localEntryId: undefined, isTag: true }
}

export function clearLinkPatch(): {
  tagId: undefined
  localEntryId: undefined
} {
  return { tagId: undefined, localEntryId: undefined }
}

export function setIsTagPatch(isTag: boolean): {
  isTag?: true
  localEntryId?: undefined
  tagId?: undefined
} {
  if (isTag) return { isTag: true, localEntryId: undefined }
  return { isTag: undefined, tagId: undefined }
}

/** Typing invalidates a prior pick unless the query still matches the label. */
export function clearLinkIfQueryDiverged(opts: {
  linkLabel: string
  query: string
}): boolean {
  return !!(opts.linkLabel && opts.query.trim() !== opts.linkLabel)
}
