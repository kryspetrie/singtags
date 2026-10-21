/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it } from 'vitest'
import {
  appendSheetChordMarksToSvg,
  buildSheetChordMarkBoxes,
  collectSheetChordMarkSpans,
  estimateChordLabelWidthPx,
  estimateSheetChordSystemClearances,
  formatSheetChordLabel,
  paintSheetChordMarks,
  resolveChordMarkVerticalOverlaps,
  type SheetChordMarkSpan,
} from './sheetChordMarks'
import { createEmptyTagRollProject } from './normalize'
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
  it('places a full-measure chord from left barline to right barline', () => {
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
        noteEndX: 180,
      },
    ])
    const spans: SheetChordMarkSpan[] = [
      { id: 'c1', startTick: 0, endTick: 480, label: 'C7', variant: 'sketch' },
    ]
    const boxes = buildSheetChordMarkBoxes(lay, spans, { markStyle: 'span' })
    expect(boxes).toHaveLength(1)
    expect(boxes[0]!.label).toBe('C7')
    expect(boxes[0]!.left).toBe(20)
    expect(boxes[0]!.width).toBe(200)
    expect(boxes[0]!.top).toBeLessThan(100)
    expect(boxes[0]!.markStyle).toBe('span')
  })

  it('beat-1 chord starts at the barline; mid-measure end splits between noteheads', () => {
    const lay = fakeLayout([
      {
        measureIndex: 0,
        startTick: 0,
        endTick: 480,
        x: 10,
        y: 80,
        width: 200,
        systemIndex: 0,
        noteStartX: 50,
        noteEndX: 190,
      },
    ])
    // tickToX: 0→50, 120→50+140/4=85
    const boxes = buildSheetChordMarkBoxes(
      lay,
      [{ id: 'q1', startTick: 0, endTick: 120, label: 'I', variant: 'sketch' }],
      { markStyle: 'span' },
    )
    expect(boxes).toHaveLength(1)
    expect(boxes[0]!.left).toBe(10) // left barline
    // Right = midpoint(visual(0)=50, visual(120)=85) = 67.5
    expect(boxes[0]!.left + boxes[0]!.width).toBeCloseTo(67.5, 5)
  })

  it('end-of-measure chord ends at the right barline; left sits on the note', () => {
    const lay = fakeLayout([
      {
        measureIndex: 0,
        startTick: 0,
        endTick: 480,
        x: 10,
        y: 80,
        width: 200,
        systemIndex: 0,
        noteStartX: 50,
        noteEndX: 160,
      },
    ])
    // tickToX(360) = 50 + (360/480)*110 = 132.5
    const boxes = buildSheetChordMarkBoxes(
      lay,
      [{ id: 'q4', startTick: 360, endTick: 480, label: 'V7', variant: 'detected' }],
      { markStyle: 'span' },
    )
    expect(boxes).toHaveLength(1)
    expect(boxes[0]!.left).toBeCloseTo(132.5, 5)
    expect(boxes[0]!.left + boxes[0]!.width).toBe(210) // right barline
  })

  it('splits mid-measure adjacent chords at the visual midpoint between onsets', () => {
    const lay = fakeLayout([
      {
        measureIndex: 0,
        startTick: 0,
        endTick: 480,
        x: 0,
        y: 80,
        width: 240,
        systemIndex: 0,
        noteStartX: 40,
        noteEndX: 200,
      },
    ])
    // visual(0)=40, visual(240)=120, visual(480)→barline
    const boxes = buildSheetChordMarkBoxes(
      lay,
      [
        { id: 'a', startTick: 0, endTick: 240, label: 'I', variant: 'sketch' },
        { id: 'b', startTick: 240, endTick: 480, label: 'V', variant: 'sketch' },
      ],
      { markStyle: 'span' },
    )
    expect(boxes).toHaveLength(2)
    const mid = (40 + 120) / 2
    expect(boxes[0]!.left).toBe(0) // barline
    expect(boxes[0]!.left + boxes[0]!.width).toBeCloseTo(mid, 5)
    expect(boxes[1]!.left).toBeCloseTo(mid, 5)
    expect(boxes[1]!.left + boxes[1]!.width).toBe(240) // right barline
  })

  it('boxed style places a tight mark at the onset notehead', () => {
    const lay = fakeLayout([
      {
        measureIndex: 0,
        startTick: 0,
        endTick: 480,
        x: 10,
        y: 80,
        width: 200,
        systemIndex: 0,
        noteStartX: 50,
        noteEndX: 190,
      },
    ])
    const boxes = buildSheetChordMarkBoxes(
      lay,
      [{ id: 'q1', startTick: 0, endTick: 240, label: 'C7', variant: 'sketch' }],
      { markStyle: 'boxed', fontSize: 11 },
    )
    expect(boxes).toHaveLength(1)
    expect(boxes[0]!.markStyle).toBe('boxed')
    expect(boxes[0]!.left).toBe(50) // onset notehead, not barline
    expect(boxes[0]!.width).toBeLessThan(48)
    expect(boxes[0]!.width).toBeGreaterThanOrEqual(18)
  })

  it('boxed roman I still stays compact but has room for padding + border', () => {
    const w = estimateChordLabelWidthPx('I', 11)
    expect(w).toBeGreaterThanOrEqual(18)
    expect(w).toBeLessThan(36)
  })

  it('stacks a later boxed chord upward when it overlaps an earlier one', () => {
    const lay = fakeLayout([
      {
        measureIndex: 0,
        startTick: 0,
        endTick: 480,
        x: 0,
        y: 100,
        width: 200,
        systemIndex: 0,
        noteStartX: 40,
        noteEndX: 180,
      },
    ])
    const boxes = buildSheetChordMarkBoxes(
      lay,
      [
        { id: 'a', startTick: 0, endTick: 60, label: 'Cmaj7', variant: 'sketch' },
        { id: 'b', startTick: 30, endTick: 120, label: 'G7', variant: 'sketch' },
      ],
      { markStyle: 'boxed', fontSize: 12, boxHeight: 16, gapAboveStaff: 6 },
    )
    expect(boxes).toHaveLength(2)
    const left = boxes.find((b) => b.label === 'Cmaj7')!
    const right = boxes.find((b) => b.label === 'G7')!
    expect(right.top).toBeLessThan(left.top) // stacked above (away from staff)
    expect(
      left.left < right.left + right.width &&
        right.left < left.left + left.width &&
        left.top < right.top + 16 &&
        right.top < left.top + 16,
    ).toBe(false)
  })

  it('splits a wrap-spanning chord into one box per system at barlines', () => {
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
    const boxes = buildSheetChordMarkBoxes(lay, spans, { markStyle: 'span' })
    expect(boxes).toHaveLength(2)
    expect(boxes[0]!.top).not.toBe(boxes[1]!.top)
    const sys0 = boxes.find((b) => b.id.endsWith('-s0'))!
    const sys1 = boxes.find((b) => b.id.endsWith('-s1'))!
    // System 0: mid onset → right barline
    expect(sys0.left).toBeCloseTo(lay.tickToX(240), 5)
    expect(sys0.left + sys0.width).toBe(220)
    // System 1: left barline → mid split before 720
    expect(sys1.left).toBe(20)
    const v480 = lay.tickToX(480)
    const v720 = lay.tickToX(720)
    expect(sys1.left + sys1.width).toBeCloseTo((v480 + v720) / 2, 5)
  })
})

