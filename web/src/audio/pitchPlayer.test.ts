/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it, vi } from 'vitest'
import { CHROMATIC_NOTES, formatKeyShiftLabel, keyToTonicNote, noteToFrequency, PitchPlayer, transposeKeyLabel } from './pitchPlayer'

describe('pitchPlayer helpers', () => {
  it('maps keys to tonic notes', () => {
    expect(keyToTonicNote('Major:Ab')).toMatch(/^A[bB]?3$/i)
    expect(keyToTonicNote('G Major')).toBe('G3')
    expect(keyToTonicNote('Bb')).toBeTruthy()
    expect(keyToTonicNote(null)).toBeNull()
    expect(keyToTonicNote('')).toBeNull()
  })

  it('formats key with semitone shift', () => {
    expect(formatKeyShiftLabel('Ab Major', 0)).toBe('Ab Major')
    expect(formatKeyShiftLabel('Ab Major', 2)).toBe('Ab Major +2 (Bb Major)')
    expect(formatKeyShiftLabel('C Major', -1)).toBe('C Major -1 (B Major)')
    expect(formatKeyShiftLabel('Major:Bb', 1)).toBe('Major:Bb +1 (Major:B)')
    expect(transposeKeyLabel('F# Major', 1)).toBe('G Major')
    expect(formatKeyShiftLabel(null, 0)).toBe('(Use +/- to choose key)')
    expect(formatKeyShiftLabel('', 0)).toBe('(Use +/- to choose key)')
    expect(formatKeyShiftLabel(null, 2)).toBe('D Major')
    expect(formatKeyShiftLabel(null, -1)).toBe('B Major')
  })

  it('converts notes to frequency', () => {
    expect(noteToFrequency('A4')).toBeCloseTo(440, 5)
    expect(noteToFrequency('C4')).toBeCloseTo(261.63, 0)
  })

  it('exposes chromatic range', () => {
    expect(CHROMATIC_NOTES.length).toBeGreaterThan(20)
  })
})

describe('PitchPlayer', () => {
  it('starts and stops with a mocked AudioContext', async () => {
    const start = vi.fn()
    const stop = vi.fn()
    const connect = vi.fn()
    const oscillator = {
      type: '',
      frequency: { value: 0 },
      detune: { value: 0 },
      connect,
      start,
      stop,
    }
    const gain = {
      gain: {
        value: 0,
        setValueAtTime: vi.fn(),
        linearRampToValueAtTime: vi.fn(),
        cancelScheduledValues: vi.fn(),
      },
      connect: vi.fn(),
    }
    const ctx = {
      state: 'running',
      currentTime: 0,
      destination: {},
      resume: vi.fn(async () => {}),
      createOscillator: vi.fn(() => oscillator),
      createGain: vi.fn(() => gain),
      close: vi.fn(async () => {}),
    }
    vi.stubGlobal(
      'AudioContext',
      vi.fn(function AudioContext() {
        return ctx
      }),
    )
    const p = new PitchPlayer()
    await p.start('A4', 10)
    expect(start).toHaveBeenCalled()
    expect(ctx.createOscillator).toHaveBeenCalled()
    p.dispose()
    expect(ctx.close).toHaveBeenCalled()
    vi.unstubAllGlobals()
  })
})
