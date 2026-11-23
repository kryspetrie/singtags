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
import { clipboardTupletsAtPlayhead } from './tupletClipboard'
import type { TagRollProject } from './types'

export function applyNoteClipboardAtPlayhead(
  project: TagRollProject,
  clip: TagRollNoteClipboard,
  newId: () => string,
  opts?: { newTupletId?: () => string },
): {
  project: TagRollProject
  createdIds: string[]
  createdTupletIds: string[]
  origin: number
  spanTicks?: number
} | null {
  const hasNotes = clip.notes.length > 0
  const hasTuplets = (clip.tuplets?.length ?? 0) > 0
  if (!hasNotes && !hasTuplets) return null

  const origin = project.view.playheadTick
  let lengthTicks = project.lengthTicks
  let notes = project.notes
  let tuplets = project.tuplets ?? []
  const createdIds: string[] = []
  let createdTupletIds: string[] = []

  if (hasNotes) {
    const partIds = new Set(project.parts.map((x) => x.id))
    const active = project.view.activePartId ?? project.parts[0]?.id
    const mapped = mapClipboardToProjectParts(clip.notes, partIds, active)
    const created = clipboardToNotesAt(mapped, origin, newId)
    const mTicks = measureTicks(project.timeSignature)
    for (const n of created) {
      lengthTicks = ensureLengthForNote(lengthTicks, n.startTick, n.durationTicks, mTicks)
    }
    notes = [...notes, ...created]
    createdIds.push(...created.map((n) => n.id))
  }

  if (hasTuplets) {
    const staged = clipboardTupletsAtPlayhead(
      { ...project, notes, tuplets, lengthTicks },
      clip.tuplets!,
      origin,
      {
        newNoteId: newId,
        newTupletId: opts?.newTupletId ?? (() => `tup-${newId()}`),
      },
    )
    if (!staged) return null
    notes = [...notes, ...staged.notes]
    tuplets = staged.tuplets
    lengthTicks = staged.lengthTicks
    createdIds.push(...staged.createdNoteIds)
    createdTupletIds = staged.createdTupletIds
  }

  return {
    project: {
      ...project,
      notes,
      tuplets,
      lengthTicks,
      view: { ...project.view, mode: 'compose' },
      updatedAt: project.updatedAt,
    },
    createdIds,
    createdTupletIds,
    origin,
    spanTicks: clip.spanTicks,
  }
}