describe('formatSheetChordLabel', () => {
  it('supports name, roman, and both', () => {
    expect(formatSheetChordLabel('C7', 'V7', 'name')).toBe('C7')
    expect(formatSheetChordLabel('C7', 'V7', 'roman')).toBe('V7')
    expect(formatSheetChordLabel('C7', 'V7', 'both')).toBe('C7 (V7)')
    expect(formatSheetChordLabel('I', 'I', 'both')).toBe('I')
    expect(formatSheetChordLabel('', 'V7', 'name')).toBe('V7')
  })
})

describe('collectSheetChordMarkSpans', () => {
  it('honors Format toggles on screen (forceInclude off)', () => {
    const p = createEmptyTagRollProject()
    p.harmonySketch = [
      {
        id: 's1',
        startTick: 0,
        endTick: 480,
        rootPc: 0,
        quality: 'seventh',
        source: 'user',
        locked: true,
      },
    ]
    p.view.sheetShowSketchChords = false
    p.view.sheetShowDetectedChords = false
    expect(collectSheetChordMarkSpans(p)).toEqual([])
    p.view.sheetShowSketchChords = true
    const spans = collectSheetChordMarkSpans(p)
    expect(spans).toHaveLength(1)
    expect(spans[0]!.variant).toBe('sketch')
    expect(spans[0]!.label).toMatch(/C7|C/)
  })

  it('forceInclude paints Sketch + Detected even when toggles are off', () => {
    const p = createEmptyTagRollProject()
    p.harmonySketch = [
      {
        id: 's1',
        startTick: 0,
        endTick: 480,
        rootPc: 0,
        quality: 'major',
        source: 'user',
        locked: true,
      },
    ]
    p.view.sheetShowSketchChords = false
    p.view.sheetShowDetectedChords = false
    p.view.sheetChordLabelMode = 'name'
    const spans = collectSheetChordMarkSpans(
      p,
      [{ id: 'd1', startTick: 480, endTick: 960, rootPc: 5, displayName: 'F7' }],
      { forceInclude: true },
    )
    expect(spans.map((s) => s.variant).sort()).toEqual(['detected', 'sketch'])
    expect(spans.find((s) => s.variant === 'detected')!.label).toBe('F7')
  })

  it('labels Detected with name and roman when mode is both', () => {
    const p = createEmptyTagRollProject()
    p.view.sheetShowDetectedChords = true
    p.view.sheetChordLabelMode = 'both'
    const spans = collectSheetChordMarkSpans(p, [
      {
        id: 'd1',
        startTick: 0,
        endTick: 480,
        rootPc: 7,
        displayName: 'G7',
        displayRoman: 'V7',
      },
    ])
    expect(spans).toHaveLength(1)
    expect(spans[0]!.label).toBe('G7 (V7)')
  })
})

