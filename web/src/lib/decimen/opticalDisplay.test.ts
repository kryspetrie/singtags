/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import { gridDims } from '../../../vendor/decimen/shared/qr-raster'
import { fitOpticalStageBox, fitOpticalStageCssPx, fitSourceToStage } from './opticalDisplay'

describe('fitOpticalStageCssPx', () => {
  it('fills most of a phone viewport in fullscreen at default scale 1', () => {
    const px = fitOpticalStageCssPx({
      viewportWidth: 390,
      viewportHeight: 844,
      containerWidth: 390,
      displayScale: 1,
      fullscreen: true,
      displayPx: 280,
    })
    expect(px).toBeCloseTo(390 * 0.98, 5)
  })

  it('uses measured stage box when provided', () => {
    const px = fitOpticalStageCssPx({
      viewportWidth: 1200,
      viewportHeight: 800,
      containerWidth: 1200,
      displayScale: 1,
      fullscreen: true,
      displayPx: 280,
      stageWidth: 900,
      stageHeight: 500,
    })
    expect(px).toBeCloseTo(500 * 0.995, 5)
  })

  it('caps non-fullscreen by displayPx × scale', () => {
    const px = fitOpticalStageCssPx({
      viewportWidth: 1200,
      viewportHeight: 800,
      containerWidth: 600,
      displayScale: 1,
      fullscreen: false,
      displayPx: 200,
    })
    expect(px).toBe(400)
  })
})

describe('fitOpticalStageBox', () => {
  it('returns a rectangular fullscreen stage near the panel size', () => {
    const box = fitOpticalStageBox({
      viewportWidth: 1200,
      viewportHeight: 800,
      containerWidth: 1200,
      displayScale: 1,
      fullscreen: true,
      displayPx: 280,
      stageWidth: 1000,
      stageHeight: 600,
    })
    expect(box.width).toBeCloseTo(1000 * 0.995, 5)
    expect(box.height).toBeCloseTo(600 * 0.995, 5)
  })

  it('shrinks from full when displayScale is below 1', () => {
    const full = fitOpticalStageBox({
      viewportWidth: 800,
      viewportHeight: 600,
      containerWidth: 800,
      displayScale: 1,
      fullscreen: true,
      displayPx: 280,
      stageWidth: 700,
      stageHeight: 400,
    })
    const half = fitOpticalStageBox({
      viewportWidth: 800,
      viewportHeight: 600,
      containerWidth: 800,
      displayScale: 0.5,
      fullscreen: true,
      displayPx: 280,
      stageWidth: 700,
      stageHeight: 400,
    })
    expect(half.width).toBeCloseTo(full.width * 0.5, 5)
  })
})

describe('fitSourceToStage', () => {
  it('downscales oversized large bitmaps to fit the stage', () => {
    const fit = fitSourceToStage({
      sourceWidth: 2000,
      sourceHeight: 2000,
      budgetWidth: 800,
      budgetHeight: 600,
      devicePixelRatio: 1,
    })
    expect(fit.cssWidth).toBeLessThanOrEqual(800)
    expect(fit.cssHeight).toBeLessThanOrEqual(600)
    expect(fit.cssWidth / fit.cssHeight).toBeCloseTo(1, 5)
    // Exact fill of the short edge.
    expect(fit.cssHeight).toBeCloseTo(600, 5)
  })

  it('uses integer module scale when it still nearly fills the stage', () => {
    const fit = fitSourceToStage({
      sourceWidth: 100,
      sourceHeight: 100,
      budgetWidth: 410,
      budgetHeight: 410,
      devicePixelRatio: 1,
      integerUpscale: true,
    })
    // floor(4.1)=4 → 400px still within 8% of exact 410 fill.
    expect(fit.canvasWidth).toBe(400)
    expect(fit.cssWidth).toBe(400)
  })

  it('falls back to exact fill when integer scale would waste the stage', () => {
    const fit = fitSourceToStage({
      sourceWidth: 100,
      sourceHeight: 100,
      budgetWidth: 390,
      budgetHeight: 390,
      devicePixelRatio: 1,
      integerUpscale: true,
    })
    // floor(3.9)=3 → 300px would waste >8%; exact fill uses 390.
    expect(fit.cssWidth).toBeCloseTo(390, 5)
    expect(fit.cssHeight).toBeCloseTo(390, 5)
  })

  it('fills a landscape stage with a 3×2 grid aspect', () => {
    const fit = fitSourceToStage({
      sourceWidth: 300,
      sourceHeight: 200,
      budgetWidth: 900,
      budgetHeight: 500,
      devicePixelRatio: 1,
    })
    expect(fit.cssWidth).toBeCloseTo(750, 5)
    expect(fit.cssHeight).toBeCloseTo(500, 5)
  })
})

describe('gridDims orientation', () => {
  it('uses 2×3 in portrait and 3×2 in landscape for six codes', () => {
    expect(gridDims(6)).toEqual({ cols: 2, rows: 3 })
    expect(gridDims(6, { width: 390, height: 844 })).toEqual({ cols: 2, rows: 3 })
    expect(gridDims(6, { width: 1200, height: 700 })).toEqual({ cols: 3, rows: 2 })
    expect(gridDims(6, { landscape: true })).toEqual({ cols: 3, rows: 2 })
  })

  it('uses 1×2 in portrait and 2×1 in landscape for two codes', () => {
    expect(gridDims(2, { width: 390, height: 844 })).toEqual({ cols: 1, rows: 2 })
    expect(gridDims(2, { width: 1200, height: 700 })).toEqual({ cols: 2, rows: 1 })
  })

  it('keeps square grids unchanged', () => {
    expect(gridDims(4, { landscape: true })).toEqual({ cols: 2, rows: 2 })
    expect(gridDims(9, { landscape: true })).toEqual({ cols: 3, rows: 3 })
  })
})
