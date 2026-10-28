/**
 * Cross-part melody handoff links (dashed line on the piano roll).
 */
import type { TagRollMelodyPass, TagRollNote, TagRollProject } from './types'

export type ResolvedMelodyPass = {
  id: string
  from: TagRollNote
  to: TagRollNote
}

/** Center of a note’s time×pitch box (piano-roll coords before scroll). */
export function noteCenterPx(
  note: Pick<TagRollNote, 'startTick' | 'durationTicks' | 'midi'>,
  opts: {
    cellW: number
    cellH: number
    ticksToPx: (ticks: number, cellW: number) => number
    midiToY: (midi: number, cellH: number) => number
  },
): { x: number; y: number } {
  const x0 = opts.ticksToPx(note.startTick, opts.cellW)
  const x1 = opts.ticksToPx(note.startTick + note.durationTicks, opts.cellW)
  const y = opts.midiToY(note.midi, opts.cellH) + opts.cellH / 2
  return { x: (x0 + x1) / 2, y }
}

export function canLinkMelodyPass(a: TagRollNote, b: TagRollNote): boolean {
  return a.id !== b.id && a.partId !== b.partId
}

/** Lead, unless the chart named a different starting melody part. */
export function startingMelodyPartId(
  project: {
    parts: readonly { id: string; name: string }[]
    view: { melodyPartId?: string | null }
  },
): string | null {
  return (
    project.view.melodyPartId ??
    project.parts.find((p) => p.name === 'Lead')?.id ??
    project.parts[0]?.id ??
    null
  )
}

/**
 * The part that has the melody at `tick`. Lead (or the chart's starting
 * melody part) until a handoff, then the new part until the next handoff.
 */
export function melodyPartAtTick(
  project: {
    notes: readonly { id: string; partId: string; startTick: number }[]
    parts: readonly { id: string; name: string }[]
    view: { melodyPartId?: string | null }
    melodyPasses?: readonly { toNoteId: string }[] | null
  },
  tick: number,
): string | null {
  let partId = startingMelodyPartId(project)
  const changes: { tick: number; partId: string }[] = []
  for (const pass of project.melodyPasses ?? []) {
    const to = project.notes.find((n) => n.id === pass.toNoteId)
    if (to) changes.push({ tick: to.startTick, partId: to.partId })
  }
  changes.sort((a, b) => a.tick - b.tick)
  for (const change of changes) {
    if (change.tick <= tick) partId = change.partId
  }
  return partId
}

/** Last note on the melody part before `tick`, the start of a dashed handoff. */
export function previousMelodyNote(
  project: Pick<TagRollProject, 'notes' | 'parts' | 'view' | 'melodyPasses'>,
  tick: number,
): TagRollNote | null {
  const partId = melodyPartAtTick(project, Math.max(0, tick - 1))
  if (!partId) return null
  let best: TagRollNote | null = null
  for (const n of project.notes) {
    if (n.partId !== partId || n.startTick >= tick) continue
    if (!best || n.startTick > best.startTick) best = n
  }
  return best
}

/**
 * Move the melody to this note's part from here on, or undo that handoff
 * when the note is already the change. Returns null when the note is missing.
 */
export function toggleMelodyHandoff(
  project: Pick<TagRollProject, 'notes' | 'parts' | 'view' | 'melodyPasses'>,
  noteId: string,
  id?: string,
): { passes: TagRollMelodyPass[]; changed: boolean; message: string; startingPartId?: string } | null {
  const note = project.notes.find((n) => n.id === noteId)
  if (!note) return null
  const passes = project.melodyPasses ?? []
  const existing = passes.find((p) => p.toNoteId === note.id)
  if (existing) {
    return {
      passes: passes.filter((p) => p.id !== existing.id),
      changed: true,
      message: 'Melody stays with the previous part',
    }
  }
  const current = melodyPartAtTick(project, note.startTick)
  if (note.partId === current) {
    return { passes, changed: false, message: 'This part already has the melody here' }
  }
  const prev = previousMelodyNote(project, note.startTick)
  if (!prev) {
    return {
      passes,
      changed: true,
      startingPartId: note.partId,
      message: 'Melody starts on this part',
    }
  }
  return {
    passes: upsertMelodyPass(passes, prev.id, note.id, id ?? `mp_${prev.id}_${note.id}`),
    changed: true,
    message: 'Melody moves to this part until the next change',
  }
}

