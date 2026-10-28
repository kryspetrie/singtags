/**
 * Column audition notes when Harmonize/Coach ghosts preview a different stack.
 * Prefer the suggestion (ghosts) over written TTBB so both don't sound together.
 */
import { hearStackNotesAtTick } from './notesAtTick'
import { previewDraftDirty, type HarmonyPreviewDraft } from './harmonyPreviewDraft'
import type { TagRollNote } from './types'

export type AuditionGhost = {
  midi: number
  startTick: number
  durationTicks: number
}

function ghostCoversTick(g: AuditionGhost, tick: number): boolean {
  return g.startTick <= tick && tick < g.startTick + Math.max(1, g.durationTicks)
}

/**
 * Notes to hear at `tick`. When preview ghosts cover the tick, return melody
 * (if any) + ghosts only — not the written non-melody stack.
 */
export function notesForColumnAudition(opts: {
  notes: readonly TagRollNote[]
  tick: number
  ghosts?: readonly AuditionGhost[] | null
  melodyPartId?: string | null
}): TagRollNote[] {
  const tick = Math.max(0, opts.tick)
  const ghostsAt = (opts.ghosts ?? []).filter((g) => ghostCoversTick(g, tick))
  if (!ghostsAt.length) return hearStackNotesAtTick(opts.notes, tick)

  const mid = opts.melodyPartId ?? null
  const melody = mid
    ? hearStackNotesAtTick(
        opts.notes.filter((n) => n.partId === mid),
        tick,
      )
    : []
  const ghostNotes: TagRollNote[] = ghostsAt.map((g, i) => ({
    id: `ghost-${g.midi}-${i}`,
    partId: '',
    midi: g.midi,
    startTick: g.startTick,
    durationTicks: g.durationTicks,
  }))
  return [...melody, ...ghostNotes]
}

function noteOverlaps(
  note: { startTick: number; durationTicks: number },
  range: { startTick: number; endTick: number },
): boolean {
  const end = note.startTick + Math.max(1, note.durationTicks)
  return note.startTick < range.endTick && range.startTick < end
}

/**
 * Transport notes while a chord preview is active. The preview voicing is
 * played from Sketch, so written harmony in that span stays silent. Melody
 * notes stay so the tune does not drop out.
 */
export function notesForPreviewTransport(opts: {
  notes: readonly TagRollNote[]
  preview: HarmonyPreviewDraft | null
  melodyAt: (tick: number) => string | null
}): TagRollNote[] {
  const preview = opts.preview
  if (!preview || !previewDraftDirty(preview)) return [...opts.notes]
  return opts.notes.filter((note) => {
    if (!noteOverlaps(note, preview)) return true
    return opts.melodyAt(note.startTick) === note.partId
  })
}
