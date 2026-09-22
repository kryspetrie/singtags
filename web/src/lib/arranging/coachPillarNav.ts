/**
 * Pillar ←/→ index resolution (time-sorted, playhead fallback).
 */
export type PillarSpan = { id: string; startTick: number; endTick: number }

export function sortPillarsByTime<T extends PillarSpan>(pillars: readonly T[]): T[] {
  return [...pillars].sort((a, b) => a.startTick - b.startTick)
}

/** Next pillar index for ←/→; wraps; uses playhead when nothing is selected. */
export function nextPillarIndex(
  sorted: readonly PillarSpan[],
  selectedId: string | null | undefined,
  dir: -1 | 1,
  playheadTick = 0,
): number {
  const n = sorted.length
  if (!n) return -1
  let cur = sorted.findIndex((p) => p.id === selectedId)
  if (cur < 0) {
    cur = sorted.findIndex((p) => p.startTick <= playheadTick && playheadTick < p.endTick)
  }
  if (cur < 0) return dir > 0 ? 0 : n - 1
  return (cur + dir + n) % n
}
