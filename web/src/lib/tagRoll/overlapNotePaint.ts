/**
 * Same-pitch overlapping notes — paint order + horizontal color bands.
 */
import type { TagRollNote, TagRollPart } from './types'

export type OverlapPaintNote = {
  note: TagRollNote
  /** Part colors sharing this pitch+time (active part last when provided). */
  bandColors: string[]
}

function rangesOverlap(
  aStart: number,
  aDur: number,
  bStart: number,
  bDur: number,
): boolean {
  return aStart < bStart + bDur && bStart < aStart + aDur
}

/** Notes at the same MIDI that overlap this note in time (includes self). */
export function notesSharingPitch(
  notes: readonly TagRollNote[],
  note: TagRollNote,
): TagRollNote[] {
  return notes.filter(
    (o) =>
      o.midi === note.midi &&
      rangesOverlap(note.startTick, note.durationTicks, o.startTick, o.durationTicks),
  )
}

/**
 * Sort so non-active parts paint first; active (and selected) last = on top.
 */
export function sortNotesForOverlapPaint<T extends { partId: string; id: string }>(
  notes: readonly T[],
  opts: { activePartId?: string | null; selectedIds?: ReadonlySet<string> },
): T[] {
  const active = opts.activePartId ?? null
  const selected = opts.selectedIds
  return notes.slice().sort((a, b) => {
    const aSel = selected?.has(a.id) ? 1 : 0
    const bSel = selected?.has(b.id) ? 1 : 0
    if (aSel !== bSel) return aSel - bSel
    const aAct = active && a.partId === active ? 1 : 0
    const bAct = active && b.partId === active ? 1 : 0
    if (aAct !== bAct) return aAct - bAct
    return a.id.localeCompare(b.id)
  })
}

export function bandColorsForNote(
  _note: TagRollNote,
  sharing: readonly TagRollNote[],
  parts: readonly Pick<TagRollPart, 'id' | 'color'>[],
  opts?: { activePartId?: string | null },
): string[] {
  const colorOf = (partId: string) =>
    parts.find((p) => p.id === partId)?.color ?? '#888888'
  const unique = new Map<string, string>()
  for (const n of sharing) {
    if (!unique.has(n.partId)) unique.set(n.partId, colorOf(n.partId))
  }
  const active = opts?.activePartId
  const ids = [...unique.keys()].sort((a, b) => {
    // Active part first → top horizontal band on the note.
    if (active && a === active) return -1
    if (active && b === active) return 1
    return a.localeCompare(b)
  })
  return ids.map((id) => unique.get(id)!)
}

/** Fill a note rect with equal horizontal color bands (top → bottom). */
export function fillNoteColorBands(
  ctx: CanvasRenderingContext2D,
  opts: {
    x: number
    y: number
    w: number
    h: number
    colors: readonly string[]
  },
): void {
  const { x, y, w, h, colors } = opts
  if (w <= 0 || h <= 0 || !colors.length) return
  if (colors.length === 1) {
    ctx.fillStyle = colors[0]!
    ctx.fillRect(x, y, w, h)
    return
  }
  const bandH = h / colors.length
  for (let i = 0; i < colors.length; i++) {
    const by = y + i * bandH
    const bh = i === colors.length - 1 ? y + h - by : bandH
    ctx.fillStyle = colors[i]!
    ctx.fillRect(x, by, w, Math.max(0.5, bh))
  }
}
