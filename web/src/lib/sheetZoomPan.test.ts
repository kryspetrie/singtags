import { describe, expect, it } from 'vitest'
import {
  clampSheetZoom,
  clampSheetPan,
  centerSheetZoomPan,
  chooseSheetFitMode,
  fitAllScale,
  fitSheetZoomPan,
  fitWidthScale,
  identitySheetZoomPan,
  panSheet,
  preserveSheetCenter,
  sheetZoomMinScale,
  sheetZoomPanCss,
  sheetZoomPansNearlyEqual,
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

  it('fit-width uses viewport/content width and top-aligns below chrome inset', () => {
    const vp = { width: 400, height: 600 }
    const content = { width: 400, height: 1200 }
    expect(fitWidthScale(vp, content)).toBe(1)
    const s = fitSheetZoomPan('width', vp, content, { insets: { top: 72, bottom: 0 } })
    expect(s.scale).toBe(1)
    expect(s.panX).toBe(0)
    expect(s.panY).toBe(72)
  })

  it('fit-all scales to the usable band and centers in it', () => {
    const vp = { width: 400, height: 680 }
    const content = { width: 400, height: 1200 }
    const insets = { top: 80, bottom: 0 }
    // usable height 600 → fit-all 0.5
    expect(fitAllScale({ width: 400, height: 600 }, content)).toBeCloseTo(0.5, 5)
    const s = fitSheetZoomPan('all', vp, content, { insets })
    expect(s.scale).toBeCloseTo(0.5, 5)
    expect(s.panX).toBeCloseTo(100, 5)
    expect(s.panY).toBeCloseTo(80, 5)
  })

  it('chooses fit-all when content fits at width in the usable band', () => {
    expect(
      chooseSheetFitMode(
        { width: 400, height: 880 },
        { width: 400, height: 600 },
        0.28,
        { top: 80, bottom: 0 },
      ),
    ).toBe('all')
  })

  it('treats nearly-equal zoom/pan states as equal', () => {
    expect(
      sheetZoomPansNearlyEqual(
        { scale: 1, panX: 0, panY: 10 },
        { scale: 1.001, panX: 0.2, panY: 10.4 },
      ),
    ).toBe(true)
    expect(
      sheetZoomPansNearlyEqual(
        { scale: 1, panX: 0, panY: 0 },
        { scale: 0.5, panX: 0, panY: 0 },
      ),
    ).toBe(false)
  })

  it('clamped fit-width and fit-all match when the page already fits at width', () => {
    const vp = { width: 400, height: 800 }
    const content = { width: 400, height: 500 }
    const insets = { top: 60, bottom: 0 }
    const widthFit = clampSheetPan(
      fitSheetZoomPan('width', vp, content, { insets }),
      vp,
      content,
      insets,
    )
    const allFit = clampSheetPan(
      fitSheetZoomPan('all', vp, content, { insets }),
      vp,
      content,
      insets,
    )
    expect(sheetZoomPansNearlyEqual(widthFit, allFit)).toBe(true)
  })

  it('chooses fit-width when fit-all would pillarbox heavily', () => {
    expect(
      chooseSheetFitMode({ width: 400, height: 600 }, { width: 400, height: 1200 }),
    ).toBe('width')
  })

  it('chooses fit-all when pillarboxing is mild', () => {
    expect(
      chooseSheetFitMode({ width: 400, height: 600 }, { width: 400, height: 700 }, 0.28),
    ).toBe('all')
  })

  it('sheetZoomMinScale is fit-all in the usable band', () => {
    const vp = { width: 400, height: 680 }
    const content = { width: 400, height: 1200 }
    expect(sheetZoomMinScale(vp, content, { top: 80, bottom: 0 })).toBeCloseTo(0.5, 5)
  })

  it('clampSheetPan centers short content below top inset and blocks side scroll', () => {
    const clamped = clampSheetPan(
      { scale: 1, panX: 40, panY: -20 },
      { width: 400, height: 600 },
      { width: 400, height: 400 },
      { top: 80, bottom: 0 },
    )
    expect(clamped.panX).toBe(0)
    expect(clamped.panY).toBeCloseTo(80 + (520 - 400) / 2, 5)
  })

  it('clampSheetPan allows vertical pan for tall fit-width but keeps top reachable', () => {
    const clamped = clampSheetPan(
      { scale: 1, panX: 0, panY: 80 },
      { width: 400, height: 600 },
      { width: 400, height: 1200 },
      { top: 80, bottom: 0 },
    )
    expect(clamped.panY).toBe(80)
    const scrolled = clampSheetPan(
      { scale: 1, panX: 0, panY: -900 },
      { width: 400, height: 600 },
      { width: 400, height: 1200 },
      { top: 80, bottom: 0 },
    )
    expect(scrolled.panY).toBeCloseTo(600 - 1200, 5)
  })

  it('preserveSheetCenter keeps the same relative content point centered', () => {
    const state = { scale: 2, panX: -100, panY: -200 }
    const prevVp = { width: 400, height: 600 }
    const prevContent = { width: 400, height: 800 }
    // Content point at center: ((200 - (-100))/2, (300 - (-200))/2) = (150, 250)
    const next = preserveSheetCenter(
      state,
      prevVp,
      prevContent,
      { width: 800, height: 600 },
      { width: 800, height: 800 },
    )
    expect(next.scale).toBe(2)
    const cx = (800 / 2 - next.panX) / next.scale
    const cy = (600 / 2 - next.panY) / next.scale
    expect(cx / 800).toBeCloseTo(150 / 400, 5)
    expect(cy / 800).toBeCloseTo(250 / 800, 5)
  })
})
