import { describe, expect, it } from 'vitest'
import {
  barCenterX,
  barCountFor,
  bracketCenterX,
  bracketHitX,
  bracketSpan,
  bracketsFitInWidth,
  BRACKET_INNER_EXTENT,
  BRACKET_TOTAL_W,
  clampMarkA,
  clampMarkB,
  guttersForWidth,
  MIN_GUTTER_PAD,
  minLoopGapSec,
  timeToX,
  waveformLayout,
  xToTime,
} from './waveformLayout'

describe('waveformLayout', () => {
  const lay = waveformLayout(800, 104)!
  const { gutterPad, trackInner } = lay

  it('keeps gutters wide enough for full bracket bounding boxes', () => {
    for (const w of [280, 420, 800]) {
      const pad = guttersForWidth(w)
      expect(pad).toBeGreaterThanOrEqual(MIN_GUTTER_PAD)
      expect(pad).toBeGreaterThanOrEqual(BRACKET_TOTAL_W)
      expect(bracketsFitInWidth(w, pad)).toBe(true)
    }
  })

  it('shares one time→x scale for bar centers and loop-edge positions', () => {
    const duration = 120
    const t = 37.5
    const x = timeToX(t, duration, gutterPad, trackInner)
    const bars = barCountFor(280, trackInner)
    const barIdx = Math.min(bars - 1, Math.floor((t / duration) * bars))
    expect(barCenterX(barIdx, bars, gutterPad, trackInner)).toBeCloseTo(x, 0)
    expect(xToTime(x, duration, gutterPad, trackInner)).toBeCloseTo(t, 5)
  })

  it('places loop edge on the inner face of each bracket bounding box', () => {
    const edge = 100
    const left = bracketSpan(edge, 'left')
    const right = bracketSpan(edge, 'right')
    expect(left.right).toBe(edge)
    expect(right.left).toBe(edge)
    expect(left.right - left.left).toBe(BRACKET_TOTAL_W)
    expect(right.right - right.left).toBe(BRACKET_TOTAL_W)
    expect(bracketCenterX(edge, 'left')).toBe(edge - BRACKET_INNER_EXTENT)
    expect(bracketCenterX(edge, 'right')).toBe(edge + BRACKET_INNER_EXTENT)
  })

  it('keeps default bracket graphics inside the component at track edges', () => {
    const duration = 90
    const x0 = timeToX(0, duration, gutterPad, trackInner)
    const x1 = timeToX(duration, duration, gutterPad, trackInner)
    expect(bracketSpan(x0, 'left').left).toBeGreaterThanOrEqual(0)
    expect(bracketSpan(x1, 'right').right).toBeLessThanOrEqual(lay.w)
  })

  it('places t=0 and t=duration on the gutter borders (track edges)', () => {
    const duration = 120
    expect(timeToX(0, duration, gutterPad, trackInner)).toBe(gutterPad)
    expect(timeToX(duration, duration, gutterPad, trackInner)).toBeCloseTo(
      gutterPad + trackInner,
      5,
    )
  })

  it('round-trips x ↔ time on the single track timeline', () => {
    const duration = 90
    for (const t of [0, 12.25, 45, 89.5]) {
      const x = timeToX(t, duration, gutterPad, trackInner)
      expect(xToTime(x, duration, gutterPad, trackInner)).toBeCloseTo(t, 5)
    }
  })

  it('aligns bar centers with timeToX at every bar index', () => {
    const duration = 100
    const bars = barCountFor(280, trackInner)
    for (let i = 0; i < bars; i++) {
      const t = ((i + 0.5) / bars) * duration
      const xBar = barCenterX(i, bars, gutterPad, trackInner)
      const xTime = timeToX(t, duration, gutterPad, trackInner)
      expect(xBar).toBeCloseTo(xTime, 10)
    }
  })

  it('offsets bracket hit centers outside the loop edge', () => {
    expect(bracketHitX(100, 'left')).toBeLessThan(100)
    expect(bracketHitX(100, 'right')).toBeGreaterThan(100)
  })

  it('enforces minimum loop region when clamping marks', () => {
    const duration = 120
    const gap = minLoopGapSec(duration)
    expect(clampMarkB(10, 0, duration)).toBe(10)
    expect(clampMarkB(0.2, 0, duration)).toBe(gap)
    expect(clampMarkA(110, 120, duration)).toBe(110)
    expect(clampMarkA(119.8, 120, duration)).toBe(120 - gap)
  })

  it('uses full track as min gap when shorter than MIN_LOOP_REGION_SEC', () => {
    expect(minLoopGapSec(0.3)).toBe(0.3)
    expect(clampMarkA(0.2, 0.3, 0.3)).toBe(0)
    expect(clampMarkB(0.1, 0, 0.3)).toBe(0.3)
  })
})
