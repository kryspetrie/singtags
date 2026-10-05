import { describe, expect, it } from 'vitest'
import { buildSheetChordMarkBoxes, type SheetChordMarkSpan } from './sheetChordMarks'
import type { VexScoreLayoutResult, VexScoreMeasureGeom } from './sheetScore/renderVexScore'

function fakeLayout(measures: VexScoreMeasureGeom[]): VexScoreLayoutResult {
  return {
    width: 800,
    height: 400,
    contentOriginY: 20,
    contentOriginX: 40,
    systemBodyHeight: 80,
    sizeScale: 1,
    marginsPx: { left: 20, right: 20, top: 20, bottom: 20 },
    measures,
    pages: [],
    tickToX: (t) => {
      const m = measures.find((x) => t >= x.startTick && t < x.endTick) ?? measures[measures.length - 1]!
      const u = (t - m.startTick) / Math.max(1, m.endTick - m.startTick)
      return m.noteStartX + u * (m.noteEndX - m.noteStartX)
    },
    tickToPoint: (t) => {
      const m = measures.find((x) => t >= x.startTick && t < x.endTick) ?? measures[measures.length - 1]!
      const u = (t - m.startTick) / Math.max(1, m.endTick - m.startTick)
      return {
        x: m.noteStartX + u * (m.noteEndX - m.noteStartX),
        y: m.y,
      }
    },
    pointToTick: () => 0,
  }
}

describe('buildSheetChordMarkBoxes', () => {
  it('places a box above the staff for a single-system span', () => {
    const lay = fakeLayout([
      {
        measureIndex: 0,
        startTick: 0,
        endTick: 480,
        x: 20,
        y: 100,
        width: 200,
        systemIndex: 0,
        noteStartX: 40,
        noteEndX: 200,
      },
    ])
    const spans: SheetChordMarkSpan[] = [
      { id: 'c1', startTick: 0, endTick: 480, label: 'C7', variant: 'sketch' },
    ]
    const boxes = buildSheetChordMarkBoxes(lay, spans)
    expect(boxes).toHaveLength(1)
    expect(boxes[0]!.label).toBe('C7')
    expect(boxes[0]!.variant).toBe('sketch')
    expect(boxes[0]!.top).toBeLessThan(100)
    expect(boxes[0]!.width).toBeGreaterThan(20)
  })

  it('splits a wrap-spanning chord into one box per system', () => {
    const lay = fakeLayout([
      {
        measureIndex: 0,
        startTick: 0,
        endTick: 480,
        x: 20,
        y: 100,
        width: 200,
        systemIndex: 0,
        noteStartX: 40,
        noteEndX: 200,
      },
      {
        measureIndex: 1,
        startTick: 480,
        endTick: 960,
        x: 20,
        y: 220,
        width: 200,
        systemIndex: 1,
        noteStartX: 40,
        noteEndX: 200,
      },
    ])
    const spans: SheetChordMarkSpan[] = [
      { id: 'long', startTick: 240, endTick: 720, label: 'F', variant: 'detected' },
    ]
    const boxes = buildSheetChordMarkBoxes(lay, spans)
    expect(boxes).toHaveLength(2)
    expect(boxes[0]!.top).not.toBe(boxes[1]!.top)
    expect(boxes.every((b) => b.variant === 'detected')).toBe(true)
  })
})
