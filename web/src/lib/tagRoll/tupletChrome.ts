/**
 * Canvas chrome for piano-roll tuplet containers (dashed band + badge).
 */
import type { TagRollTuplet } from './types'
import { tupletBandRect, type TupletBandRect } from './tupletHitTest'

export function tupletBadgeLabel(t: Pick<TagRollTuplet, 'actualNotes' | 'normalNotes'>): string {
  if (t.actualNotes === 3 && t.normalNotes === 2) return '3'
  if (t.actualNotes === 6 && t.normalNotes === 4) return '6'
  if (t.actualNotes === 5 && t.normalNotes === 4) return '5'
  return `${t.actualNotes}:${t.normalNotes}`
}

export type PaintTupletBandsOpts = {
  scrollX: number
  bandY: number
  bandH: number
  ticksToPx: (tick: number, cellW: number) => number
  cellW: number
  selectedId?: string | null
  /** When set, fade other parts' bands. */
  focusPartId?: string | null
  partColor?: (partId: string) => string
}

/**
 * Draw dashed horizontal bands for each tuplet. Returns rects for tests / hit overlay.
 */
export function paintTupletBands(
  ctx: CanvasRenderingContext2D,
  tuplets: readonly TagRollTuplet[],
  opts: PaintTupletBandsOpts,
): TupletBandRect[] {
  const rects: TupletBandRect[] = []
  for (const t of tuplets) {
    const r = tupletBandRect(t, opts)
    rects.push(r)
    const faded = !!opts.focusPartId && t.partId !== opts.focusPartId
    const selected = opts.selectedId === t.id
    // Match Tag Studio accent when part color is missing (avoid generic Tailwind blue).
    const color = opts.partColor?.(t.partId) ?? '#1d6a9f'

    ctx.save()
    ctx.globalAlpha = faded ? 0.18 : selected ? 0.22 : 0.12
    ctx.fillStyle = color
    ctx.fillRect(r.x, r.y, r.w, r.h)

    ctx.globalAlpha = faded ? 0.32 : selected ? 0.9 : 0.55
    ctx.strokeStyle = color
    ctx.lineWidth = selected ? 2 : 1.25
    ctx.setLineDash([4, 3])
    ctx.strokeRect(r.x + 0.5, r.y + 0.5, Math.max(0, r.w - 1), Math.max(0, r.h - 1))
    ctx.setLineDash([])

    const badge = tupletBadgeLabel(t)
    ctx.globalAlpha = faded ? 0.35 : selected ? 1 : 0.85
    // Same stack as piano-roll note labels.
    ctx.font = '700 11px system-ui, sans-serif'
    ctx.fillStyle = color
    ctx.textBaseline = 'top'
    ctx.fillText(badge, r.x + 4, r.y + 4)
    ctx.restore()
  }
  return rects
}
