/**
 * Column audition notes when Harmonize/Coach ghosts preview a different stack.
 * Prefer the suggestion (ghosts) over written TTBB so both don't sound together.
 */
import { hearStackNotesAtTick } from './notesAtTick'
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
