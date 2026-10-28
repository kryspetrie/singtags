import { describe, expect, it } from 'vitest'
import {
  estimateLyricBackdropWidthPx,
  isSheetLyricPartVisible,
  lyricBackdropBox,
  lyricLaneClearancePx,
  maxStraightLyricAboveExtentPx,
  straightLyricAboveExtentPx,
  straightLyricLaneY,
  straightLyricStaveGapExtra,
} from './sheetLyricLanes'

describe('sheetLyricLanes', () => {
  it('clears typical stem tips past the staff edge', () => {
    // ~3.5 spaces + font pad — sits in the white space beyond stems.
    expect(lyricLaneClearancePx(11, 10)).toBeGreaterThanOrEqual(35)
    expect(lyricLaneClearancePx(11, 10)).toBeLessThan(50)
    expect(lyricLaneClearancePx(14, 10)).toBeGreaterThan(lyricLaneClearancePx(11, 10))
  })

  it('adds stave-gap room for two stem-cleared lyric lanes', () => {
    expect(straightLyricStaveGapExtra(11, 10)).toBeGreaterThanOrEqual(1.5)
    expect(straightLyricStaveGapExtra(11, 10)).toBeLessThan(8)
  })

  it('places above/below lanes past stem tips (or staff fallback)', () => {
    const aboveStaff = straightLyricLaneY('above', 100, null, 11, 10, 0)
    expect(aboveStaff).toBe(100 - lyricLaneClearancePx(11, 10))
    // Stem tip closer to staff than fallback → still use fallback.
    expect(straightLyricLaneY('above', 100, 90, 11, 10, 0)).toBe(aboveStaff)
    // Stem tip past fallback → sit just beyond the tip.
    expect(straightLyricLaneY('above', 100, 50, 11, 10, 0)).toBeLessThan(50)

    const belowStaff = straightLyricLaneY('below', 140, null, 11, 10, 0)
    expect(belowStaff).toBe(140 + lyricLaneClearancePx(11, 10))
    expect(straightLyricLaneY('below', 140, 200, 11, 10, 0)).toBeGreaterThan(200)
  })

  it('respects global and per-part lyric visibility', () => {
    expect(
      isSheetLyricPartVisible(
        { sheetShowLyrics: true, sheetLyricPartVisible: {} },
        't',
      ),
    ).toBe(true)
    expect(
      isSheetLyricPartVisible(
        { sheetShowLyrics: true, sheetLyricPartVisible: { t: false } },
        't',
      ),
    ).toBe(false)
    expect(
      isSheetLyricPartVisible(
        { sheetShowLyrics: false, sheetLyricPartVisible: {} },
        't',
      ),
    ).toBe(false)
  })

  it('sizes a white lyric backdrop around the syllable', () => {
    const w = estimateLyricBackdropWidthPx('Love', 11)
    expect(w).toBeGreaterThan(20)
    const above = lyricBackdropBox(100, 50, 'Love', 11, 'above')
    expect(above.x).toBeLessThan(100)
    expect(above.y + above.height).toBeGreaterThan(50 - 4)
    const below = lyricBackdropBox(100, 80, 'Love', 11, 'below')
    expect(below.y).toBeLessThanOrEqual(80)
  })

  it('grows above-staff extent with positive nudge', () => {
    const base = straightLyricAboveExtentPx(11, 0)
    expect(straightLyricAboveExtentPx(11, 2)).toBeGreaterThan(base)
    expect(
      maxStraightLyricAboveExtentPx(11, { t: 2 }, ['t'], () => true),
    ).toBe(straightLyricAboveExtentPx(11, 2))
    expect(
      maxStraightLyricAboveExtentPx(11, { t: 2 }, ['t'], () => false),
    ).toBe(0)
  })
})
