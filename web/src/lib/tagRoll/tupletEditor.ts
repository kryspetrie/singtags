/**
 * Pure apply/cancel helpers for the tuplet member editor.
 */
import { allocatePrefixedId } from './ids'
import { memberTicksForTuplet } from './tupletContainers'
import type { TagRollNote, TagRollTuplet } from './types'

export type TupletEditorSlot = {
  /** Concert MIDI, or null for an empty (rest) slot. */
  midi: number | null
  lyric?: string
}

export type TupletEditorDraft = {
  tupletId: string
  partId: string
  startTick: number
  spanTicks: number
  actualNotes: number
  normalNotes: number
  slots: TupletEditorSlot[]
}

export function draftFromTuplet(
  tuplet: TagRollTuplet,
  notes: readonly TagRollNote[],
): TupletEditorDraft {
  const members = notes
    .filter((n) => n.tuplet?.groupId === tuplet.id && n.partId === tuplet.partId)
    .sort((a, b) => a.startTick - b.startTick || a.midi - b.midi)
  const slices = memberTicksForTuplet(
    tuplet.startTick,
    tuplet.spanTicks,
    tuplet.actualNotes,
  )
  const slots: TupletEditorSlot[] = slices.map((slice) => {
    const hit = members.find(
      (n) =>
        n.startTick >= slice.startTick &&
        n.startTick < slice.startTick + slice.durationTicks,
    )
    return hit
      ? { midi: hit.midi, ...(hit.lyric ? { lyric: hit.lyric } : {}) }
      : { midi: null }
  })
  return {
    tupletId: tuplet.id,
    partId: tuplet.partId,
    startTick: tuplet.startTick,
    spanTicks: tuplet.spanTicks,
    actualNotes: tuplet.actualNotes,
    normalNotes: tuplet.normalNotes,
    slots,
  }
}

/** Re-slice slots when ratio/span changes; keep pitches by index when possible. */
export function resliceDraftSlots(
  draft: TupletEditorDraft,
  next: Pick<TupletEditorDraft, 'actualNotes' | 'normalNotes' | 'spanTicks'>,
): TupletEditorDraft {
  const actualNotes = Math.max(2, Math.round(next.actualNotes))
  const slots: TupletEditorSlot[] = []
  for (let i = 0; i < actualNotes; i++) {
    slots.push(draft.slots[i] ?? { midi: null })
  }
  return {
    ...draft,
    actualNotes,
    normalNotes: Math.max(1, Math.round(next.normalNotes)),
    spanTicks: Math.max(1, Math.round(next.spanTicks)),
    slots,
  }
}

/**
 * Replace notes tagged with this groupId with slots that have pitches.
 * Empty slots → no note.
 */
export function applyTupletDraft(
  notes: readonly TagRollNote[],
  tuplets: readonly TagRollTuplet[],
  draft: TupletEditorDraft,
  opts?: { newNoteId?: () => string },
): { notes: TagRollNote[]; tuplets: TagRollTuplet[] } {
  const idGen = opts?.newNoteId ?? (() => allocatePrefixedId('trn'))
  const without = notes.filter((n) => n.tuplet?.groupId !== draft.tupletId)
  const slices = memberTicksForTuplet(
    draft.startTick,
    draft.spanTicks,
    draft.actualNotes,
  )
  const created: TagRollNote[] = []
  for (let i = 0; i < slices.length; i++) {
    const slot = draft.slots[i]
    const slice = slices[i]!
    if (!slot || slot.midi == null) continue
    created.push({
      id: idGen(),
      partId: draft.partId,
      midi: Math.round(slot.midi),
      startTick: slice.startTick,
      durationTicks: slice.durationTicks,
      ...(slot.lyric?.trim() ? { lyric: slot.lyric.trim() } : {}),
      tuplet: {
        groupId: draft.tupletId,
        actualNotes: draft.actualNotes,
        normalNotes: draft.normalNotes,
      },
    })
  }
  const nextTuplets = tuplets.map((t) =>
    t.id === draft.tupletId
      ? {
          ...t,
          startTick: draft.startTick,
          spanTicks: draft.spanTicks,
          actualNotes: draft.actualNotes,
          normalNotes: draft.normalNotes,
          partId: draft.partId,
        }
      : t,
  )
  return { notes: [...without, ...created], tuplets: nextTuplets }
}
