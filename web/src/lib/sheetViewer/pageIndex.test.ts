/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it } from 'vitest'
import {
  clampPageIndex,
  nextPageIndex,
  pageIndexFromContentMidpoint,
  panYForPageTop,
  resetPageIndexOnPagesChange,
  viewMidContentY,
} from './pageIndex'

describe('sheetViewer/pageIndex', () => {
  const pages = [
    { offsetTop: 0, offsetHeight: 100 },
    { offsetTop: 100, offsetHeight: 100 },
    { offsetTop: 200, offsetHeight: 100 },
  ]

  it('pageIndexFromContentMidpoint picks nearest page center', () => {
    expect(pageIndexFromContentMidpoint(pages, 50)).toBe(0)
    expect(pageIndexFromContentMidpoint(pages, 150)).toBe(1)
    expect(pageIndexFromContentMidpoint(pages, 250)).toBe(2)
  })

  it('viewMidContentY converts pan to content coordinates', () => {
    expect(viewMidContentY(400, 0, 2)).toBe(100)
  })

  it('nextPageIndex clamps to page range', () => {
    expect(nextPageIndex(0, 1, 3)).toBe(1)
    expect(nextPageIndex(2, 1, 3)).toBe(2)
    expect(nextPageIndex(0, -5, 3)).toBe(0)
  })

  it('panYForPageTop aligns page top under chrome inset', () => {
    expect(panYForPageTop(100, 2, 16)).toBe(-184)
  })

  it('resetPageIndexOnPagesChange resets when count changes', () => {
    expect(resetPageIndexOnPagesChange(2, 3, 3)).toBe(2)
    expect(resetPageIndexOnPagesChange(2, 2, 3)).toBe(0)
    expect(resetPageIndexOnPagesChange(5, 3, 2)).toBe(0)
  })

  it('clampPageIndex handles empty page sets', () => {
    expect(clampPageIndex(3, 0)).toBe(0)
  })
})
