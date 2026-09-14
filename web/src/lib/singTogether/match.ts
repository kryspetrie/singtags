/**
 * Correlate host + scanned repertoires with selectable criteria and text modes.
 *
 * Host songs are canonical: each host song is kept if every other person has at
 * least one matching song under the current criteria.
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
  type Confidence,
  type RepertoireProfile,
  type RepertoireSong,
  type Voicing,
} from './types'

export type MatchSort =
  | 'coverable-confidence'
  | 'coverable-title'
  | 'intersection-confidence'
  | 'intersection-title'

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
  arranger: true,
  voicing: true,
  parts: false,
}

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

export type MatchedSong = {
  matchKey: string
  title: string
  arranger: string
  voicing: Voicing
  key?: string
  coverable: boolean
  coverage: Record<string, PersonPart[]>
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

/** Score a candidate peer song against a host song (higher = better; -1 = no match). */
export function songMatchScore(
  host: RepertoireSong,
  peer: RepertoireSong,
  criteria: MatchCriteria,
  textMode: TextMatchMode,
): number {
  const hostTitle = host.title.trim()
  const peerTitle = peer.title.trim()
  if (!hostTitle || !peerTitle) return -1
  if (!textsMatch(hostTitle, peerTitle, textMode)) return -1

  if (criteria.arranger) {
    if (!fieldMatch(host.arranger ?? '', peer.arranger ?? '', textMode, true)) return -1
  }
  if (criteria.voicing) {
    if (!voicingsMatch(host.voicing, peer.voicing, true)) return -1
  }
  if (!partsCompatible(host.parts, peer.parts, criteria.parts)) return -1

  let score = similarity(normalizeForFuzzy(hostTitle), normalizeForFuzzy(peerTitle)) * 100
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

/** Build matched song list (host-canonical). Needs ≥1 peer. */
export function matchRepertoires(
  people: RosterPerson[],
  opts?: MatchOptions,
): MatchedSong[] {
  if (people.length === 0) return []

  const criteria = resolveCriteria(opts?.criteria)
  const textMode: TextMatchMode = opts?.textMode ?? 'fuzzy'
  const host = people[0]!
  const peers = people.slice(1)
  if (peers.length === 0) return []

  const out: MatchedSong[] = []
  const hostName = host.profile.displayName.trim() || 'You'

  for (const hostSong of host.profile.songs) {
    if (!hostSong.title.trim()) continue

    const knowers: {
      personId: string
      displayName: string
      parts: Record<string, Confidence>
      song: RepertoireSong
    }[] = [
      {
        personId: host.id,
        displayName: hostName,
        parts: { ...hostSong.parts },
        song: hostSong,
      },
    ]

    let allMatched = true
    for (const peer of peers) {
      const match = findBestPeerSong(hostSong, peer.profile.songs, criteria, textMode)
      if (!match) {
        allMatched = false
        break
      }
      knowers.push({
        personId: peer.id,
        displayName: peer.profile.displayName.trim() || 'Singer',
        parts: { ...match.parts },
        song: match,
      })
    }
    if (!allMatched) continue

    const voicing = effectiveVoicing(hostSong)
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

    const coverable = required.every((p) => (coverage[p]?.length ?? 0) > 0)
    if (opts?.requireCoverable && !coverable) continue

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
      hostSong.key ||
      knowers.map((k) => k.song.key).find((k) => k && k.trim()) ||
      undefined

    out.push({
      matchKey: `${host.id}:${hostSong.id}`,
      title: hostSong.title.trim(),
      arranger: hostSong.arranger.trim(),
      voicing,
      key,
      coverable,
      coverage,
      groupConfidence,
      minPartConfidence,
      peopleCount: knowers.length,
      textMode,
    })
  }

  return out
}

export function sortMatchedSongs(songs: MatchedSong[], sort: MatchSort): MatchedSong[] {
  const list = [...songs]
  const byTitle = (a: MatchedSong, b: MatchedSong) =>
    a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }) ||
    a.arranger.localeCompare(b.arranger, undefined, { sensitivity: 'base' })

  switch (sort) {
    case 'coverable-confidence':
      list.sort((a, b) => {
        if (a.coverable !== b.coverable) return a.coverable ? -1 : 1
        if (b.groupConfidence !== a.groupConfidence) return b.groupConfidence - a.groupConfidence
        if (b.minPartConfidence !== a.minPartConfidence) {
          return b.minPartConfidence - a.minPartConfidence
        }
        return byTitle(a, b)
      })
      break
    case 'coverable-title':
      list.sort((a, b) => {
        if (a.coverable !== b.coverable) return a.coverable ? -1 : 1
        return byTitle(a, b)
      })
      break
    case 'intersection-confidence':
      list.sort((a, b) => {
        if (b.groupConfidence !== a.groupConfidence) return b.groupConfidence - a.groupConfidence
        return byTitle(a, b)
      })
      break
    case 'intersection-title':
      list.sort(byTitle)
      break
  }
  return list
}
