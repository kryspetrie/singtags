import { describe, expect, it } from 'vitest'
import {
  matchPitchRangeId,
  normalizePitchBand,
  PITCH_RANGE_PRESETS,
  resolvePitchRange,
  pitchMaxForSampleRate,
} from './pitchRange'

describe('pitchRange', () => {
  it('includes full hearing and voice defaults', () => {
    const ids = PITCH_RANGE_PRESETS.map((p) => p.id)
    expect(ids).toContain('hearing')
    expect(ids).toContain('voice')
    expect(ids).toContain('quartet')
    expect(ids).toContain('piano')
    const hearing = PITCH_RANGE_PRESETS.find((p) => p.id === 'hearing')!
    expect(hearing.minHz).toBe(20)
    expect(hearing.maxHz).toBe(20_000)
  })

  it('resolves named presets and matches custom Hz', () => {
    expect(resolvePitchRange('quartet')).toEqual({ id: 'quartet', minHz: 70, maxHz: 700 })
    expect(matchPitchRangeId(55, 1200)).toBe('voice')
    expect(matchPitchRangeId(100, 800)).toBe('custom')
  })

  it('normalizes inverted bands', () => {
    const b = normalizePitchBand(2000, 100)
    expect(b.maxHz).toBeGreaterThan(b.minHz)
  })

  it('caps max to nyquist', () => {
    expect(pitchMaxForSampleRate(20_000, 48_000)).toBeLessThan(24_000)
    expect(pitchMaxForSampleRate(700, 48_000)).toBe(700)
  })
})
