/**
 * Persist Sing Together repertoire in localStorage.
 */
import { emptyProfile, type RepertoireProfile, type RepertoireSong, type Confidence } from './types'
import { isVoicing, clampConfidence, newSongId } from './types'
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
  return {
    id: typeof o.id === 'string' && o.id ? o.id : newSongId(),
    title,
    arranger,
    key: typeof o.key === 'string' && o.key.trim() ? o.key.trim() : undefined,
    voicing,
    parts,
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
  return {
    displayName: typeof o.displayName === 'string' ? o.displayName.trim().slice(0, 64) : '',
    songs,
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
