/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import { ticksToPx } from './normalize'
import {
  hitStripResizeEdge,
  moveSketchSpan,
  resizeSketchSpanByEdge,
  stripSegW,
  stripSegX,
  stripTickFromLocalX,
} from './harmonyStripGestures'

describe('harmonyStripGestures', () => {
  const cellW = 48
  const ppq = 480
  const scrollX = 100

  it('stripSegX matches viewport note x (no lane-lab inset)', () => {
    const startTick = 960
    const x = stripSegX(startTick, scrollX, cellW, ppq)
    expect(x).toBe(-scrollX + ticksToPx(startTick, cellW, ppq))
    // Must not include a ~3.5rem (56px) track inset.
    expect(x).toBeCloseTo(-100 + (960 / 480) * 48, 5)
  })

  it('stripSegW tracks tick duration without a 28px floor', () => {
    const w = stripSegW(0, 120, cellW, ppq) // quarter of a beat at ppq 480
    expect(w).toBeCloseTo((120 / 480) * 48, 5)
    expect(w).toBeLessThan(28)
  })

  it('stripTickFromLocalX inverts stripSegX', () => {
    const tick = 1920
    const x = stripSegX(tick, scrollX, cellW, ppq)
    expect(stripTickFromLocalX(x, scrollX, cellW, ppq)).toBeCloseTo(tick, 0)
  })

  it('resizeSketchSpanByEdge end keeps start; start keeps end', () => {
    const origin = { startTick: 480, endTick: 960 }
    const endResized = resizeSketchSpanByEdge('end', 480, origin, {
      snapTicks: 120,
      lengthTicks: 10000,
    })
    expect(endResized.startTick).toBe(480)
    expect(endResized.endTick).toBeGreaterThan(960)

    const startResized = resizeSketchSpanByEdge('start', 120, origin, {
      snapTicks: 120,
      lengthTicks: 10000,
    })
    expect(startResized.endTick).toBe(960)
    expect(startResized.startTick).toBeGreaterThan(480)
  })

  it('moveSketchSpan keeps duration and snaps', () => {
    const moved = moveSketchSpan(250, { startTick: 480, endTick: 960 }, {
      snapTicks: 120,
      lengthTicks: 10000,
    })
    expect(moved.endTick - moved.startTick).toBe(480)
    expect(moved.startTick % 120).toBe(0)
  })

  it('hitStripResizeEdge detects left/right handles', () => {
    expect(hitStripResizeEdge(2, 0, 100)).toBe('start')
    expect(hitStripResizeEdge(98, 0, 100)).toBe('end')
    expect(hitStripResizeEdge(50, 0, 100)).toBeNull()
  })

  it('empty-track click tick inverts to the same start as a note at that onset', () => {
    // Click at the screen X of tick 960 → place window must start at 960 (before measure snap).
    const clickTick = 960
    const localX = stripSegX(clickTick, scrollX, cellW, ppq)
    expect(stripTickFromLocalX(localX, scrollX, cellW, ppq)).toBeCloseTo(clickTick, 0)
  })
})
