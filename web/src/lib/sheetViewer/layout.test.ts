/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it } from 'vitest'
import {
  computeChromeLayout,
  flexContentWidth,
  measureChromeInsetsFromDom,
  measureViewportAndContentFromDom,
} from './layout'

describe('sheetViewer/layout', () => {
  it('measureViewportAndContentFromDom prefers paging page box', () => {
    expect(
      measureViewportAndContentFromDom({
        sheetClientWidth: 400,
        sheetClientHeight: 600,
        stageOffsetWidth: 0,
        stageScrollHeight: 0,
        pagingPage: { width: 300, height: 500 },
      }),
    ).toEqual({
      viewport: { width: 400, height: 600 },
      content: { width: 300, height: 500 },
    })
  })

  it('measureChromeInsetsFromDom reserves top space for upper overlay', () => {
    const sheet = document.createElement('div')
    Object.defineProperty(sheet, 'clientHeight', { value: 800 })
    sheet.getBoundingClientRect = () =>
      ({ top: 0, bottom: 800, left: 0, right: 400, width: 400, height: 800 }) as DOMRect

    const overlay = document.createElement('div')
    overlay.getBoundingClientRect = () =>
      ({ top: 0, bottom: 72, left: 0, right: 400, width: 400, height: 72 }) as DOMRect

    const insets = measureChromeInsetsFromDom(sheet, overlay)
    expect(insets.top).toBeGreaterThan(70)
    expect(insets.bottom).toBe(0)
  })

  it('flexContentWidth sums children and gaps', () => {
    const row = document.createElement('div')
    const a = document.createElement('span')
    const b = document.createElement('span')
    Object.defineProperty(a, 'offsetWidth', { value: 40 })
    Object.defineProperty(b, 'offsetWidth', { value: 60 })
    row.append(a, b)
    expect(flexContentWidth(row, 10)).toBe(110)
  })

  it('computeChromeLayout collapses pitch on narrow widths', () => {
    expect(
      computeChromeLayout({
        width: 500,
        multipage: false,
        chromeCompact: true,
        playbackOpen: false,
        pitchWidth: 80,
        trailingWidth: 120,
        gap: 7,
        playContentWidth: 0,
        moreContentWidth: 0,
      }).pitchCompact,
    ).toBe(true)
  })

  it('computeChromeLayout moves playback below when play row is too wide', () => {
    expect(
      computeChromeLayout({
        width: 400,
        multipage: true,
        chromeCompact: false,
        playbackOpen: true,
        pitchWidth: 80,
        trailingWidth: 120,
        gap: 7,
        playContentWidth: 500,
        moreContentWidth: 0,
      }),
    ).toEqual({ pitchCompact: true, playbackBelow: true, moreInline: true })
  })
})
