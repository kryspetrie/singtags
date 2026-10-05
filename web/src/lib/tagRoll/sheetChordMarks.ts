/**
 * Chord label boxes above the staff in Tag Studio sheet view.
 */
import type { VexScoreLayoutResult } from './sheetScore/renderVexScore'

export type SheetChordMarkVariant = 'sketch' | 'detected'

export type SheetChordMarkSpan = {
  id: string
  startTick: number
  endTick: number
  label: string
  variant: SheetChordMarkVariant
  /** Stack row when multiple lanes show (0 = closest to staff). */
  row?: number
}

export type SheetChordMarkBox = {
  id: string
  left: number
  top: number
  width: number
  label: string
  variant: SheetChordMarkVariant
  /** Stack row when sketch + detected both show (0 = closer to staff). */
  row: number
}

const MIN_BOX_W = 22

/**
 * Build per-system boxes for chord spans. Spans that wrap systems get one box
 * per system row; X never interpolates across a line break.
 */
export function buildSheetChordMarkBoxes(
  layout: VexScoreLayoutResult,
  spans: readonly SheetChordMarkSpan[],
  opts?: { boxHeight?: number; gapAboveStaff?: number },
): SheetChordMarkBox[] {
  const boxH = opts?.boxHeight ?? 18
  const gapAbove = opts?.gapAboveStaff ?? 6
  const out: SheetChordMarkBox[] = []

  for (const span of spans) {
    if (!span.label.trim()) continue
    if (!(span.endTick > span.startTick)) continue
    const overlapping = layout.measures.filter(
      (m) => m.endTick > span.startTick && m.startTick < span.endTick,
    )
    if (!overlapping.length) continue

    const bySys = new Map<number, typeof overlapping>()
    for (const m of overlapping) {
      const list = bySys.get(m.systemIndex)
      if (list) list.push(m)
      else bySys.set(m.systemIndex, [m])
    }

    const row = span.row ?? (span.variant === 'sketch' ? 1 : 0)
    for (const [, rowMs] of bySys) {
      rowMs.sort((a, b) => a.startTick - b.startTick)
      const first = rowMs[0]!
      const last = rowMs[rowMs.length - 1]!
      const segStart = Math.max(span.startTick, first.startTick)
      const segEnd = Math.min(span.endTick, last.endTick)
      const a = layout.tickToPoint(segStart)
      // Stay inside this system — exclusive end avoids next-line X pollution.
      const b = layout.tickToPoint(Math.max(segStart, segEnd - 1))
      const left = Math.min(a.x, b.x)
      const right = Math.max(a.x, b.x, left + MIN_BOX_W)
      const top = a.y - gapAbove - boxH * (row + 1) - row * 3
      out.push({
        id: `${span.variant}-${span.id}-s${first.systemIndex}`,
        left,
        top,
        width: Math.max(MIN_BOX_W, right - left),
        label: span.label,
        variant: span.variant,
        row,
      })
    }
  }
  return out
}
