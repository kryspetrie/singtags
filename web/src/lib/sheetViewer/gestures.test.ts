/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it } from 'vitest'
import {
  PAGE_SWIPE_MIN_PX,
  isChromeTarget,
  layoutScaleFromViewport,
  pageSwipeDelta,
  pointerDistance,
  pointerMidpointClient,
  shouldTriggerPageSwipe,
  viewportPointFromClient,
} from './gestures'

describe('sheetViewer/gestures', () => {
  it('pointerDistance and midpoint', () => {
    const pts = [
      { id: 1, x: 0, y: 0 },
      { id: 2, x: 3, y: 4 },
    ]
    expect(pointerDistance(pts)).toBe(5)
    expect(pointerMidpointClient(pts)).toEqual({ x: 1.5, y: 2 })
  })

  it('isChromeTarget detects chrome and piano dock', () => {
    document.body.innerHTML =
      '<div class="chrome"><button id="b"></button></div><div class="sheet-piano-dock"><span id="p"></span></div>'
    expect(isChromeTarget(document.getElementById('b'))).toBe(true)
    expect(isChromeTarget(document.getElementById('p'))).toBe(true)
    expect(isChromeTarget(document.body)).toBe(false)
  })

  it('layoutScaleFromViewport maps client coords under zoom', () => {
    const el = document.createElement('div')
    Object.defineProperty(el, 'clientWidth', { value: 200 })
    Object.defineProperty(el, 'clientHeight', { value: 100 })
    el.getBoundingClientRect = () =>
      ({ left: 10, top: 20, width: 100, height: 50 }) as DOMRect
    const pt = viewportPointFromClient(el, 60, 45)
    expect(pt.x).toBeCloseTo(100)
    expect(pt.y).toBeCloseTo(50)
  })

  it('shouldTriggerPageSwipe respects fit scale and axis dominance', () => {
    const base = {
      fsScrollMode: false,
      pageCount: 2,
      scale: 1,
      fitScale: 1,
      gesturePanX: -PAGE_SWIPE_MIN_PX,
      gesturePanY: 0,
    }
    expect(shouldTriggerPageSwipe(base)).toBe(true)
    expect(shouldTriggerPageSwipe({ ...base, scale: 2 })).toBe(false)
    expect(shouldTriggerPageSwipe({ ...base, gesturePanY: PAGE_SWIPE_MIN_PX })).toBe(false)
  })

  it('pageSwipeDelta maps horizontal direction to page delta', () => {
    expect(pageSwipeDelta(-80)).toBe(1)
    expect(pageSwipeDelta(80)).toBe(-1)
  })
})
