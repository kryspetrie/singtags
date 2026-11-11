import { describe, expect, it } from 'vitest'
import { normalizeFramePeak } from './normalizeFrame'

describe('normalizeFramePeak', () => {
  it('boosts a quiet frame toward the target peak', () => {
    const frame = Float32Array.from([0.1, -0.08, 0.06])
    const out = normalizeFramePeak(frame, { targetPeak: 0.7, slack: 0 })
    let peak = 0
    for (let i = 0; i < out.length; i++) peak = Math.max(peak, Math.abs(out[i]!))
    expect(peak).toBeCloseTo(0.7, 5)
    expect(out).not.toBe(frame)
  })

  it('leaves near-target frames untouched (same buffer)', () => {
    const frame = Float32Array.from([0.68, -0.65])
    expect(normalizeFramePeak(frame, { targetPeak: 0.7 })).toBe(frame)
  })
})
