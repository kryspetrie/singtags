/**
 * Select Tag Studio notes sounding at a tick or within a pillar range.
 */
import type { TagRollProject } from '../tagRoll/types'

export function noteIdsAtTick(project: TagRollProject, tick: number): string[] {
  const exact = project.notes.filter((n) => n.startTick === tick).map((n) => n.id)
  if (exact.length) return exact
  return project.notes
    .filter((n) => tick >= n.startTick && tick < n.startTick + n.durationTicks)
    .map((n) => n.id)
}

/** Notes that overlap [startTick, endTick). */
export function noteIdsInRange(
  project: TagRollProject,
  startTick: number,
  endTick: number,
): string[] {
  const end = Math.max(startTick + 1, endTick)
  return project.notes
    .filter((n) => n.startTick < end && n.startTick + n.durationTicks > startTick)
    .map((n) => n.id)
}

/** Prefer a named part at tick (e.g. Tenor), else fall back to column. */
export function noteIdsAtTickForPart(
  project: TagRollProject,
  tick: number,
  partName: string,
): string[] {
  const part = project.parts.find((p) => p.name === partName)
  if (!part) return noteIdsAtTick(project, tick)
  const hit = project.notes.filter(
    (n) => n.partId === part.id && n.startTick === tick,
  )
  if (hit.length) return hit.map((n) => n.id)
  const sounding = project.notes.filter(
    (n) =>
      n.partId === part.id &&
      tick >= n.startTick &&
      tick < n.startTick + n.durationTicks,
  )
  if (sounding.length) return sounding.map((n) => n.id)
  return noteIdsAtTick(project, tick)
}
