import { describe, expect, it } from 'vitest'
import {
  layoutNonOverlappingLabels,
  scaleGuideLinesInBand,
  scalePitchClasses,
} from './scaleGuideLines'

describe('scalePitchClasses', () => {
  it('lists C major degrees', () => {
    expect(scalePitchClasses(0, 'major')).toEqual([0, 2, 4, 5, 7, 9, 11])
  })
})

describe('scaleGuideLinesInBand', () => {
  it('includes A4 for A major around singing range', () => {
    const lines = scaleGuideLinesInBand({
      fMinHz: 200,
      fMaxHz: 800,
      a4Hz: 440,
      keyPc: 9,
      scaleMode: 'major',
    })
    expect(lines.some((l) => Math.abs(l.hz - 440) < 0.5 && l.tonic)).toBe(true)
  })
})

describe('layoutNonOverlappingLabels', () => {
  it('dedupes same text and spaces neighbors', () => {
    const out = layoutNonOverlappingLabels(
      [
        { x: 100, text: 'A4', salience: 0.5 },
        { x: 102, text: 'A4', salience: 0.9 },
        { x: 110, text: 'B4', salience: 0.8 },
      ],
      { minGapPx: 24, width: 400 },
    )
    expect(out).toHaveLength(2)
    expect(out[0]!.text).toBe('A4')
    expect(out[1]!.drawX - out[0]!.drawX).toBeGreaterThanOrEqual(24)
  })
})
