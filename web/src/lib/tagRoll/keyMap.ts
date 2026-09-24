/**
 * Mid-song key changes (parallel to tempo markers).
 * Project tonality / mode / preferFlats always mirror the marker at tick 0.
 */
import { vexKeySpec, type TonalityMode } from './keySignature'
import type { TagRollKeyMarker } from './types'
import { allocatePrefixedId } from './ids'

export type KeyAtTick = {
  tonality: number
  tonalityMode: TonalityMode
  preferFlats: boolean
}

export function normalizeKeyMarker(raw: unknown): TagRollKeyMarker | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const tick = Math.max(0, Math.round(Number(o.tick) || 0))
  const tonality = ((Math.round(Number(o.tonality) || 0) % 12) + 12) % 12
  const tonalityMode: TonalityMode = o.tonalityMode === 'minor' ? 'minor' : 'major'
  const preferFlats = Boolean(o.preferFlats)
  const id = typeof o.id === 'string' && o.id.trim() ? o.id.trim() : allocatePrefixedId('trk')
  return { id, tick, tonality, tonalityMode, preferFlats }
}

export function createDefaultKeyMarkers(
  tonality: number,
  tonalityMode: TonalityMode = 'major',
  preferFlats = false,
): TagRollKeyMarker[] {
  return [
    {
      id: allocatePrefixedId('trk'),
      tick: 0,
      tonality: ((tonality % 12) + 12) % 12,
      tonalityMode,
      preferFlats: !!preferFlats,
    },
  ]
}

/** Ensure a tick-0 marker exists and mirrors project tonality fields. */
export function ensureKeyMarkers(
  markers: readonly TagRollKeyMarker[] | undefined,
  tonality: number,
  tonalityMode: TonalityMode,
  preferFlats: boolean,
): TagRollKeyMarker[] {
  const pc = ((tonality % 12) + 12) % 12
  const mode: TonalityMode = tonalityMode === 'minor' ? 'minor' : 'major'
  const flats = !!preferFlats
  let list = (markers ?? [])
    .map((m) => normalizeKeyMarker(m))
    .filter((m): m is TagRollKeyMarker => !!m)
  const zero = list.find((m) => m.tick === 0)
  if (!zero) {
    list = [
      {
        id: allocatePrefixedId('trk'),
        tick: 0,
        tonality: pc,
        tonalityMode: mode,
        preferFlats: flats,
      },
      ...list,
    ]
  } else {
    list = list.map((m) =>
      m.tick === 0
        ? { ...m, tonality: pc, tonalityMode: mode, preferFlats: flats }
        : m,
    )
  }
  return list.sort((a, b) => a.tick - b.tick || a.id.localeCompare(b.id))
}

/** Last key marker at or before tick (like tempo). */
export function keyAtTick(
  tick: number,
  markers: readonly TagRollKeyMarker[] | undefined,
  fallback: KeyAtTick,
): KeyAtTick {
  const t = Math.max(0, tick)
  const list = [...(markers ?? [])].sort((a, b) => a.tick - b.tick)
  let hit: TagRollKeyMarker | null = null
  for (const m of list) {
    if (m.tick <= t) hit = m
    else break
  }
  if (!hit) return { ...fallback }
  return {
    tonality: hit.tonality,
    tonalityMode: hit.tonalityMode,
    preferFlats: hit.preferFlats,
  }
}

export function keyMarkerLabel(m: Pick<TagRollKeyMarker, 'tonality' | 'tonalityMode' | 'preferFlats'>): string {
  return vexKeySpec(m.tonality, m.preferFlats, m.tonalityMode)
}
