/**
 * Correlate scanned repertoires with selectable criteria and text modes.
 *
 * Any combination of two or more singers who share a song (by title/AKA and
 * optional criteria) becomes a result. Display uses one singer’s row as the
 * canonical title (preferring the richest metadata).
 *
 * Incomplete part coverage is still useful — singers who know the song can
 * often sight-read missing parts — so results stay in the list by default and
 * sort by how many parts are already covered.
 */
import {
  fieldMatch,
  normalizeForFuzzy,
  similarity,
  textsMatch,
  voicingsMatch,
  type TextMatchMode,
} from './normalize'
import {
  partsForVoicing,
  songTitleVariants,
  type Confidence,
  type RepertoireProfile,
  type RepertoireSong,
  type Voicing,
} from './types'

export type MatchSort =
  | 'parts-people'
  | 'people-parts'
  | 'parts-title'
  | 'people-title'
  | 'title'

/** Which fields must agree for two song rows to be the same piece. */
export type MatchCriteria = {
  /** Always required for a match; empty title never matches. */
  title: true
  /** When true, arranger must match (blank arranger = wildcard). */
  arranger: boolean
  /** When true, voicing must match (blank/unspecified = wildcard). */
  voicing: boolean
  /**
   * When true, known-part sets must share ≥1 part if both sides list parts;
   * empty part map = wildcard.
   */
  parts: boolean
}

export const DEFAULT_MATCH_CRITERIA: MatchCriteria = {
  title: true,
  /** Off by default so title-only stubs match without optional-field noise. */
  arranger: false,
  voicing: false,
  parts: false,
}

/** Default: parts covered first (sight-read gaps are OK), then how many know it. */
export const DEFAULT_MATCH_SORT: MatchSort = 'parts-people'

/** Min parts covered filter: 0 = show all shared songs. */
export type MinPartsFilter = 0 | 1 | 2 | 3 | 4

export const DEFAULT_MIN_PARTS_FILTER: MinPartsFilter = 0

export type MatchOptions = {
  criteria?: Partial<MatchCriteria>
  /** String compare mode for title / arranger. Default fuzzy. */
  textMode?: TextMatchMode
  requireCoverable?: boolean
}

export type PersonPart = {
  personId: string
  displayName: string
  confidence: Confidence
}

export type MatchSinger = {
  id: string
  displayName: string
}

export type MatchedSong = {
  matchKey: string
  title: string
  /** Canonical alternate titles (for display / shared AKA context). */
  altTitles?: string[]
  arranger: string
  voicing: Voicing
  key?: string
  coverable: boolean
  /** How many voicing parts have ≥1 singer assigned. */
  partsCovered: number
  /** Parts required by the voicing (usually 4). */
  partsRequired: number
  coverage: Record<string, PersonPart[]>
  /** Singers who share this song (any combination of the roster). */
  singers: MatchSinger[]
  groupConfidence: number
  minPartConfidence: number
  peopleCount: number
  textMode: TextMatchMode
}

export type RosterPerson = {
  id: string
  profile: RepertoireProfile
}

function bestConfidence(parts: Record<string, Confidence>): number {
  let best = 0
  for (const c of Object.values(parts)) {
    const v = c === 0 ? 0.5 : c
    if (v > best) best = v
  }
  return best
}

function displayConfidence(c: Confidence): number {
  return c === 0 ? 0.5 : c
}

function resolveCriteria(partial?: Partial<MatchCriteria>): MatchCriteria {
  return {
    title: true,
    arranger: partial?.arranger ?? DEFAULT_MATCH_CRITERIA.arranger,
    voicing: partial?.voicing ?? DEFAULT_MATCH_CRITERIA.voicing,
    parts: partial?.parts ?? DEFAULT_MATCH_CRITERIA.parts,
  }
}

function partsCompatible(
  a: Record<string, Confidence>,
  b: Record<string, Confidence>,
  requireParts: boolean,
): boolean {
  if (!requireParts) return true
  const ak = Object.keys(a)
  const bk = Object.keys(b)
  if (!ak.length || !bk.length) return true
  return ak.some((p) => Object.prototype.hasOwnProperty.call(b, p))
}

function effectiveVoicing(song: RepertoireSong): Voicing {
  return song.voicing ?? 'TTBB'
}

function personLabel(p: RosterPerson): string {
  return p.profile.displayName.trim() || 'Singer'
}

function songRichness(song: RepertoireSong): number {
  return (
    (song.title?.trim().length ?? 0) +
    (song.altTitles?.join('').length ?? 0) +
    (song.arranger?.trim().length ?? 0) +
    Object.keys(song.parts).length * 3
  )
}

