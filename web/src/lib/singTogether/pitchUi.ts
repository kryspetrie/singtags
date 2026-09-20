/**
 * Pure session pitch-shift map helpers for Sing Together rows.
 */
import { clampPitchSemitones } from '../../audio/pitchPlayer'
import { keyToTonicNote } from '../../audio/pitchPlayer'

export function songCanPitch(song: { key?: string | null }): boolean {
  return !!keyToTonicNote(song.key)
}

/** Update per-song pitch shift map; 0 removes the entry. */
export function nextSongPitchShiftMap(
  map: Readonly<Record<string, number>>,
  songId: string,
  shift: number,
): Record<string, number> {
  const nextShift = clampPitchSemitones(shift)
  if (!nextShift) {
    if (!(songId in map)) return { ...map }
    const copy = { ...map }
    delete copy[songId]
    return copy
  }
  return { ...map, [songId]: nextShift }
}

export function songShiftFromMap(
  map: Readonly<Record<string, number>>,
  songId: string,
): number {
  return clampPitchSemitones(map[songId] ?? 0)
}

/** Toggle expand set membership; returns next set. */
export function toggleExpandedId(
  expanded: ReadonlySet<string>,
  id: string,
): { next: Set<string>; collapsed: boolean } {
  const next = new Set(expanded)
  if (next.has(id)) {
    next.delete(id)
    return { next, collapsed: true }
  }
  next.add(id)
  return { next, collapsed: false }
}

export function pruneIdsToAlive(
  selected: ReadonlySet<string>,
  aliveIds: readonly string[],
): Set<string> {
  const alive = new Set(aliveIds)
  return new Set([...selected].filter((id) => alive.has(id)))
}
