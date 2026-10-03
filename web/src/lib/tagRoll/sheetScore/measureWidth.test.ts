import { describe, expect, it } from 'vitest'
import {
  contentSizedMeasureBodyPx,
  onsetColumnPx,
  scaledEqualMeasureBodyPx,
} from './measureWidth'
import { sheetMeasureWidthPx } from '../zoomFill'

describe('contentSizedMeasureBodyPx', () => {
  const ppb = 40
  const equalRef = scaledEqualMeasureBodyPx(
    sheetMeasureWidthPx(ppb, { numerator: 4, denominator: 4 }, 480),
    1,
    120,
  )

  it('makes sparse bars clearly narrower than Equal', () => {
    const sparse = contentSizedMeasureBodyPx({
      onsetCount: 1,
      beatsInMeasure: 4,
      pxPerBeat: ppb,
      equalReferencePx: equalRef,
    })
    expect(sparse).toBeLessThan(equalRef * 0.55)
    expect(equalRef).toBeGreaterThan(200)
  })

  it('grows with onset columns so eighth runs stay readable', () => {
    const sparse = contentSizedMeasureBodyPx({
      onsetCount: 1,
      beatsInMeasure: 4,
      pxPerBeat: ppb,
      equalReferencePx: equalRef,
    })
    const eighths = contentSizedMeasureBodyPx({
      onsetCount: 8,
      beatsInMeasure: 4,
      pxPerBeat: ppb,
      equalReferencePx: equalRef,
    })
    const sixteenths = contentSizedMeasureBodyPx({
      onsetCount: 16,
      beatsInMeasure: 4,
      pxPerBeat: ppb,
      equalReferencePx: equalRef,
    })
    expect(eighths).toBeGreaterThan(sparse)
    expect(sixteenths).toBeGreaterThan(eighths)
    expect(eighths).toBeGreaterThanOrEqual(onsetColumnPx(ppb) * 8)
  })

  it('empty measures are tighter than a single onset', () => {
    const empty = contentSizedMeasureBodyPx({
      onsetCount: 0,
      beatsInMeasure: 4,
      pxPerBeat: ppb,
      equalReferencePx: equalRef,
    })
    const one = contentSizedMeasureBodyPx({
      onsetCount: 1,
      beatsInMeasure: 4,
      pxPerBeat: ppb,
      equalReferencePx: equalRef,
    })
    expect(empty).toBeLessThanOrEqual(one)
  })

  it('honors measureScale and noteSpacing', () => {
    const base = contentSizedMeasureBodyPx({
      onsetCount: 8,
      beatsInMeasure: 4,
      pxPerBeat: ppb,
      equalReferencePx: equalRef,
      measureScale: 1,
      noteSpacing: 1,
    })
    const wide = contentSizedMeasureBodyPx({
      onsetCount: 8,
      beatsInMeasure: 4,
      pxPerBeat: ppb,
      equalReferencePx: equalRef,
      measureScale: 1.2,
      noteSpacing: 1.3,
    })
    expect(wide).toBeGreaterThan(base)
  })

  it('scaledEqualMeasureBodyPx clamps and scales', () => {
    expect(scaledEqualMeasureBodyPx(200, 1)).toBe(200)
    expect(scaledEqualMeasureBodyPx(200, 1.5)).toBe(300)
    expect(scaledEqualMeasureBodyPx(200, 0.4)).toBeGreaterThanOrEqual(120)
  })
})
