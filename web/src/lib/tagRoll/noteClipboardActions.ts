/**
 * Build in-app note clipboard payloads for Copy / Cut.
 */
import { notesToClipboard, type TagRollNoteClipboard } from './selection'
import type { TagRollNote } from './types'

export function clipboardFromCopy(
  inspectCopy: () => TagRollNoteClipboard | null,
  selected: readonly TagRollNote[],
): TagRollNoteClipboard | null {
  const section = inspectCopy()
  if (section) return section
  if (!selected.length) return null
  return { notes: notesToClipboard(selected) }
}

/** Inspect cut already deletes; otherwise caller should delete `removeIds`. */
export function clipboardFromCut(
  inspectCut: () => TagRollNoteClipboard | null,
  selected: readonly TagRollNote[],
): { clip: TagRollNoteClipboard; removeIds: string[] } | null {
  const section = inspectCut()
  if (section) return { clip: section, removeIds: [] }
  if (!selected.length) return null
  return {
    clip: { notes: notesToClipboard(selected) },
    removeIds: selected.map((n) => n.id),
  }
}
