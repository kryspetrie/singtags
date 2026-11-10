import { describe, expect, it } from 'vitest'
import { synthStackFrame } from './multiF0'
import { fftPeaks } from './fftPeaks'

describe('fftPeaks', () => {
  it('labels a steady A4 sine', () => {
    const sr = 48_000
    const frame = synthStackFrame([440], sr, 8192, 0.4)
    const peaks = fftPeaks(frame, sr, { a4Hz: 440, maxPeaks: 4 })
    expect(peaks.length).toBeGreaterThanOrEqual(1)
    expect(peaks[0]!.note).toBe('A4')
    expect(Math.abs(peaks[0]!.errorCents ?? 99)).toBeLessThan(5)
  })
})
