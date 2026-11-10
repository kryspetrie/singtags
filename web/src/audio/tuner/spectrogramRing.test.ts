import { describe, expect, it } from 'vitest'
import {
  clearSpectrogramRing,
  createSpectrogramRing,
  frameMagnitudeBins,
  pushSpectrogramColumn,
} from './spectrogramRing'
import { synthStackFrame } from './multiF0'

describe('spectrogramRing', () => {
  it('caps columns and clears', () => {
    const ring = createSpectrogramRing(16, 5)
    for (let i = 0; i < 8; i++) pushSpectrogramColumn(ring, new Float32Array(16).fill(i + 1))
    expect(ring.columns).toHaveLength(5)
    clearSpectrogramRing(ring)
    expect(ring.columns).toHaveLength(0)
  })

  it('builds magnitude bins for a sine', () => {
    const sr = 48_000
    const frame = synthStackFrame([440], sr, 2048, 0.5)
    const bins = frameMagnitudeBins(frame, sr, 32, 2000)
    expect(bins.length).toBe(32)
    expect(Math.max(...bins)).toBeGreaterThan(0)
  })
})
