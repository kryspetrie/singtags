import { describe, expect, it } from 'vitest'
import {
  applyFftDisplaySmooth,
  createFftDisplaySmoothState,
} from './fftDisplaySmooth'

describe('fftDisplaySmooth', () => {
  it('EMA pulls toward new samples', () => {
    const s = createFftDisplaySmoothState()
    const a = Float32Array.from([0, 0, 0])
    applyFftDisplaySmooth(s, a, { alpha: 0.5, smoothing: true, peakHold: false })
    const b = Float32Array.from([1, 1, 1])
    const out = applyFftDisplaySmooth(s, b, { alpha: 0.5, smoothing: true, peakHold: false })
    expect(out.bins[0]).toBeCloseTo(0.5, 5)
  })

  it('peak hold decays slowly above the live bar', () => {
    const s = createFftDisplaySmoothState()
    applyFftDisplaySmooth(s, Float32Array.from([1]), {
      smoothing: false,
      peakHold: true,
      peakDecay: 0.9,
    })
    const out = applyFftDisplaySmooth(s, Float32Array.from([0.1]), {
      smoothing: false,
      peakHold: true,
      peakDecay: 0.9,
    })
    expect(out.peaks![0]!).toBeGreaterThan(out.bins[0]!)
    expect(out.peaks![0]!).toBeCloseTo(0.9, 5)
  })
})
