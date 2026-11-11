/**
 * @vitest-environment happy-dom
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  cancelScheduledTunerPaint,
  scheduleTunerPaint,
  sizeTunerCanvas,
} from './canvasPaint'

describe('sizeTunerCanvas', () => {
  afterEach(() => {
    vi.stubGlobal('devicePixelRatio', 1)
  })

  it('caps dpr and respects maxPixels budget', () => {
    vi.stubGlobal('devicePixelRatio', 3)
    const canvas = {
      getBoundingClientRect: () => ({ width: 1000, height: 500 }),
      clientWidth: 1000,
      clientHeight: 500,
      width: 0,
      height: 0,
    } as unknown as HTMLCanvasElement
    const ctx = { setTransform: vi.fn() } as unknown as CanvasRenderingContext2D

    const sized = sizeTunerCanvas(canvas, ctx, { maxDpr: 2, maxPixels: 400_000 })
    expect(sized.cssW).toBe(1000)
    expect(sized.cssH).toBe(500)
    // √(400_000 / 500_000) ≈ 0.89 → floored to min 1
    expect(sized.dpr).toBe(1)
    expect(canvas.width).toBe(1000)
    expect(canvas.height).toBe(500)
    expect(ctx.setTransform).toHaveBeenCalledWith(1, 0, 0, 1, 0, 0)
  })

  it('accepts legacy maxDpr number', () => {
    vi.stubGlobal('devicePixelRatio', 3)
    const canvas = {
      getBoundingClientRect: () => ({ width: 200, height: 100 }),
      clientWidth: 200,
      clientHeight: 100,
      width: 0,
      height: 0,
    } as unknown as HTMLCanvasElement
    const ctx = { setTransform: vi.fn() } as unknown as CanvasRenderingContext2D
    const sized = sizeTunerCanvas(canvas, ctx, 1.5)
    expect(sized.dpr).toBe(1.5)
    expect(canvas.width).toBe(300)
    expect(canvas.height).toBe(150)
  })
})

describe('scheduleTunerPaint', () => {
  it('coalesces multiple requests into one frame', () => {
    const cbs: FrameRequestCallback[] = []
    const raf = vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation((cb) => {
      cbs.push(cb)
      return cbs.length
    })
    const caf = vi.spyOn(globalThis, 'cancelAnimationFrame').mockImplementation(() => undefined)

    const key = {}
    const paint = vi.fn()
    scheduleTunerPaint(key, paint)
    scheduleTunerPaint(key, paint)
    scheduleTunerPaint(key, paint)
    expect(paint).not.toHaveBeenCalled()
    expect(cbs).toHaveLength(1)
    cbs[0]!(0)
    expect(paint).toHaveBeenCalledTimes(1)
    cancelScheduledTunerPaint(key)
    raf.mockRestore()
    caf.mockRestore()
  })
})
