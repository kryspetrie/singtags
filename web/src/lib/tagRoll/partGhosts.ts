/**
 * Non-active part notes shown as reference ghosts when "Current only" is on.
 */
import type { TagRollNote, TagRollPart, TagRollProject } from './types'

export type PartFocusGhost = {
  midi: number
  startTick: number
  durationTicks: number
  color: string
  partId: string
}

/** Notes from other parts to draw as non-interactive ghosts. */
export function focusPartGhosts(
  project: Pick<TagRollProject, 'notes' | 'parts' | 'view'>,
): PartFocusGhost[] {
  if (!project.view.focusActivePart || !project.view.activePartId) return []
  const active = project.view.activePartId
  const colorById = new Map(project.parts.map((p: TagRollPart) => [p.id, p.color]))
  const out: PartFocusGhost[] = []
  for (const n of project.notes as TagRollNote[]) {
    if (n.partId === active) continue
    out.push({
      midi: n.midi,
      startTick: n.startTick,
      durationTicks: n.durationTicks,
      color: colorById.get(n.partId) || '#888',
      partId: n.partId,
    })
  }
  return out
}
