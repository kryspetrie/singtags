import { describe, expect, it } from 'vitest'
import {
  compoundPlaybackTransform,
  defaultRecorderTakeEdits,
  isIdentityTakeEdits,
  normalizeRecorderTakeEdits,
  recorderTakeEditsEqual,
} from './takeEdits'

describe('takeEdits', () => {
  it('normalizes compress, normalize flag, and clamps pitch/speed', () => {
    const n = normalizeRecorderTakeEdits({
      pitchSemitones: 2.4,
      speed: 1.5,
      normalize: true,
      compress: { mode: 'vocal', intensity: 0.8 },
    })
    expect(n.pitchSemitones).toBe(2.4)
    expect(n.speed).toBe(1.5)
    expect(n.normalize).toBe(true)
    expect(n.compress?.mode).toBe('vocal')
    expect(n.compress?.intensity).toBeCloseTo(0.8)
  })

  it('treats empty edits as identity', () => {
    expect(isIdentityTakeEdits(defaultRecorderTakeEdits())).toBe(true)
    expect(
      isIdentityTakeEdits({ pitchSemitones: 0, speed: 1, normalize: false, compress: null }),
    ).toBe(true)
    expect(
      isIdentityTakeEdits({ pitchSemitones: 1, speed: 1, normalize: false, compress: null }),
    ).toBe(false)
    expect(
      isIdentityTakeEdits({ pitchSemitones: 0, speed: 1, normalize: true, compress: null }),
    ).toBe(false)
  })

  it('compounds playback pitch/speed on saved edits', () => {
    const t = compoundPlaybackTransform(
      { pitchSemitones: 2, speed: 0.5, normalize: false, compress: null },
      1,
      2,
    )
    expect(t.pitchSemitones).toBe(3)
    expect(t.speed).toBe(1)
  })

  it('compares edits for dirty checks', () => {
    const a = normalizeRecorderTakeEdits({
      pitchSemitones: 1,
      speed: 1,
      normalize: false,
      compress: { mode: 'gentle', intensity: 0.5 },
    })
    const b = { ...a, compress: { mode: 'gentle' as const, intensity: 0.5 } }
    expect(recorderTakeEditsEqual(a, b)).toBe(true)
    expect(recorderTakeEditsEqual(a, { ...a, pitchSemitones: 2 })).toBe(false)
    expect(recorderTakeEditsEqual(a, { ...a, normalize: true })).toBe(false)
  })
})
