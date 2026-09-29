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
    // Same succession rule as pillarAtTick: latest start ≤ playhead.
    let best = -1
    for (let i = 0; i < n; i++) {
      if (sorted[i]!.startTick <= playheadTick) best = i
    }
    cur = best
  }
  if (cur < 0) return dir > 0 ? 0 : n - 1
  return (cur + dir + n) % n
}
