import { describe, expect, it } from 'vitest'
import {
  DEFAULT_PDF_RENDER_DPI,
  MAX_PDF_CANVAS_EDGE,
  PDF_USER_SPACE_DPI,
  pdfRenderScale,
} from './pdfRender'

describe('pdfRenderScale', () => {
  it('defaults to 300 DPI (PDF user space is 72 DPI at scale 1)', () => {
    // US Letter width in PDF points
    const letterW = 612
    const letterH = 792
    const scale = pdfRenderScale(letterW, letterH)
    expect(scale).toBeCloseTo(DEFAULT_PDF_RENDER_DPI / PDF_USER_SPACE_DPI, 5)
    expect(letterW * scale).toBeCloseTo(2550, 0) // 8.5" × 300
    expect(letterH * scale).toBeCloseTo(3300, 0) // 11" × 300
  })

  it('honors an explicit dpi', () => {
    expect(pdfRenderScale(612, 792, { dpi: 150 })).toBeCloseTo(150 / 72, 5)
  })

  it('caps the longest edge for huge pages', () => {
    const hugeW = 4000
    const hugeH = 4000
    const scale = pdfRenderScale(hugeW, hugeH, { dpi: 300 })
    expect(Math.max(hugeW * scale, hugeH * scale)).toBeLessThanOrEqual(MAX_PDF_CANVAS_EDGE + 0.5)
  })

  it('supports legacy targetWidth without dpi', () => {
    const scale = pdfRenderScale(612, 792, { targetWidth: 960 })
    // happy-dom / node: devicePixelRatio typically 1
    expect(scale).toBeCloseTo(960 / 612, 5)
  })
})
