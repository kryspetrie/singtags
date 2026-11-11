import { describe, expect, it } from 'vitest'
import { frameMagnitudeBins } from './spectrogramBins'
import {
  clearSpectrogramRing,
  createSpectrogramRing,
  fractionAtHz,
  hzAtFraction,
  pushSpectrogramColumn,
} from './spectrogramRing'
import { synthStackFrame } from './synthAudioFrame'

describe('spectrogramRing', () => {
  it('caps columns and clears', () => {
    const ring = createSpectrogramRing(16, 5)
    for (let i = 0; i < 8; i++) {
      const dropped = pushSpectrogramColumn(ring, new Float32Array(16).fill(i + 1))
      if (i >= 5) expect(dropped).toBeGreaterThan(0)
    }
    expect(ring.columns).toHaveLength(5)
    clearSpectrogramRing(ring)
    expect(ring.columns).toHaveLength(0)
  })

  it('builds magnitude bins for a sine (linear + log)', () => {
    const sr = 48_000
    const frame = synthStackFrame([440], sr, 2048, 0.5)
    const lin = frameMagnitudeBins(frame, sr, {
      binCount: 32,
      fMinHz: 80,
      fMaxHz: 1000,
      scale: 'linear',
    })
    const log = frameMagnitudeBins(frame, sr, {
      binCount: 32,
      fMinHz: 80,
      fMaxHz: 1000,
      scale: 'log',
    })
    expect(lin.length).toBe(32)
    expect(log.length).toBe(32)
    expect(Math.max(...lin)).toBeGreaterThan(0)
    expect(Math.max(...log)).toBeGreaterThan(0)
  })

  it('maps log axis round-trip at midpoints', () => {
    const ring = createSpectrogramRing(64, 40, { fMinHz: 100, fMaxHz: 1600, scale: 'log' })
    const mid = hzAtFraction(ring, 0.5)
    expect(mid).toBeCloseTo(400, 0) // geometric mean of 100 and 1600
    expect(fractionAtHz(ring, mid)).toBeCloseTo(0.5, 5)
  })
})
