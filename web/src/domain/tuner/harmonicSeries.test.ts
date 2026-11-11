import { describe, expect, it } from 'vitest'
import { harmonicSeriesFromLogBins } from './harmonicSeries'

describe('harmonicSeriesFromLogBins', () => {
  it('returns empty without f0', () => {
    expect(harmonicSeriesFromLogBins([1, 1, 1], { f0Hz: 0, fMinHz: 80, fMaxHz: 4000 })).toEqual([])
  })

  it('peaks at fundamental when bins favor f0', () => {
    const bins = new Float32Array(64)
    // Roughly place energy near 220 Hz in log space 80→4000
    const fMin = 80
    const fMax = 4000
    const f0 = 220
    const t = (Math.log(f0) - Math.log(fMin)) / (Math.log(fMax) - Math.log(fMin))
    const i = Math.round(t * (bins.length - 1))
    bins[i] = 1
    const series = harmonicSeriesFromLogBins(bins, { f0Hz: f0, fMinHz: fMin, fMaxHz: fMax, maxPartials: 4 })
    expect(series[0]?.n).toBe(1)
    expect(series[0]?.energy).toBeCloseTo(1, 5)
    expect(series.length).toBeGreaterThan(1)
  })
})
