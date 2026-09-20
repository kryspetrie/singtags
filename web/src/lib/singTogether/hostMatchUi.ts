/**
 * Pure host-scan / match-filter UI helpers for Sing Together.
 */
import {
  filterMatchedSongs,
  matchRepertoires,
  sortMatchedSongs,
  type MatchCriteria,
  type MatchSort,
  type MatchedSong,
  type MinPartsFilter,
  type RosterPerson,
} from './match'
import type { TextMatchMode } from './normalize'
import type { RepertoireProfile } from './types'

export const HOST_PERSON_ID = 'host'

export type MatchFilterState = {
  criteria: Pick<MatchCriteria, 'arranger' | 'voicing' | 'parts'>
  textMode: TextMatchMode
  sortMode: MatchSort
  minPartsFilter: MinPartsFilter
}

export function buildHostRoster(
  hostProfile: RepertoireProfile,
  peers: readonly RosterPerson[],
): RosterPerson[] {
  return [{ id: HOST_PERSON_ID, profile: hostProfile }, ...peers]
}

/** Run match + filter + sort for the host UI. */
export function computeHostMatchResults(
  hostProfile: RepertoireProfile,
  peers: readonly RosterPerson[],
  filters: MatchFilterState,
): {
  matchedAll: MatchedSong[]
  matched: MatchedSong[]
  coverableCount: number
  filteredOutCount: number
} {
  const people = buildHostRoster(hostProfile, peers)
  if (people.length < 2) {
    return { matchedAll: [], matched: [], coverableCount: 0, filteredOutCount: 0 }
  }
  const criteria: Partial<MatchCriteria> = {
    arranger: filters.criteria.arranger,
    voicing: filters.criteria.voicing,
    parts: filters.criteria.parts,
  }
  const matchedAll = matchRepertoires(people, {
    criteria,
    textMode: filters.textMode,
  })
  const matched = sortMatchedSongs(
    filterMatchedSongs(matchedAll, filters.minPartsFilter),
    filters.sortMode,
  )
  const coverableCount = matchedAll.filter((m) => m.coverable).length
  return {
    matchedAll,
    matched,
    coverableCount,
    filteredOutCount: matchedAll.length - matched.length,
  }
}

export function scanFingerprint(
  result: { bytes?: Uint8Array | null },
  profile: Pick<RepertoireProfile, 'displayName' | 'songs'>,
): string {
  return (
    (result.bytes ? Array.from(result.bytes.slice(0, 32)).join(',') : '') +
    '|' +
    (profile.displayName || '') +
    '|' +
    profile.songs.length
  )
}

export type UpsertScannedPersonResult = {
  people: RosterPerson[]
  person: RosterPerson
  replaced: boolean
  displayName: string
}

/** Insert or replace a scanned peer by display-name + song-count identity. */
export function upsertScannedPerson(
  people: readonly RosterPerson[],
  profile: RepertoireProfile,
  opts?: { now?: number },
): UpsertScannedPersonResult {
  const name = profile.displayName.trim() || `Singer ${people.length + 1}`
  const existing = people.findIndex(
    (p) =>
      p.profile.displayName.trim().toLowerCase() === name.toLowerCase() &&
      p.profile.songs.length === profile.songs.length,
  )
  const person: RosterPerson = {
    id: existing >= 0 ? people[existing]!.id : `peer-${opts?.now ?? Date.now()}`,
    profile: { ...profile, displayName: name },
  }
  if (existing >= 0) {
    const next = [...people]
    next[existing] = person
    return { people: next, person, replaced: true, displayName: name }
  }
  return {
    people: [...people, person],
    person,
    replaced: false,
    displayName: name,
  }
}

export function removePersonById(
  people: readonly RosterPerson[],
  id: string,
): RosterPerson[] {
  return people.filter((p) => p.id !== id)
}

export function pendingDeleteMessage(
  ids: readonly string[] | null | undefined,
  songs: readonly { id: string; title: string }[],
): string {
  if (!ids?.length) {
    return 'Are you sure you want to remove this song from your repertoire?'
  }
  if (ids.length === 1) {
    const song = songs.find((s) => s.id === ids[0])
    const title = song?.title.trim() || 'this song'
    return `Are you sure you want to remove “${title}” from your repertoire?`
  }
  return `Are you sure you want to remove ${ids.length} songs from your repertoire?`
}

export function csvImportSnackbarMessage(result: {
  added: number
  skipped: number
}): string {
  return result.added
    ? `Imported ${result.added} song${result.added === 1 ? '' : 's'}${
        result.skipped ? ` (${result.skipped} skipped)` : ''
      }`
    : `No songs imported${result.skipped ? ` (${result.skipped} skipped)` : ''}`
}

export function pasteImportSnackbarMessage(result: {
  added: number
  duplicates: number
  skipped: number
}): string | null {
  if (!result.added && !result.duplicates) return null
  const bits: string[] = []
  if (result.added) {
    bits.push(`Added ${result.added} song${result.added === 1 ? '' : 's'}`)
  }
  if (result.duplicates) {
    bits.push(`${result.duplicates} duplicate${result.duplicates === 1 ? '' : 's'} skipped`)
  }
  if (result.skipped) {
    bits.push(`${result.skipped} row${result.skipped === 1 ? '' : 's'} skipped`)
  }
  return bits.join('; ')
}

export function libraryImportSnackbarMessage(result: {
  added: number
  duplicates: number
}): string | null {
  if (!result.added && !result.duplicates) return null
  const bits: string[] = []
  if (result.added) bits.push(`Added ${result.added}`)
  if (result.duplicates) bits.push(`${result.duplicates} already linked`)
  return bits.join(' · ')
}

export function scanCaptureSnackbarMessage(displayName: string, songCount: number): string {
  return `${displayName}: ${songCount} song${songCount === 1 ? '' : 's'}`
}

export function collectionCountsMap(
  collections: readonly { id: string; songIds: readonly string[] }[],
): Record<string, number> {
  const map: Record<string, number> = {}
  for (const c of collections) map[c.id] = c.songIds.length
  return map
}

export function songsInCollection(
  allSongs: readonly { id: string }[],
  songIds: readonly string[] | null | undefined,
): typeof allSongs {
  if (!songIds) return allSongs
  const byId = new Map(allSongs.map((s) => [s.id, s]))
  return songIds.map((id) => byId.get(id)).filter((s): s is (typeof allSongs)[number] => !!s)
}

export function canReorderRepertoire(opts: {
  listFilter: string
  sort: string
  reverse: boolean
  search: string
}): boolean {
  return (
    opts.listFilter === 'all' &&
    opts.sort === 'custom' &&
    !opts.reverse &&
    !opts.search.trim()
  )
}
