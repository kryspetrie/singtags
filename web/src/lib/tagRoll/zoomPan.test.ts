import { describe, expect, it } from 'vitest'
import { applyAngleZoom, pointerAngleAbs, pointerDistance } from './zoomPan'

describe('tagRoll zoomPan', () => {
  it('measures distance and angle', () => {
    expect(pointerDistance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5)
    expect(pointerAngleAbs({ x: 0, y: 0 }, { x: 10, y: 0 })).toBeCloseTo(0)
    expect(pointerAngleAbs({ x: 0, y: 0 }, { x: 0, y: 10 })).toBeCloseTo(Math.PI / 2)
  })

  it('weights horizontal pinch toward cellW', () => {
    const next = applyAngleZoom({
      start: { cellW: 20, cellH: 14 },
      startDist: 100,
      currentDist: 200,
      angleRad: 0,
      minW: 8,
      maxW: 64,
      minH: 8,
      maxH: 40,
    })
    expect(next.cellW).toBe(40)
    expect(next.cellH).toBe(14)
  })

  it('weights vertical pinch toward cellH', () => {
    const next = applyAngleZoom({
      start: { cellW: 20, cellH: 14 },
      startDist: 100,
      currentDist: 200,
      angleRad: Math.PI / 2,
      minW: 8,
      maxW: 64,
      minH: 8,
      maxH: 40,
    })
    expect(next.cellW).toBe(20)
    expect(next.cellH).toBe(28)
  })
})
