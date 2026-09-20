import { describe, expect, it } from 'vitest'
import { TAG_ROLL_PPQ } from './types'
import {
  clampCellW,
  minCellWToFillRoll,
  minPxPerBeatToFillSheet,
  rollContentWidthPx,
  sheetScoreContentWidthPx,
  SHEET_LEFT_PAD,
  SHEET_RIGHT_PAD,
} from './zoomFill'

const TS = { numerator: 4, denominator: 4 } as const

describe('zoomFill', () => {
  it('minCellWToFillRoll keeps roll content at least viewport-wide', () => {
    const lengthTicks = TAG_ROLL_PPQ * 16 // 4 measures @ 4/4
    const vp = 800
    const min = minCellWToFillRoll(vp, lengthTicks, TAG_ROLL_PPQ)
    expect(rollContentWidthPx(min, lengthTicks, TAG_ROLL_PPQ)).toBeGreaterThanOrEqual(vp)
    expect(rollContentWidthPx(min - 1, lengthTicks, TAG_ROLL_PPQ)).toBeLessThan(vp)
  })

  it('minPxPerBeatToFillSheet keeps sheet measures at least viewport-wide', () => {
    const lengthTicks = TAG_ROLL_PPQ * 16
    const vp = 900
    const min = minPxPerBeatToFillSheet(vp, lengthTicks, TS, TAG_ROLL_PPQ)
    expect(sheetScoreContentWidthPx(min, lengthTicks, TS, TAG_ROLL_PPQ)).toBeGreaterThanOrEqual(
      vp,
    )
    // One px-per-beat lower should leave empty gutter (unless clamped to absolute min).
    const below = Math.max(1, min - 1)
    if (below < min) {
      expect(sheetScoreContentWidthPx(below, lengthTicks, TS, TAG_ROLL_PPQ)).toBeLessThan(vp)
    }
  })

  it('sheet fill ignores the 120px measure floor for zoom-out', () => {
    // Wide viewport + few measures: formula min must exceed what a 120px-wide
    // measure would imply, while still staying within CELL_W_MAX.
    const lengthTicks = TAG_ROLL_PPQ * 8 // 2 measures
    const vp = 800
    const min = minPxPerBeatToFillSheet(vp, lengthTicks, TS, TAG_ROLL_PPQ)
    const content = sheetScoreContentWidthPx(min, lengthTicks, TS, TAG_ROLL_PPQ)
    expect(content).toBeGreaterThanOrEqual(vp)
    // At this zoom, measures are wider than the readable-minimum floor.
    expect(content - SHEET_LEFT_PAD - SHEET_RIGHT_PAD).toBeGreaterThan(120 * 2)
  })

  it('clampCellW respects a raised floor', () => {
    expect(clampCellW(10, 40)).toBe(40)
    expect(clampCellW(80, 40)).toBe(80)
  })
})
