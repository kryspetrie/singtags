import { describe, expect, it } from 'vitest'
import {
  clampSheetZoom,
  centerSheetZoomPan,
  fitAllScale,
  fitSheetZoomPan,
  fitWidthScale,
  identitySheetZoomPan,
  panSheet,
  sheetZoomPanCss,
  wheelZoomFactor,
  zoomSheetAt,
  SHEET_ZOOM_MAX,
  SHEET_ZOOM_MIN,
} from './sheetZoomPan'

describe('sheetZoomPan', () => {
  it('clamps zoom to min/max', () => {
    expect(clampSheetZoom(0.01)).toBe(SHEET_ZOOM_MIN)
    expect(clampSheetZoom(99)).toBe(SHEET_ZOOM_MAX)
    expect(clampSheetZoom(2)).toBe(2)
  })

  it('allows zooming out below fit-width (scale < 1)', () => {
    expect(SHEET_ZOOM_MIN).toBeLessThan(1)
    expect(clampSheetZoom(0.5)).toBe(0.5)
  })

  it('keeps the content point under the pointer when zooming', () => {
    const start = identitySheetZoomPan()
    const mid = zoomSheetAt(start, 100, 80, 2)
    expect(mid.scale).toBe(2)
    expect((100 - mid.panX) / mid.scale).toBeCloseTo(100, 5)
    expect((80 - mid.panY) / mid.scale).toBeCloseTo(80, 5)

    const again = zoomSheetAt(mid, 100, 80, 3)
    expect((100 - again.panX) / again.scale).toBeCloseTo(100, 5)
    expect((80 - again.panY) / again.scale).toBeCloseTo(80, 5)
  })

  it('pans by delta', () => {
    const s = panSheet({ scale: 2, panX: 10, panY: -5 }, 4, 7)
    expect(s).toEqual({ scale: 2, panX: 14, panY: 2 })
  })

  it('wheel zoom factor zooms in on negative deltaY', () => {
    expect(wheelZoomFactor(-100)).toBeGreaterThan(1)
    expect(wheelZoomFactor(100)).toBeLessThan(1)
  })

  it('formats css transform', () => {
    expect(sheetZoomPanCss({ scale: 1.5, panX: 10, panY: -20 })).toBe(
      'translate(10px, -20px) scale(1.5)',
    )
  })

  it('centers content in the viewport', () => {
    const c = centerSheetZoomPan(0.5, { width: 400, height: 800 }, { width: 400, height: 1000 })
    expect(c.scale).toBe(0.5)
    expect(c.panX).toBeCloseTo((400 - 200) / 2, 5)
    expect(c.panY).toBeCloseTo((800 - 500) / 2, 5)
  })

  it('fit-width uses viewport/content width and centers', () => {
    const vp = { width: 400, height: 600 }
    const content = { width: 400, height: 1200 }
    expect(fitWidthScale(vp, content)).toBe(1)
    const s = fitSheetZoomPan('width', vp, content)
    expect(s.scale).toBe(1)
    expect(s.panX).toBe(0)
    expect(s.panY).toBeCloseTo((600 - 1200) / 2, 5)
  })

  it('fit-all scales to the limiting dimension and centers', () => {
    const vp = { width: 400, height: 600 }
    const content = { width: 400, height: 1200 }
    expect(fitAllScale(vp, content)).toBeCloseTo(0.5, 5)
    const s = fitSheetZoomPan('all', vp, content)
    expect(s.scale).toBeCloseTo(0.5, 5)
    expect(s.panX).toBeCloseTo(100, 5)
    expect(s.panY).toBeCloseTo(0, 5)
  })
})
