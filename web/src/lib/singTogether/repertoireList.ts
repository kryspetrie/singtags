/**
 * Pure filter / sort / search helpers for the Sing Together repertoire list.
 */
import { foldText } from '../../search/normalize'
import type { RepertoireSong } from './types'

export type RepertoireSort = 'custom' | 'title' | 'arranger' | 'parts'
export type ListFilter = 'all' | 'needs-details'

/** Bare title (+ AKAs) only — any arranger/key/voicing/parts means not “title only”. */
export function songNeedsDetails(song: RepertoireSong): boolean {
  return (
    !song.arranger?.trim() &&
    !song.key?.trim() &&
    !song.voicing &&
    Object.keys(song.parts).length === 0
  )
}

export function songMatchesSearch(song: RepertoireSong, rawQuery: string): boolean {
  const q = foldText(rawQuery)
  if (!q) return true
  const tokens = q.split(/\s+/).filter(Boolean)
  if (!tokens.length) return true
  const hay = foldText(
    [song.title, ...(song.altTitles ?? []), song.arranger, song.key ?? ''].join(' '),
  )
  return tokens.every((t) => hay.includes(t))
}

export function sortRepertoireSongs(
  songs: RepertoireSong[],
  mode: RepertoireSort,
): RepertoireSong[] {
  if (mode === 'custom') return songs
  const list = [...songs]
  const titleKey = (s: RepertoireSong) => (s.title || '').trim().toLowerCase()
  const arrKey = (s: RepertoireSong) => (s.arranger || '').trim().toLowerCase()
  if (mode === 'title') {
    return list.sort((a, b) => titleKey(a).localeCompare(titleKey(b)) || a.id.localeCompare(b.id))
  }
  if (mode === 'arranger') {
    return list.sort((a, b) => {
      const aa = arrKey(a)
      const bb = arrKey(b)
      if (!aa && bb) return 1
      if (aa && !bb) return -1
      return aa.localeCompare(bb) || titleKey(a).localeCompare(titleKey(b))
    })
  }
  // parts: most marked first
  return list.sort((a, b) => {
    const ac = Object.keys(a.parts).length
    const bc = Object.keys(b.parts).length
    return bc - ac || titleKey(a).localeCompare(titleKey(b))
  })
}

/** Apply needs-details filter, search, sort, and optional reverse. */
export function filterAndSortRepertoireSongs(
  songs: RepertoireSong[],
  opts: {
    listFilter: ListFilter
    search: string
    sort: RepertoireSort
    reverse: boolean
  },
): RepertoireSong[] {
  let next = songs
  if (opts.listFilter === 'needs-details') next = next.filter(songNeedsDetails)
  const q = opts.search
  if (q.trim()) next = next.filter((s) => songMatchesSearch(s, q))
  next = sortRepertoireSongs(next, opts.sort)
  if (opts.reverse) next = [...next].reverse()
  return next
}

export function repertoireCountLabel(opts: {
  displayedCount: number
  scopedTotal: number
  collectionName: string | null
  searching: boolean
  filtered: boolean
}): string {
  const { displayedCount: n, scopedTotal: total, collectionName: col, searching, filtered } = opts
  if (col) {
    if (searching || filtered) return `${n} of ${total} in “${col}”`
    return `${n} in “${col}”`
  }
  if (searching || filtered) {
    return `${n} of ${total} song${total === 1 ? '' : 's'}`
  }
  return `${n} song${n === 1 ? '' : 's'}`
}

export function sortReverseTip(reverse: boolean): string {
  return reverse
    ? 'Reverse order is on — click for the default direction'
    : 'Reverse view order'
}
