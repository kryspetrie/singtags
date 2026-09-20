/**
 * Pure display / title-field helpers for Sing Together song rows.
 */
import {
  localLibraryKeyLabel,
  LOCAL_LIBRARY_KEY_OPTIONS,
} from '../../types/localLibrary'
import type { MatchedSong } from './match'
import {
  normalizeAltTitles,
  partLabel,
  partsForVoicing,
  type RepertoireSong,
} from './types'
import { songNeedsDetails } from './repertoireList'

export function parseTitleField(raw: string): { title: string; altTitles?: string[] } {
  const chunks = raw
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean)
  if (!chunks.length) return { title: '' }
  const [title, ...rest] = chunks
  return { title: title!, altTitles: normalizeAltTitles(rest) }
}

export function formatTitleField(song: Pick<RepertoireSong, 'title' | 'altTitles'>): string {
  const alts = song.altTitles ?? []
  if (!alts.length) return song.title
  return [song.title, ...alts].join('; ')
}

export function keyOptionsFor(
  currentKey: string | undefined,
  options: readonly string[] = LOCAL_LIBRARY_KEY_OPTIONS,
): string[] {
  const current = currentKey?.trim() ?? ''
  if (current && !options.includes(current)) {
    return [current, ...options]
  }
  return [...options]
}

export function songVoicingLabel(song: Pick<RepertoireSong, 'voicing'>): string {
  return song.voicing || ''
}

export function songKeyLabel(song: Pick<RepertoireSong, 'key'>): string {
  const key = song.key?.trim()
  return key ? localLibraryKeyLabel(key) || key : ''
}

export function songAkaLabel(song: Pick<RepertoireSong, 'altTitles'>): string {
  return song.altTitles?.length ? song.altTitles.join(', ') : ''
}

export function songPartMetaItems(song: RepertoireSong): string[] {
  const ids = Object.keys(song.parts)
  if (!ids.length) {
    return songNeedsDetails(song) ? [] : ['Parts later']
  }
  return ids.map((p) => {
    const conf = song.parts[p] ?? 0
    const label = partLabel(p)
    return conf > 0 ? `${label} ${conf}★` : label
  })
}

export function fmtConf(n: number): string {
  return n.toFixed(1)
}

export function matchSongMetaItems(song: MatchedSong): string[] {
  const bits: string[] = []
  const arranger = song.arranger?.trim()
  if (arranger) bits.push(arranger)
  if (song.voicing) bits.push(song.voicing)
  const key = song.key?.trim()
  if (key) bits.push(key)
  if (song.groupConfidence != null) bits.push(`confidence ${fmtConf(song.groupConfidence)}`)
  return bits
}

export function coverageParts(song: MatchedSong): {
  id: string
  label: string
  count: number
  names: string
}[] {
  return partsForVoicing(song.voicing).map((p) => {
    const people = song.coverage[p] ?? []
    return {
      id: p,
      label: partLabel(p),
      count: people.length,
      names: people.map((x) => x.displayName).join(', '),
    }
  })
}
