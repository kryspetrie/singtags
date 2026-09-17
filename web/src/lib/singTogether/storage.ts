/**
 * Persist Sing Together repertoire in localStorage.
 */
import {
  emptyProfile,
  newCollectionId,
  type RepertoireCollection,
  type RepertoireProfile,
  type RepertoireSong,
  type Confidence,
  type Voicing,
} from './types'
import { isVoicing, clampConfidence, newSongId, normalizeAltTitles } from './types'
import { parseVoicing } from './normalize'

export const REPERTOIRE_STORAGE_KEY = 'singtags.singTogether.repertoire.v1'

function normalizeSong(raw: unknown): RepertoireSong | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const title = typeof o.title === 'string' ? o.title.trim() : ''
  if (!title) return null
  const arranger = typeof o.arranger === 'string' ? o.arranger.trim() : ''
  let voicing: Voicing | undefined
  if (o.voicing == null || o.voicing === '') voicing = undefined
  else if (isVoicing(o.voicing)) voicing = o.voicing
  else voicing = parseVoicing(o.voicing)
  const parts: Record<string, Confidence> = {}
  if (o.parts && typeof o.parts === 'object') {
    for (const [k, v] of Object.entries(o.parts as Record<string, unknown>)) {
      if (!k) continue
      parts[k] = clampConfidence(Number(v))
    }
  }
  const altTitles = normalizeAltTitles(o.altTitles ?? o.aka ?? o.alternateTitles)
  let tagId: number | undefined
  if (typeof o.tagId === 'number' && Number.isFinite(o.tagId) && o.tagId > 0) {
    tagId = Math.floor(o.tagId)
  } else if (typeof o.tagId === 'string' && /^\d+$/.test(o.tagId.trim())) {
    const n = Number(o.tagId.trim())
    if (n > 0) tagId = n
  }
  const localEntryId =
    typeof o.localEntryId === 'string' && o.localEntryId.trim()
      ? o.localEntryId.trim()
      : undefined
  const isTag = o.isTag === true || o.isTag === 1 || o.isTag === '1' || o.isTag === 'true'
  return {
    id: typeof o.id === 'string' && o.id ? o.id : newSongId(),
    title,
    altTitles,
    arranger,
    key: typeof o.key === 'string' && o.key.trim() ? o.key.trim() : undefined,
    voicing,
    parts,
    isTag: isTag || undefined,
    tagId,
    localEntryId,
  }
}

function normalizeCollection(raw: unknown, alive: Set<string>): RepertoireCollection | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const name = typeof o.name === 'string' ? o.name.trim().slice(0, 80) : ''
  if (!name) return null
  const songIds: string[] = []
  const seen = new Set<string>()
  if (Array.isArray(o.songIds)) {
    for (const id of o.songIds) {
      if (typeof id !== 'string' || !id || !alive.has(id) || seen.has(id)) continue
      seen.add(id)
      songIds.push(id)
    }
  }
  const now = new Date().toISOString()
  return {
    id: typeof o.id === 'string' && o.id ? o.id : newCollectionId(),
    name,
    songIds,
    createdAt: typeof o.createdAt === 'string' && o.createdAt ? o.createdAt : now,
    updatedAt: typeof o.updatedAt === 'string' && o.updatedAt ? o.updatedAt : now,
  }
}

export function normalizeProfile(raw: unknown): RepertoireProfile {
  if (!raw || typeof raw !== 'object') return emptyProfile()
  const o = raw as Record<string, unknown>
  const songs: RepertoireSong[] = []
  if (Array.isArray(o.songs)) {
    for (const row of o.songs) {
      const s = normalizeSong(row)
      if (s) songs.push(s)
    }
  }
  const alive = new Set(songs.map((s) => s.id))
  const collections: RepertoireCollection[] = []
  if (Array.isArray(o.collections)) {
    for (const row of o.collections) {
      const c = normalizeCollection(row, alive)
      if (c) collections.push(c)
    }
  }
  return {
    displayName: typeof o.displayName === 'string' ? o.displayName.trim().slice(0, 64) : '',
    songs,
    collections,
    updatedAt: typeof o.updatedAt === 'number' ? o.updatedAt : Date.now(),
  }
}

export function loadStoredProfile(): RepertoireProfile {
  try {
    const raw = localStorage.getItem(REPERTOIRE_STORAGE_KEY)
    if (!raw) return emptyProfile()
    return normalizeProfile(JSON.parse(raw))
  } catch {
    return emptyProfile()
  }
}

export function saveStoredProfile(profile: RepertoireProfile): void {
  try {
    const payload: RepertoireProfile = {
      ...profile,
      updatedAt: Date.now(),
    }
    localStorage.setItem(REPERTOIRE_STORAGE_KEY, JSON.stringify(payload))
  } catch {
    /* ignore quota */
  }
}

/** Once the “open My QR” nudge has been shown, don’t show again until the list is empty. */
export const QR_NUDGE_SEEN_KEY = 'singtags.singTogether.qrNudgeSeen.v2'

export function loadQrNudgeSeen(): boolean {
  try {
    // Drop the pre-reset key so an old sticky bit can’t linger.
    localStorage.removeItem('singtags.singTogether.qrNudgeSeen.v1')
    return localStorage.getItem(QR_NUDGE_SEEN_KEY) === '1'
  } catch {
    return false
  }
}

export function saveQrNudgeSeen(seen: boolean): void {
  try {
    if (seen) localStorage.setItem(QR_NUDGE_SEEN_KEY, '1')
    else localStorage.removeItem(QR_NUDGE_SEEN_KEY)
  } catch {
    /* ignore */
  }
}

