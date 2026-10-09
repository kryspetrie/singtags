/**
 * Resolve melody moments covered by a Path Optimize scope.
 */
import type { ArrangementProject, MelodyEvent } from '../types'
import type { PathOptimizeScope } from './types'

/** Melody onsets in scope order (held posts are separate notes when present). */
export function resolveOptimizeMoments(
  project: ArrangementProject,
  scope: PathOptimizeScope,
): MelodyEvent[] {
  const mel = [...project.melody].sort(
    (a, b) => a.startTick - b.startTick || a.id.localeCompare(b.id),
  )
  if (scope.kind === 'whole') return mel
  if (scope.kind === 'range') {
    return mel.filter(
      (m) => m.startTick >= scope.startTick && m.startTick < scope.endTick,
    )
  }
  const exact = mel.find((m) => m.startTick === scope.tick)
  if (exact) return [exact]
  const covering = mel.find(
    (m) =>
      m.startTick <= scope.tick &&
      scope.tick < m.startTick + Math.max(1, m.durationTicks),
  )
  return covering ? [covering] : []
}

export function tickInOptimizeScope(
  tick: number,
  scope: PathOptimizeScope,
): boolean {
  if (scope.kind === 'whole') return true
  if (scope.kind === 'range') return tick >= scope.startTick && tick < scope.endTick
  return tick === scope.tick
}