describe('appendSheetChordMarksToSvg', () => {
  it('writes labeled boxes into the SVG', () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    appendSheetChordMarksToSvg(svg, [
      {
        id: 'sketch-c1-s0',
        left: 40,
        top: 20,
        width: 80,
        label: 'Bb7',
        variant: 'sketch',
        row: 0,
        markStyle: 'span',
      },
    ])
    const g = svg.querySelector('[data-sheet-chord-marks]')
    expect(g).toBeTruthy()
    expect(g!.querySelector('[data-chord-text] text')!.textContent).toBe('Bb7')
    expect(g!.querySelector('[data-chord-bg] rect')).toBeTruthy()
  })

  it('paints all labels above background rects', () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    appendSheetChordMarksToSvg(svg, [
      {
        id: 'a',
        left: 10,
        top: 10,
        width: 100,
        label: 'I',
        variant: 'sketch',
        row: 0,
        markStyle: 'span',
      },
      {
        id: 'b',
        left: 80,
        top: 10,
        width: 100,
        label: 'V7',
        variant: 'detected',
        row: 0,
        markStyle: 'span',
      },
    ])
    const root = svg.querySelector('[data-sheet-chord-marks]')!
    const kids = [...root.children]
    expect(kids[0]!.getAttribute('data-chord-bg')).toBe('1')
    expect(kids[1]!.getAttribute('data-chord-text')).toBe('1')
    expect(kids[1]!.querySelectorAll('text')).toHaveLength(2)
  })

  it('paintSheetChordMarks is idempotent', () => {
    const p = createEmptyTagRollProject()
    p.view.sheetChordMarkStyle = 'span'
    p.harmonySketch = [
      {
        id: 's1',
        startTick: 0,
        endTick: 480,
        rootPc: 7,
        quality: 'seventh',
        source: 'user',
        locked: true,
      },
    ]
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
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    paintSheetChordMarks(svg, lay, p, undefined, { forceInclude: true })
    paintSheetChordMarks(svg, lay, p, undefined, { forceInclude: true })
    expect(svg.querySelectorAll('[data-sheet-chord-marks]')).toHaveLength(1)
    expect(svg.querySelector('text')!.textContent).toMatch(/G7|G/)
  })

  it('paints SVG marks in unit space when sizeScale ≠ 1', () => {
    const p = createEmptyTagRollProject()
    p.view.sheetScoreScale = 1.25
    p.view.sheetChordMarkStyle = 'span'
    p.harmonySketch = [
      {
        id: 's1',
        startTick: 0,
        endTick: 480,
        rootPc: 0,
        quality: 'major',
        source: 'user',
        locked: true,
      },
    ]
    const lay = fakeLayout([
      {
        measureIndex: 0,
        startTick: 0,
        endTick: 480,
        x: 50,
        y: 125,
        width: 250,
        systemIndex: 0,
        noteStartX: 50,
        noteEndX: 250,
      },
    ])
    lay.sizeScale = 1.25
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    paintSheetChordMarks(svg, lay, p, undefined, { forceInclude: true })
    const rect = svg.querySelector('rect')!
    // Screen geometry ÷ sizeScale → SVG viewBox (unit) space.
    // Full-measure span uses barlines: x=50, width=250.
    expect(Number(rect.getAttribute('x'))).toBeCloseTo(50 / 1.25, 5)
    expect(Number(rect.getAttribute('width'))).toBeCloseTo(250 / 1.25, 5)
    // Sketch only (no Detected data) → row 0: 125 - gap10 - boxH28 = 87
    expect(Number(rect.getAttribute('y'))).toBeCloseTo(87 / 1.25, 5)
    expect(Number(rect.getAttribute('height'))).toBeCloseTo(28 / 1.25, 5)
    expect(svg.querySelector('text')!.getAttribute('font-family')).toMatch(/Academico/)
    expect(svg.querySelector('text')!.getAttribute('font-weight')).toBe('500')
  })
})

