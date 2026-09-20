/**
 * Resolve open / link targets for a repertoire song (tag page or My Library).
 */
import { foldText } from '../../search/normalize'
import { songTitleVariants, type RepertoireSong } from './types'

export type SongOpenTarget =
  | { kind: 'tag'; tagId: number; label: string; linked: boolean }
  | { kind: 'library'; entryId: string; label: string; linked: boolean }

export type TitleTagHit = { id: number; title: string }
export type TitleLibraryHit = { id: string; title: string }

/** Exact folded title / alt → first catalog tag (for open-when-available). */
export function buildTitleTagIndex(
  tags: Iterable<{ id: number; title?: string | null; altTitle?: string | null }>,
): Map<string, TitleTagHit> {
  const map = new Map<string, TitleTagHit>()
  for (const t of tags) {
    const display = t.title || `Tag ${t.id}`
    for (const raw of [t.title, t.altTitle]) {
      const key = foldText(raw || '')
      if (!key || map.has(key)) continue
      map.set(key, { id: t.id, title: display })
    }
  }
  return map
}

/** Exact folded title → first library entry (for open-when-available). */
export function buildTitleLibraryIndex(
  entries: Iterable<{ id: string; title?: string | null }>,
  enabled: boolean,
): Map<string, TitleLibraryHit> {
  const map = new Map<string, TitleLibraryHit>()
  if (!enabled) return map
  for (const e of entries) {
    const key = foldText(e.title || '')
    if (!key || map.has(key)) continue
    map.set(key, { id: e.id, title: e.title || 'Library song' })
  }
  return map
}

export type SongOpenLookups = {
  tagById: (id: number) => { title?: string | null } | null | undefined
  libraryById: (id: string) => { title?: string | null } | null | undefined
  titleTagIndex: Map<string, TitleTagHit>
  titleLibraryIndex: Map<string, TitleLibraryHit>
}

/** Pure open-target resolution for a repertoire row. */
export function resolveSongOpenTarget(
  song: RepertoireSong,
  lookups: SongOpenLookups,
): SongOpenTarget | null {
  const wantTag = song.isTag === true

  if (wantTag) {
    if (typeof song.tagId === 'number' && song.tagId > 0) {
      const hit = lookups.tagById(song.tagId)
      return {
        kind: 'tag',
        tagId: song.tagId,
        label: hit?.title || `Tag ${song.tagId}`,
        linked: true,
      }
    }
    for (const variant of songTitleVariants(song)) {
      const key = foldText(variant)
      if (!key) continue
      const tag = lookups.titleTagIndex.get(key)
      if (tag) {
        return { kind: 'tag', tagId: tag.id, label: tag.title, linked: false }
      }
    }
    return null
  }

  if (song.localEntryId) {
    const hit = lookups.libraryById(song.localEntryId)
    return {
      kind: 'library',
      entryId: song.localEntryId,
      label: hit?.title || 'Library song',
      linked: true,
    }
  }
  // Explicit tag link still opens even if Tag checkbox is off.
  if (typeof song.tagId === 'number' && song.tagId > 0) {
    const hit = lookups.tagById(song.tagId)
    return {
      kind: 'tag',
      tagId: song.tagId,
      label: hit?.title || `Tag ${song.tagId}`,
      linked: true,
    }
  }
  for (const variant of songTitleVariants(song)) {
    const key = foldText(variant)
    if (!key) continue
    const lib = lookups.titleLibraryIndex.get(key)
    if (lib) {
      return { kind: 'library', entryId: lib.id, label: lib.title, linked: false }
    }
  }
  return null
}

export function songOpenLabel(target: SongOpenTarget | null): string {
  if (!target) return ''
  return target.kind === 'library'
    ? `Open My Library: ${target.label}`
    : `Open tag: ${target.label}`
}

export function songLinkActionLabel(song: Pick<RepertoireSong, 'isTag'>): string {
  return song.isTag ? 'Link tag…' : 'Link library…'
}