/** Score a candidate peer song against a host song (higher = better; -1 = no match). */
export function songMatchScore(
  host: RepertoireSong,
  peer: RepertoireSong,
  criteria: MatchCriteria,
  textMode: TextMatchMode,
): number {
  const hostTitles = songTitleVariants(host)
  const peerTitles = songTitleVariants(peer)
  if (!hostTitles.length || !peerTitles.length) return -1

  let bestTitleSim = -1
  let matched = false
  for (const ht of hostTitles) {
    for (const pt of peerTitles) {
      if (!textsMatch(ht, pt, textMode)) continue
      matched = true
      bestTitleSim = Math.max(
        bestTitleSim,
        similarity(normalizeForFuzzy(ht), normalizeForFuzzy(pt)),
      )
    }
  }
  if (!matched) return -1

  if (criteria.arranger) {
    if (!fieldMatch(host.arranger ?? '', peer.arranger ?? '', textMode, true)) return -1
  }
  if (criteria.voicing) {
    if (!voicingsMatch(host.voicing, peer.voicing, true)) return -1
  }
  if (!partsCompatible(host.parts, peer.parts, criteria.parts)) return -1

  let score = Math.max(0, bestTitleSim) * 100
  if (criteria.arranger && host.arranger?.trim() && peer.arranger?.trim()) {
    score +=
      similarity(normalizeForFuzzy(host.arranger), normalizeForFuzzy(peer.arranger)) * 10
  }
  if (
    criteria.voicing &&
    host.voicing &&
    peer.voicing &&
    host.voicing === peer.voicing
  ) {
    score += 5
  }
  return score
}

export function songsMatch(
  host: RepertoireSong,
  peer: RepertoireSong,
  criteria: MatchCriteria,
  textMode: TextMatchMode,
): boolean {
  return songMatchScore(host, peer, criteria, textMode) >= 0
}

function findBestPeerSong(
  hostSong: RepertoireSong,
  peerSongs: RepertoireSong[],
  criteria: MatchCriteria,
  textMode: TextMatchMode,
): RepertoireSong | null {
  let best: RepertoireSong | null = null
  let bestScore = -1
  for (const song of peerSongs) {
    const score = songMatchScore(hostSong, song, criteria, textMode)
    if (score > bestScore) {
      bestScore = score
      best = song
    }
  }
  return best
}

type Knower = {
  personId: string
  displayName: string
  parts: Record<string, Confidence>
  song: RepertoireSong
}

function buildMatchedSong(
  knowers: Knower[],
  textMode: TextMatchMode,
  requireCoverable: boolean | undefined,
): MatchedSong | null {
  if (knowers.length < 2) return null
  const canonical = knowers.reduce((best, k) =>
    songRichness(k.song) > songRichness(best.song) ? k : best,
  )
  const seed = canonical.song
  const voicing = effectiveVoicing(seed)
  const required = partsForVoicing(voicing)
  const coverage: Record<string, PersonPart[]> = {}
  for (const part of required) {
    coverage[part] = []
    for (const knower of knowers) {
      if (Object.prototype.hasOwnProperty.call(knower.parts, part)) {
        coverage[part]!.push({
          personId: knower.personId,
          displayName: knower.displayName,
          confidence: knower.parts[part]!,
        })
      }
    }
  }

  const partsCovered = required.filter((p) => (coverage[p]?.length ?? 0) > 0).length
  const partsRequired = required.length
  const coverable = partsCovered === partsRequired && partsRequired > 0
  if (requireCoverable && !coverable) return null

  const personBests = knowers.map((k) => bestConfidence(k.parts))
  const groupConfidence =
    personBests.length > 0 ? personBests.reduce((a, b) => a + b, 0) / personBests.length : 0

  let minPartConfidence = 0
  if (coverable) {
    minPartConfidence = 5
    for (const part of required) {
      const best = Math.max(...coverage[part]!.map((p) => displayConfidence(p.confidence)))
      if (best < minPartConfidence) minPartConfidence = best
    }
  }

  const key =
    seed.key || knowers.map((k) => k.song.key).find((k) => k && k.trim()) || undefined

  const singers = knowers.map((k) => ({ id: k.personId, displayName: k.displayName }))
  const personKey = singers
    .map((s) => s.id)
    .sort()
    .join('|')
  const titleKey =
    songTitleVariants(seed)
      .map((t) => normalizeForFuzzy(t))
      .filter(Boolean)
      .sort()[0] || normalizeForFuzzy(seed.title)

  return {
    matchKey: `${personKey}::${titleKey}`,
    title: seed.title.trim(),
    altTitles: seed.altTitles,
    arranger: seed.arranger.trim(),
    voicing,
    key,
    coverable,
    partsCovered,
    partsRequired,
    coverage,
    singers,
    groupConfidence,
    minPartConfidence,
    peopleCount: knowers.length,
    textMode,
  }
}

