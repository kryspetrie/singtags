import { describe, expect, it } from 'vitest'
import { tuneReadingFromHz } from './tuneTarget'

describe('tuneTarget', () => {
  it('equal temperament matches raw ET cents', () => {
    const a4 = 440
    const reading = tuneReadingFromHz(a4, {
      a4Hz: a4,
      keyPc: 0,
      temperament: 'equal',
    })
    expect(reading?.name).toBe('A4')
    expect(reading?.errorCents).toBeCloseTo(0, 5)
    expect(reading?.targetKind).toBe('equal')
  })

  it('just-triad M3 target shifts error for ET E4 in C', () => {
    // E4 ≈ 329.63 Hz at A=440 — near 0¢ ET; JI M3 target ≈ −13.7¢
    const e4 = 440 * 2 ** ((64 - 69) / 12)
    const reading = tuneReadingFromHz(e4, {
      a4Hz: 440,
      keyPc: 0,
      temperament: 'justTriad',
    })
    expect(reading?.pc).toBe(4)
    expect(reading?.errorCents).toBeCloseTo(13.7, 0)
    expect(reading?.targetKind).toBe('keyGrid')
  })

  it('chord-lock seventh role uses harm7 target', () => {
    const bb3 = 440 * 2 ** ((58 - 69) / 12) // Bb3 ≈ ET 10th above C
    const reading = tuneReadingFromHz(bb3, {
      a4Hz: 440,
      keyPc: 0,
      temperament: 'equal',
      chordLockEnabled: true,
      chordNatureId: 'seventh',
      chordRole: 7,
    })
    expect(reading?.targetKind).toBe('chordLock')
    // ET Bb vs JI 7/4 (~−31¢) → singer at ET is ~+31¢ sharp of lock
    expect(reading?.errorCents).toBeCloseTo(31.2, 0)
  })

  it('chord-lock auto role maps Bb to seventh, not root', () => {
    const bb3 = 440 * 2 ** ((58 - 69) / 12)
    const reading = tuneReadingFromHz(bb3, {
      a4Hz: 440,
      keyPc: 0,
      temperament: 'equal',
      chordLockEnabled: true,
      chordNatureId: 'seventh',
      chordRootPc: 0,
      chordRole: 'auto',
    })
    expect(reading?.targetKind).toBe('chordLock')
    expect(reading?.errorCents).toBeCloseTo(31.2, 0)
  })

  it('chord-lock auto ignores non-chord tones (falls back to key grid)', () => {
    // D4 in C seventh is not a chord tone → key-grid equal
    const d4 = 440 * 2 ** ((62 - 69) / 12)
    const reading = tuneReadingFromHz(d4, {
      a4Hz: 440,
      keyPc: 0,
      temperament: 'equal',
      chordLockEnabled: true,
      chordNatureId: 'seventh',
      chordRootPc: 0,
      chordRole: 'auto',
    })
    expect(reading?.targetKind).toBe('equal')
  })

  it('displayMidi keeps cents vs sticky note across the midpoint', () => {
    // 60¢ sharp of A4 is nearer A♯, but sticky A4 should still report ~+60¢
    const hz = 440 * 2 ** (60 / 1200)
    const reading = tuneReadingFromHz(hz, {
      a4Hz: 440,
      keyPc: 0,
      temperament: 'equal',
      displayMidi: 69,
    })
    expect(reading?.name).toBe('A4')
    expect(reading?.midi).toBe(69)
    expect(reading?.errorCents).toBeCloseTo(60, 0)
  })
})
