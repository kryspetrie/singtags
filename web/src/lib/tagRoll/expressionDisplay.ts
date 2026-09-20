/**
 * Display anchors for expression-lane / sheet marks (semantic tick unchanged).
 */
import type { TagRollNote } from './types'

/**
 * Fermata `tick` is the mark onset. Visually it should sit over the note(s)
 * being held — center of their written span — not on a bare grid line.
 */
export function fermataVisualCenterTick(
  tick: number,
  notes: readonly Pick<TagRollNote, 'startTick' | 'durationTicks'>[],
  fallbackCellTicks: number,
): number {
  const starting = notes.filter((n) => n.startTick === tick)
  const spanning = notes.filter(
    (n) => n.startTick < tick && n.startTick + Math.max(1, n.durationTicks) > tick,
  )
  const pool = starting.length ? starting : spanning
  if (pool.length > 0) {
    const start = Math.min(...pool.map((n) => n.startTick))
    const end = Math.max(...pool.map((n) => n.startTick + Math.max(1, n.durationTicks)))
    return (start + end) / 2
  }
  return tick + Math.max(1, fallbackCellTicks) / 2
}
