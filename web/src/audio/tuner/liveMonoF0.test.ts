import { describe, expect, it } from 'vitest'
import { liveMonoF0, synthSineFrame } from './liveMonoF0'
import { noteFromHz } from '../../domain/tuner/noteFromHz'

describe('liveMonoF0', () => {
  const sr = 48_000
  const win = 4096

  it('estimates steady sines within ±2¢ for C2–C6', () => {
    // C2≈65.4, E3≈164.8, A4=440, C6≈1046.5
    for (const hz of [65.41, 164.81, 440, 1046.5]) {
      const frame = synthSineFrame(hz, sr, win)
      const { hz: est, clarity } = liveMonoF0(frame, sr, { fMinHz: 55, fMaxHz: 1200 })
      expect(est, `hz=${hz}`).not.toBeNull()
      expect(clarity, `clarity hz=${hz}`).toBeGreaterThan(0.5)
      const cents = 1200 * Math.log2(est! / hz)
      expect(Math.abs(cents), `cents hz=${hz} est=${est}`).toBeLessThanOrEqual(2)
      const note = noteFromHz(est!, 440)
      expect(note).not.toBeNull()
    }
  })

  it('returns unvoiced for silence', () => {
    const frame = new Float32Array(win)
    expect(liveMonoF0(frame, sr).hz).toBeNull()
  })
})
