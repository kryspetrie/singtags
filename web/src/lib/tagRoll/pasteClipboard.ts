/**
 * Apply an in-app note clipboard at a tick (Tag Studio paste).
 */
import { ensureLengthForNote } from './snap'
import { measureTicks } from './tempoMap'
import {
  clipboardToNotesAt,
  mapClipboardToProjectParts,
  type TagRollNoteClipboard,
} from './selection'
import type { TagRollProject } from './types'

export function applyNoteClipboardAtPlayhead(
  project: TagRollProject,
  clip: TagRollNoteClipboard,
  newId: () => string,
): { project: TagRollProject; createdIds: string[]; origin: number; spanTicks?: number } | null {
  if (!clip.notes.length) return null
  const partIds = new Set(project.parts.map((x) => x.id))
  const active = project.view.activePartId ?? project.parts[0]?.id
  const mapped = mapClipboardToProjectParts(clip.notes, partIds, active)
  const origin = project.view.playheadTick
  const created = clipboardToNotesAt(mapped, origin, newId)
  let lengthTicks = project.lengthTicks
  const mTicks = measureTicks(project.timeSignature)
  for (const n of created) {
    lengthTicks = ensureLengthForNote(lengthTicks, n.startTick, n.durationTicks, mTicks)
  }
  return {
    project: {
      ...project,
      notes: [...project.notes, ...created],
      lengthTicks,
      view: { ...project.view, mode: 'compose' },
      updatedAt: project.updatedAt,
    },
    createdIds: created.map((n) => n.id),
    origin,
    spanTicks: clip.spanTicks,
  }
}
