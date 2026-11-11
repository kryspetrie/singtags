import { describe, expect, it } from 'vitest'
import {
  createSmoothLivePitchState,
  resetSmoothLivePitch,
  smoothLivePitch,
} from './smoothLivePitch'

describe('smoothLivePitch', () => {
  it('EMA pulls toward steady samples', () => {
    const s = createSmoothLivePitchState()
    let out = smoothLivePitch(s, { hz: 440, clarity: 0.9 }, { medianWindow: 1, emaAlpha: 0.5 })
    expect(out.hz).toBeCloseTo(440, 5)
    out = smoothLivePitch(s, { hz: 450, clarity: 0.9 }, { medianWindow: 1, emaAlpha: 0.5 })
    expect(out.hz!).toBeGreaterThan(440)
    expect(out.hz!).toBeLessThan(450)
  })

  it('median rejects a single outlier', () => {
    const s = createSmoothLivePitchState()
    const opts = { medianWindow: 5, emaAlpha: 1, midiHysteresisCents: 0 }
    for (const hz of [440, 440, 440, 440]) {
      smoothLivePitch(s, { hz, clarity: 0.9 }, opts)
    }
    const out = smoothLivePitch(s, { hz: 880, clarity: 0.9 }, opts)
    // Median of [440,440,440,440,880] = 440
    expect(out.hz).toBeCloseTo(440, 0)
  })

  it('MIDI hysteresis keeps note across the boundary briefly', () => {
    const s = createSmoothLivePitchState()
    const opts = { medianWindow: 1, emaAlpha: 1, midiHysteresisCents: 40, a4Hz: 440 }
    // A4
    let out = smoothLivePitch(s, { hz: 440, clarity: 1 }, opts)
    expect(out.displayMidi).toBe(69)
    // Just sharp of A4 midpoint toward A# (69.5) but within 40¢ hysteresis past boundary
    // Midpoint A↔A♯ is +50¢; with 40¢ hyst flip at +90¢ from A
    const almost = 440 * 2 ** (80 / 1200)
    out = smoothLivePitch(s, { hz: almost, clarity: 1 }, opts)
    expect(out.displayMidi).toBe(69)
    const past = 440 * 2 ** (95 / 1200)
    out = smoothLivePitch(s, { hz: past, clarity: 1 }, opts)
    expect(out.displayMidi).toBe(70)
  })

  it('reset clears sticky state', () => {
    const s = createSmoothLivePitchState()
    smoothLivePitch(s, { hz: 440, clarity: 1 })
    resetSmoothLivePitch(s)
    expect(s.emaHz).toBeNull()
    expect(s.stickyMidi).toBeNull()
    expect(s.recent).toEqual([])
  })
})
