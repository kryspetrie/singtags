/**
 * Hit-testing for the Tag Studio expression lane (tempo markers + expressions).
 */
import type { TagRollExpression, TagRollKeyMarker, TagRollTempoMarker } from './types'

export type ExpressionLaneHit =
  | { kind: 'tempo'; marker: TagRollTempoMarker }
  | { kind: 'key'; marker: TagRollKeyMarker }
  | { kind: 'expression'; expr: TagRollExpression; edge: 'start' | 'end' | 'body' }

export function hitTempoMarkerAtX(
  markers: readonly TagRollTempoMarker[],
  lx: number,
  xAtTick: (tick: number) => number,
  slop = 10,
): TagRollTempoMarker | null {
  for (let i = markers.length - 1; i >= 0; i--) {
    const m = markers[i]!
    if (Math.abs(lx - xAtTick(m.tick)) <= slop) return m
  }
  return null
}

export function hitKeyMarkerAtX(
  markers: readonly TagRollKeyMarker[],
  lx: number,
  xAtTick: (tick: number) => number,
  slop = 12,
): TagRollKeyMarker | null {
  for (let i = markers.length - 1; i >= 0; i--) {
    const m = markers[i]!
    if (Math.abs(lx - xAtTick(m.tick)) <= slop) return m
  }
  return null
}

export function hitExpressionAtX(
  expressions: readonly TagRollExpression[],
  lx: number,
  xAtTick: (tick: number) => number,
  handleW = 8,
  fermataSlop = 16,
  /** Display X for a fermata onset tick (defaults to xAtTick). */
  fermataXAt: (tick: number) => number = xAtTick,
): { expr: TagRollExpression; edge: 'start' | 'end' | 'body' } | null {
  for (let i = expressions.length - 1; i >= 0; i--) {
    const e = expressions[i]!
    if (e.kind === 'fermata') {
      if (Math.abs(lx - fermataXAt(e.tick)) <= fermataSlop) return { expr: e, edge: 'body' }
      continue
    }
    const x0 = xAtTick(e.startTick)
    const x1 = xAtTick(e.endTick)
    if (Math.abs(lx - x0) <= handleW) return { expr: e, edge: 'start' }
    if (Math.abs(lx - x1) <= handleW) return { expr: e, edge: 'end' }
    if (lx >= x0 && lx <= x1) return { expr: e, edge: 'body' }
  }
  return null
}
