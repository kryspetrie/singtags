import { describe, expect, it } from 'vitest'
import { createFftScratch, fftRealMagnitudes, nextPow2 } from './fftReal'
import { synthStackFrame } from './multiF0'

describe('fftReal', () => {
  it('nextPow2', () => {
    expect(nextPow2(1)).toBe(1)
    expect(nextPow2(3)).toBe(4)
    expect(nextPow2(4096)).toBe(4096)
    expect(nextPow2(4097)).toBe(8192)
  })

  it('peaks near a 440 Hz sine', () => {
    const sr = 48_000
    const n = 4096
    const frame = synthStackFrame([440], sr, n, 0.5)
    const scratch = createFftScratch(n)
    const mag = fftRealMagnitudes(frame, scratch)
    let bestK = 1
    let best = 0
    for (let k = 1; k < mag.length; k++) {
      if (mag[k]! > best) {
        best = mag[k]!
        bestK = k
      }
    }
    const hz = (bestK * sr) / n
    expect(hz).toBeGreaterThan(420)
    expect(hz).toBeLessThan(460)
  })
})
