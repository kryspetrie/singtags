import { describe, expect, it } from 'vitest'
import { clampSheetMeasureScale, defaultSheetFormat } from './sheetFormat'
import { SHEET_MEASURE_SCALE_MAX, SHEET_MEASURE_SCALE_MIN } from './sheetFormat'

describe('sheetFormat', () => {
  it('clamps measure scale to extended range', () => {
    expect(clampSheetMeasureScale(0.1, 1)).toBe(SHEET_MEASURE_SCALE_MIN)
    expect(clampSheetMeasureScale(9, 1)).toBe(SHEET_MEASURE_SCALE_MAX)
    expect(clampSheetMeasureScale(1.55, 1)).toBe(1.55)
  })

  it('defaultSheetFormat matches project defaults', () => {
    const d = defaultSheetFormat()
    expect(d.sheetMeasureScale).toBe(1)
    expect(d.sheetLyricSize).toBe(11)
    expect(d.sheetShowEngravedHeader).toBe(true)
    expect(d.sheetMusicFont).toBe('bravura')
    expect(d.sheetPartNames).toBe(false)
    expect(d.sheetMarginLeftIn).toBe(0.3)
    expect(d.sheetEngravingScale).toBe(0.9)
    expect(d.sheetScoreScale).toBe(0.95)
  })
})
