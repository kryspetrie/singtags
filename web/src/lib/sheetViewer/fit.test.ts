/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it } from 'vitest'
import {
  clampedFitZoomPan,
  clampedZoomPan,
  initialFullscreenFitMode,
  isFitCycleDisabled,
} from './fit'
import { identitySheetZoomPan } from '../sheetZoomPan'

describe('sheetViewer/fit', () => {
  const viewport = { width: 400, height: 800 }
  const content = { width: 400, height: 1200 }
  const insets = { top: 72, bottom: 0 }

  it('initialFullscreenFitMode picks scroll vs paging defaults', () => {
    expect(
      initialFullscreenFitMode({
        pageCount: 2,
        sheetFsPageMode: 'scroll',
        measured: { viewport, content },
        insets,
      }),
    ).toBe('width')
    expect(
      initialFullscreenFitMode({
        pageCount: 2,
        sheetFsPageMode: 'paging',
        measured: { viewport, content },
        insets,
      }),
    ).toBe('all')
  })

  it('clampedFitZoomPan top-aligns fit width below chrome', () => {
    const zp = clampedFitZoomPan('width', viewport, content, insets)
    expect(zp.panY).toBe(72)
  })

  it('clampedZoomPan enforces min scale', () => {
    const zp = clampedZoomPan({ scale: 0.001, panX: 0, panY: 0 }, viewport, content, insets)
    expect(zp.scale).toBeGreaterThan(0.001)
  })

  it('isFitCycleDisabled is true when target is missing or nearly equal', () => {
    expect(isFitCycleDisabled(identitySheetZoomPan(), null)).toBe(true)
    expect(isFitCycleDisabled(identitySheetZoomPan(), identitySheetZoomPan())).toBe(true)
  })
})
