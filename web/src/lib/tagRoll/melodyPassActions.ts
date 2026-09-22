/**
 * Toggle a cross-part melody handoff for two selected notes.
 */
import {
  canLinkMelodyPass,
  orderMelodyPassPair,
  upsertMelodyPass,
} from './melodyPass'
import type { TagRollMelodyPass, TagRollNote, TagRollProject } from './types'

export function melodyPassPairFromSelection(
  notes: readonly TagRollNote[],
  selectedIds: readonly string[],
): { from: TagRollNote; to: TagRollNote } | null {
  if (selectedIds.length !== 2) return null
  const a = notes.find((n) => n.id === selectedIds[0])
  const b = notes.find((n) => n.id === selectedIds[1])
  if (!a || !b || !canLinkMelodyPass(a, b)) return null
  return orderMelodyPassPair(a, b)
}

export function hasMelodyPassLink(
  passes: readonly TagRollMelodyPass[],
  fromId: string,
  toId: string,
): boolean {
  return passes.some(
    (l) =>
      (l.fromNoteId === fromId && l.toNoteId === toId) ||
      (l.fromNoteId === toId && l.toNoteId === fromId),
  )
}

/** Returns updated melodyPasses, or null if selection cannot link. */
export function toggleMelodyPassOnProject(
  project: TagRollProject,
  selectedIds: readonly string[],
): TagRollMelodyPass[] | null {
  const pair = melodyPassPairFromSelection(project.notes, selectedIds)
  if (!pair) return null
  const passes = project.melodyPasses ?? []
  if (hasMelodyPassLink(passes, pair.from.id, pair.to.id)) {
    return passes.filter(
      (l) =>
        !(
          (l.fromNoteId === pair.from.id && l.toNoteId === pair.to.id) ||
          (l.fromNoteId === pair.to.id && l.toNoteId === pair.from.id)
        ),
    )
  }
  return upsertMelodyPass(passes, pair.from.id, pair.to.id, `mp_${pair.from.id}_${pair.to.id}`)
}

/**
 * Inspect-bar coaching when multi-select isn’t (yet) a valid melody-pass pair.
 * Empty string when the Link button should show instead.
 */
export function melodyPassInspectHint(
  notes: readonly TagRollNote[],
  selectedIds: readonly string[],
): string {
  if (melodyPassPairFromSelection(notes, selectedIds)) return ''
  if (selectedIds.length !== 2) {
    return 'Melody pass: Ctrl/Cmd-click exactly 2 notes on different parts, then Link'
  }
  const a = notes.find((n) => n.id === selectedIds[0])
  const b = notes.find((n) => n.id === selectedIds[1])
  if (!a || !b) return 'Melody pass: select 2 notes on different parts'
  if (a.partId === b.partId) {
    return 'Melody pass needs two different parts (e.g. Lead → Tenor)'
  }
  return 'Melody pass: select 2 notes on different parts'
}
