import { describe, expect, it } from 'vitest'
import { createFftPeakSmoothState, smoothFftPeaks } from './fftPeakSmooth'
import type { FftPeak } from './fftPeaks'

function peak(hz: number, salience = 0.8, note: string | null = 'A4'): FftPeak {
  return { hz, salience, note, errorCents: 0 }
}

describe('smoothFftPeaks', () => {
  it('requires appearHits before a peak is visible', () => {
    const s = createFftPeakSmoothState()
    const once = smoothFftPeaks(s, [peak(440)], { appearHits: 2, holdMisses: 3 })
    expect(once).toHaveLength(0)
    const twice = smoothFftPeaks(s, [peak(442)], { appearHits: 2, holdMisses: 3 })
    expect(twice).toHaveLength(1)
    expect(twice[0]!.hz).toBeGreaterThan(440)
    expect(twice[0]!.hz).toBeLessThan(442)
  })

  it('holds a peak across brief misses', () => {
    const s = createFftPeakSmoothState()
    const opts = { appearHits: 1, holdMisses: 2, maxPeaks: 4 }
    expect(smoothFftPeaks(s, [peak(220, 0.9, 'A3')], opts)).toHaveLength(1)
    expect(smoothFftPeaks(s, [], opts)).toHaveLength(1)
    expect(smoothFftPeaks(s, [], opts)).toHaveLength(1)
    expect(smoothFftPeaks(s, [], opts)).toHaveLength(0)
  })

  it('matches nearby Hz instead of spawning a duplicate', () => {
    const s = createFftPeakSmoothState()
    const opts = { appearHits: 1, matchCents: 50, maxPeaks: 4 }
    smoothFftPeaks(s, [peak(440)], opts)
    const next = smoothFftPeaks(s, [peak(445)], opts)
    expect(next).toHaveLength(1)
    expect(s.tracks).toHaveLength(1)
  })
})