/**
 * Build matched song list for any combination of ≥2 singers who share a song.
 */
export function matchRepertoires(
  people: RosterPerson[],
  opts?: MatchOptions,
): MatchedSong[] {
  if (people.length < 2) return []

  const criteria = resolveCriteria(opts?.criteria)
  const textMode: TextMatchMode = opts?.textMode ?? 'fuzzy'
  const byKey = new Map<string, MatchedSong>()

  for (const seedPerson of people) {
    for (const seedSong of seedPerson.profile.songs) {
      if (!seedSong.title.trim() && !(seedSong.altTitles?.length)) continue

      const knowers: Knower[] = []
      for (const person of people) {
        if (person.id === seedPerson.id) {
          knowers.push({
            personId: person.id,
            displayName: personLabel(person),
            parts: { ...seedSong.parts },
            song: seedSong,
          })
          continue
        }
        const match = findBestPeerSong(seedSong, person.profile.songs, criteria, textMode)
        if (!match) continue
        knowers.push({
          personId: person.id,
          displayName: personLabel(person),
          parts: { ...match.parts },
          song: match,
        })
      }

      const built = buildMatchedSong(knowers, textMode, opts?.requireCoverable)
      if (!built) continue
      const prev = byKey.get(built.matchKey)
      if (
        !prev ||
        built.peopleCount > prev.peopleCount ||
        (built.peopleCount === prev.peopleCount && built.partsCovered > prev.partsCovered)
      ) {
        byKey.set(built.matchKey, built)
      }
    }
  }

  return [...byKey.values()]
}

/** Short status for badges, e.g. "4 parts covered" or "3 of 4 parts · 2 know". */
export function matchCoverageLabel(song: MatchedSong): string {
  const parts =
    song.partsCovered >= song.partsRequired && song.partsRequired > 0
      ? `${song.partsCovered} parts covered`
      : song.partsCovered === 0
        ? 'No parts listed'
        : `${song.partsCovered} of ${song.partsRequired} parts`
  const people =
    song.peopleCount === 1
      ? '1 knows'
      : `${song.peopleCount} know`
  if (song.coverable) return `${parts} · ${people}`
  if (song.partsCovered === 0) return `${parts} · ${people}`
  return `${parts} · ${people}`
}

export function filterMatchedSongs(
  songs: MatchedSong[],
  minParts: MinPartsFilter = DEFAULT_MIN_PARTS_FILTER,
): MatchedSong[] {
  if (minParts <= 0) return songs
  return songs.filter((s) => s.partsCovered >= minParts)
}

export function sortMatchedSongs(songs: MatchedSong[], sort: MatchSort): MatchedSong[] {
  const list = [...songs]
  const byTitle = (a: MatchedSong, b: MatchedSong) =>
    a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }) ||
    a.arranger.localeCompare(b.arranger, undefined, { sensitivity: 'base' })

  const byPartsThenPeople = (a: MatchedSong, b: MatchedSong) => {
    if (b.partsCovered !== a.partsCovered) return b.partsCovered - a.partsCovered
    if (b.peopleCount !== a.peopleCount) return b.peopleCount - a.peopleCount
    if (b.groupConfidence !== a.groupConfidence) return b.groupConfidence - a.groupConfidence
    return byTitle(a, b)
  }

  const byPeopleThenParts = (a: MatchedSong, b: MatchedSong) => {
    if (b.peopleCount !== a.peopleCount) return b.peopleCount - a.peopleCount
    if (b.partsCovered !== a.partsCovered) return b.partsCovered - a.partsCovered
    if (b.groupConfidence !== a.groupConfidence) return b.groupConfidence - a.groupConfidence
    return byTitle(a, b)
  }

  switch (sort) {
    case 'parts-people':
      list.sort(byPartsThenPeople)
      break
    case 'people-parts':
      list.sort(byPeopleThenParts)
      break
    case 'parts-title':
      list.sort((a, b) => {
        if (b.partsCovered !== a.partsCovered) return b.partsCovered - a.partsCovered
        return byTitle(a, b)
      })
      break
    case 'people-title':
      list.sort((a, b) => {
        if (b.peopleCount !== a.peopleCount) return b.peopleCount - a.peopleCount
        return byTitle(a, b)
      })
      break
    case 'title':
      list.sort(byTitle)
      break
  }
  return list
}
