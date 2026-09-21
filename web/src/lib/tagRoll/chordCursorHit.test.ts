import { describe, expect, it } from 'vitest'
import {
  hitChordCursorEdge,
  rangeFromDragTicks,
  resizeChordCursor,
} from './chordCursorHit'
import { ticksToPx } from './normalize'

describe('chordCursorHit', () => {
  const cursor = { startTick: 480, endTick: 960 }
  const opts = {
    rulerH: 24,
    cssH: 400,
    scrollX: 0,
    cellW: 28,
    ticksToPx,
  }

  it('hits left and right edges', () => {
    const x0 = ticksToPx(480, 28)
    const x1 = ticksToPx(960, 28)
    expect(hitChordCursorEdge(x0, 100, cursor, opts)).toBe('start')
    expect(hitChordCursorEdge(x1, 100, cursor, opts)).toBe('end')
    expect(hitChordCursorEdge((x0 + x1) / 2, 100, cursor, opts)).toBeNull()
  })

  it('resizes keeping positive width', () => {
    expect(resizeChordCursor('start', 700, 960, 5000, 120)).toEqual({
      startTick: 700,
      endTick: 960,
    })
    expect(resizeChordCursor('end', 500, 480, 5000, 120)).toEqual({
      startTick: 480,
      endTick: 600,
    })
  })

  it('normalizes ruler drag ticks', () => {
    expect(rangeFromDragTicks(960, 480, 5000, 120)).toEqual({
      startTick: 480,
      endTick: 960,
    })
    expect(rangeFromDragTicks(480, 500, 5000, 120)).toEqual({
      startTick: 480,
      endTick: 600,
    })
  })
})