describe('resolveChordMarkVerticalOverlaps', () => {
  it('leaves non-overlapping boxes alone', () => {
    const out = resolveChordMarkVerticalOverlaps(
      [
        {
          id: 'a',
          left: 0,
          top: 50,
          width: 20,
          label: 'I',
          variant: 'sketch',
          row: 0,
          markStyle: 'boxed',
          systemIndex: 0,
        },
        {
          id: 'b',
          left: 40,
          top: 50,
          width: 20,
          label: 'V',
          variant: 'sketch',
          row: 0,
          markStyle: 'boxed',
          systemIndex: 0,
        },
      ],
      16,
    )
    expect(out.map((b) => b.top)).toEqual([50, 50])
  })

  it('does not stack abutting span marks that only share an edge', () => {
    const out = resolveChordMarkVerticalOverlaps(
      [
        {
          id: 'a',
          left: 0,
          top: 50,
          width: 40,
          label: 'I',
          variant: 'sketch',
          row: 0,
          markStyle: 'span',
          systemIndex: 0,
        },
        {
          id: 'b',
          left: 40,
          top: 50,
          width: 40,
          label: 'V',
          variant: 'sketch',
          row: 0,
          markStyle: 'span',
          systemIndex: 0,
        },
      ],
      16,
    )
    expect(out.map((b) => b.top)).toEqual([50, 50])
  })

  it('stacks overlapping boxed marks upward', () => {
    const out = resolveChordMarkVerticalOverlaps(
      [
        {
          id: 'a',
          left: 0,
          top: 50,
          width: 24,
          label: 'I',
          variant: 'sketch',
          row: 0,
          markStyle: 'boxed',
          systemIndex: 0,
        },
        {
          id: 'b',
          left: 10,
          top: 50,
          width: 24,
          label: 'V7',
          variant: 'sketch',
          row: 0,
          markStyle: 'boxed',
          systemIndex: 0,
        },
      ],
      16,
    )
    expect(out[0]!.top).toBe(50)
    expect(out[1]!.top).toBeLessThan(50)
  })

  it('does not stack marks on different systems', () => {
    const out = resolveChordMarkVerticalOverlaps(
      [
        {
          id: 'a',
          left: 0,
          top: 50,
          width: 24,
          label: 'I',
          variant: 'sketch',
          row: 0,
          markStyle: 'boxed',
          systemIndex: 0,
        },
        {
          id: 'b',
          left: 0,
          top: 50,
          width: 24,
          label: 'V',
          variant: 'sketch',
          row: 0,
          markStyle: 'boxed',
          systemIndex: 1,
        },
      ],
      16,
    )
    expect(out.map((b) => b.top)).toEqual([50, 50])
  })
})

describe('estimateSheetChordSystemClearances', () => {
  it('returns taller clearance when boxed marks stack', () => {
    const measures = [
      {
        startTick: 0,
        endTick: 480,
        x: 0,
        width: 100,
        noteStartX: 10,
        noteEndX: 90,
        systemIndex: 0,
      },
      {
        startTick: 480,
        endTick: 960,
        x: 100,
        width: 100,
        noteStartX: 110,
        noteEndX: 190,
        systemIndex: 0,
      },
    ]
    const single = estimateSheetChordSystemClearances(
      measures,
      [{ id: 'a', startTick: 0, endTick: 240, label: 'I', variant: 'sketch' }],
      { markStyle: 'boxed', boxHeight: 16, gapAboveStaff: 6, fontSize: 11 },
    )
    const stacked = estimateSheetChordSystemClearances(
      measures,
      [
        { id: 'a', startTick: 0, endTick: 240, label: 'I', variant: 'sketch' },
        { id: 'b', startTick: 0, endTick: 240, label: 'V7', variant: 'sketch' },
      ],
      { markStyle: 'boxed', boxHeight: 16, gapAboveStaff: 6, fontSize: 11 },
    )
    expect(single[0]!).toBeGreaterThan(0)
    expect(stacked[0]!).toBeGreaterThan(single[0]!)
  })
})
