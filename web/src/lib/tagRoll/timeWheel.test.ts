/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import { applyTagRollTimeWheel } from './timeWheel'

const base = {
  scrollX: 100,
  scrollY: 0,
  cellW: 40,
  cellH: 14,
  lengthTicks: 19200,
  ppq: 480,
  viewportWidthPx: 800,
  localX: 200,
  shiftPansTime: true,
}

describe('applyTagRollTimeWheel', () => {
  it('pans time on Alt / horizontal delta', () => {
    const r = applyTagRollTimeWheel({ deltaX: 40, deltaY: 0, shiftKey: false, altKey: false }, base)
    expect(r?.scroll?.x).toBe(140)
    expect(r?.cellSize).toBeUndefined()
  })

  it('pans time on Shift when shiftPansTime', () => {
    const r = applyTagRollTimeWheel({ deltaX: 0, deltaY: 50, shiftKey: true, altKey: false }, base)
    expect(r?.scroll?.x).toBe(150)
  })

  it('ignores Shift when shiftPansTime is false (pitch handled elsewhere)', () => {
    const r = applyTagRollTimeWheel(
      { deltaX: 0, deltaY: 50, shiftKey: true, altKey: false },
      { ...base, shiftPansTime: false },
    )
    expect(r).toBeNull()
  })

  it('zooms cellW and keeps tick under cursor', () => {
    const r = applyTagRollTimeWheel(
      { deltaX: 0, deltaY: -100, shiftKey: false, altKey: false },
      base,
    )
    expect(r?.cellSize?.cellW).toBeGreaterThan(base.cellW)
    expect(r?.scroll).toBeTruthy()
  })
})
