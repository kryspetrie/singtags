/**
 * Pure link-picker open/close state helpers for Sing Together.
 */

export type LinkPickerKind = 'tag' | 'library'

export type LinkPickerState = {
  songId: string | null
  kind: LinkPickerKind | null
  tagQuery: string
  libraryQuery: string
}

export const emptyLinkPickerState = (): LinkPickerState => ({
  songId: null,
  kind: null,
  tagQuery: '',
  libraryQuery: '',
})

/** Toggle or switch the per-song link picker. */
export function nextLinkPickerOpen(
  current: LinkPickerState,
  song: { id: string; title?: string },
  kind: LinkPickerKind,
): LinkPickerState {
  if (current.songId === song.id && current.kind === kind) {
    return emptyLinkPickerState()
  }
  if (kind === 'tag') {
    return {
      songId: song.id,
      kind,
      tagQuery: song.title || '',
      libraryQuery: current.libraryQuery,
    }
  }
  return {
    songId: song.id,
    kind,
    tagQuery: current.tagQuery,
    libraryQuery: song.title || '',
  }
}

export function preferredLinkPickerKind(
  song: { isTag?: boolean },
  libraryEnabled: boolean,
): LinkPickerKind {
  return song.isTag ? 'tag' : libraryEnabled ? 'library' : 'tag'
}

export type QuickLinkPickState = {
  tagId: number | null
  entryId: string | null
  isTag: boolean
  label: string
  query: string
  highlight: number
}

export function applyQuickLinkPick(
  hit: { kind: 'tag'; id: number; title: string } | { kind: 'library'; id: string; title: string },
): QuickLinkPickState {
  if (hit.kind === 'tag') {
    return {
      tagId: hit.id,
      entryId: null,
      isTag: true,
      label: hit.title,
      query: hit.title,
      highlight: -1,
    }
  }
  return {
    tagId: null,
    entryId: hit.id,
    isTag: false,
    label: hit.title,
    query: hit.title,
    highlight: -1,
  }
}

export function clearQuickLinkPick(): {
  tagId: null
  entryId: null
  label: ''
  highlight: -1
} {
  return {
    tagId: null,
    entryId: null,
    label: '',
    highlight: -1,
  }
}

/** Seed link query from title when no pick yet. */
export function seedLinkQuery(opts: {
  tagId: number | null
  entryId: string | null
  title: string
}): { query: string; highlight: number } | null {
  if (opts.tagId != null || opts.entryId) return null
  const title = opts.title.trim()
  if (!title) return { query: '', highlight: -1 }
  return { query: title, highlight: -1 }
}
