/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import { createTupletContainer } from './tupletContainers'
import { TAG_ROLL_PPQ } from './types'
import {
  hitTupletAtPoint,
  snapTupletDragSpan,
  tupletBandRect,
} from './tupletHitTest'

function ticksToPx(tick: number, cellW: number): number {
  return (tick / TAG_ROLL_PPQ) * cellW
}

describe('tupletHitTest', () => {
  const cellW = 48
  const t = createTupletContainer({
    id: 'tup1',
    partId: 'lead',
    startTick: 0,
    spanTicks: TAG_ROLL_PPQ,
  })

  it('tupletBandRect maps ticks to x span', () => {
    const r = tupletBandRect(t, {
      scrollX: 0,
      bandY: 40,
      bandH: 200,
      ticksToPx,
      cellW,
    })
    expect(r.x).toBe(0)
    expect(r.w).toBe(cellW)
    expect(r.y).toBe(40)
    expect(r.h).toBe(200)
  })

  it('hitTupletAtPoint returns body inside band', () => {
    const hit = hitTupletAtPoint([t], cellW / 2, 100, {
      scrollX: 0,
      bandY: 40,
      bandH: 200,
      ticksToPx,
      cellW,
      partId: 'lead',
    })
    expect(hit?.tuplet.id).toBe('tup1')
    expect(hit?.edge).toBe('body')
  })

  it('hitTupletAtPoint returns null outside band or wrong part', () => {
    expect(
      hitTupletAtPoint([t], cellW / 2, 10, {
        scrollX: 0,
        bandY: 40,
        bandH: 200,
        ticksToPx,
        cellW,
      }),
    ).toBeNull()
    expect(
      hitTupletAtPoint([t], cellW / 2, 100, {
        scrollX: 0,
        bandY: 40,
        bandH: 200,
        ticksToPx,
        cellW,
        partId: 'bass',
      }),
    ).toBeNull()
  })

  it('hitTupletAtPoint detects resize edges', () => {
    const start = hitTupletAtPoint([t], 2, 100, {
      scrollX: 0,
      bandY: 40,
      bandH: 200,
      ticksToPx,
      cellW,
      handleW: 8,
    })
    expect(start?.edge).toBe('start')
    const end = hitTupletAtPoint([t], cellW - 1, 100, {
      scrollX: 0,
      bandY: 40,
      bandH: 200,
      ticksToPx,
      cellW,
      handleW: 8,
    })
    expect(end?.edge).toBe('end')
  })

  it('snapTupletDragSpan snaps end tick on grid', () => {
    const snap = TAG_ROLL_PPQ / 4
    const span = snapTupletDragSpan(10, TAG_ROLL_PPQ + 20, snap)
    expect(span).toEqual({ startTick: 0, spanTicks: TAG_ROLL_PPQ })
    // Both ends snap to the same grid tick → no span.
    expect(snapTupletDragSpan(0, 1, snap)).toBeNull()
  })
})

