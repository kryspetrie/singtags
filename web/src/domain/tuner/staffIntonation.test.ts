import { describe, expect, it } from 'vitest'
import { midiToStaffY01, pushStaffSample, staffMidiRange, type StaffSample } from './staffIntonation'

describe('staffIntonation', () => {
  it('maps treble range', () => {
    const r = staffMidiRange('treble')
    expect(r.lo).toBeLessThan(r.hi)
    expect(midiToStaffY01(r.lo, 'treble')).toBeCloseTo(0, 5)
    expect(midiToStaffY01(r.hi, 'treble')).toBeCloseTo(1, 5)
  })

  it('classifies zones when pushing', () => {
    const samples: StaffSample[] = []
    pushStaffSample(samples, {
      tMs: 0,
      midi: 60,
      cents: 1,
      clarity: 0.9,
      windowCents: 5,
    })
    expect(samples[0]?.zone).toBe('in')
    pushStaffSample(samples, {
      tMs: 1,
      midi: 60,
      cents: 12,
      clarity: 0.9,
      windowCents: 5,
    })
    expect(samples[1]?.zone).toBe('far')
  })
})