/** Earlier onset → later onset; ties break by midi. */
export function orderMelodyPassPair(
  a: TagRollNote,
  b: TagRollNote,
): { from: TagRollNote; to: TagRollNote } {
  if (
    a.startTick < b.startTick ||
    (a.startTick === b.startTick && a.midi <= b.midi)
  ) {
    return { from: a, to: b }
  }
  return { from: b, to: a }
}

export function resolveMelodyPasses(
  project: Pick<TagRollProject, 'notes' | 'melodyPasses'>,
): ResolvedMelodyPass[] {
  const byId = new Map(project.notes.map((n) => [n.id, n]))
  const out: ResolvedMelodyPass[] = []
  for (const link of project.melodyPasses ?? []) {
    const from = byId.get(link.fromNoteId)
    const to = byId.get(link.toNoteId)
    if (!from || !to) continue
    out.push({ id: link.id, from, to })
  }
  return out
}

/** Drop links that reference missing notes. */
export function pruneMelodyPasses(
  passes: readonly TagRollMelodyPass[],
  notes: readonly TagRollNote[],
): TagRollMelodyPass[] {
  const ids = new Set(notes.map((n) => n.id))
  return passes.filter((p) => ids.has(p.fromNoteId) && ids.has(p.toNoteId))
}

export function upsertMelodyPass(
  passes: readonly TagRollMelodyPass[],
  fromNoteId: string,
  toNoteId: string,
  id: string,
): TagRollMelodyPass[] {
  const without = passes.filter(
    (p) =>
      !(
        (p.fromNoteId === fromNoteId && p.toNoteId === toNoteId) ||
        (p.fromNoteId === toNoteId && p.toNoteId === fromNoteId)
      ),
  )
  return [...without, { id, fromNoteId, toNoteId }]
}

/** Draw dashed center-to-center melody handoff lines (piano-roll canvas). */
export function strokeMelodyPassLinks(
  ctx: CanvasRenderingContext2D,
  project: Pick<TagRollProject, 'notes' | 'parts' | 'melodyPasses' | 'view'>,
  opts: {
    scrollX: number
    scrollY: number
    cellW: number
    cellH: number
    cssW: number
    cssH: number
    accent: string
    ticksToPx: (ticks: number, cellW: number) => number
    midiToY: (midi: number, cellH: number) => number
  },
): void {
  const focusActive = project.view.focusActivePart
  const activePartId = project.view.activePartId
  for (const link of resolveMelodyPasses(project)) {
    const faded =
      focusActive &&
      !!activePartId &&
      link.from.partId !== activePartId &&
      link.to.partId !== activePartId
    const fromPart = project.parts.find((p) => p.id === link.from.partId)
    const c0 = noteCenterPx(link.from, opts)
    const c1 = noteCenterPx(link.to, opts)
    const x0 = -opts.scrollX + c0.x
    const y0 = -opts.scrollY + c0.y
    const x1 = -opts.scrollX + c1.x
    const y1 = -opts.scrollY + c1.y
    if (Math.max(x0, x1) < -2 || Math.min(x0, x1) > opts.cssW + 2) continue
    if (Math.max(y0, y1) < -2 || Math.min(y0, y1) > opts.cssH + 2) continue
    ctx.save()
    ctx.globalAlpha = faded ? 0.25 : 0.85
    ctx.strokeStyle = fromPart?.color || opts.accent
    ctx.lineWidth = faded ? 1.25 : 1.75
    ctx.setLineDash([5, 4])
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(x0, y0)
    ctx.lineTo(x1, y1)
    ctx.stroke()
    ctx.setLineDash([])
    ctx.restore()
  }
}
