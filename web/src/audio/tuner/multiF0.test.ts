import { describe, expect, it } from 'vitest'
import { multiF0, synthStackFrame } from './multiF0'

describe('multiF0', () => {
  const sr = 48_000
  const win = 8192
  const a4 = 440

  function hzForMidi(midi: number): number {
    return a4 * 2 ** ((midi - 69) / 12)
  }

  it('recovers PC set for a held C major triad stack', () => {
    // C3 E3 G3
    const hz = [hzForMidi(48), hzForMidi(52), hzForMidi(55)]
    const frame = synthStackFrame(hz, sr, win)
    const { pitchClasses, peaks } = multiF0(frame, sr, { a4Hz: a4, maxPeaks: 4 })
    expect(peaks.length).toBeGreaterThanOrEqual(2)
    for (const pc of [0, 4, 7]) {
      expect(pitchClasses, `missing pc ${pc} in ${pitchClasses}`).toContain(pc)
    }
  })

  it('recovers PC set for a 4:5:6:7 barbershop seventh on C', () => {
    const root = hzForMidi(48) // C3
    const stack = [root, root * (5 / 4), root * (3 / 2), root * (7 / 4)]
    const frame = synthStackFrame(stack, sr, win, 0.22)
    const { pitchClasses } = multiF0(frame, sr, {
      a4Hz: a4,
      maxPeaks: 4,
      salienceFloor: 0.15,
    })
    // Expect C, E, G, Bb-ish (PC 10)
    for (const pc of [0, 4, 7]) {
      expect(pitchClasses).toContain(pc)
    }
    expect(pitchClasses.some((p) => p === 10 || p === 9 || p === 11)).toBe(true)
  })

  it('returns empty for silence', () => {
    expect(multiF0(new Float32Array(win), sr).peaks).toEqual([])
  })

  it('prefers the fundamental when H2 is louder than F0', () => {
    // Bass C3 + strong octave harmonic (common singing spectrum)
    const f0 = hzForMidi(48)
    const frame = synthStackFrame([f0, f0 * 2], sr, win, 0.2)
    // Boost H2 in the mix
    const hot = synthStackFrame([f0 * 2], sr, win, 0.45)
    for (let i = 0; i < win; i++) frame[i]! += hot[i]!
    const { peaks } = multiF0(frame, sr, { a4Hz: a4, maxPeaks: 2, salienceFloor: 0.1 })
    expect(peaks.length).toBeGreaterThanOrEqual(1)
    // Lowest reported peak should be near C3, not C4
    expect(peaks[0]!.hz).toBeGreaterThan(f0 * 0.9)
    expect(peaks[0]!.hz).toBeLessThan(f0 * 1.15)
  })
})

