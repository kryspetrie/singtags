import { describe, expect, it } from 'vitest'
import { isGlanceSurface, toGlanceSurface } from './glanceSurface'
import type { DigitalTunerAnalyzeSurface } from '../../lib/preferences/digitalTuner'

const ALL: DigitalTunerAnalyzeSurface[] = [
  'hidden',
  'chord',
  'fft',
  'spectrogram',
  'harmonics',
  'staff',
]

describe('glanceSurface', () => {
  it('identifies Glance-safe surfaces', () => {
    expect(isGlanceSurface('hidden')).toBe(true)
    expect(isGlanceSurface('chord')).toBe(true)
    expect(isGlanceSurface('fft')).toBe(true)
    expect(isGlanceSurface('spectrogram')).toBe(true)
    expect(isGlanceSurface('harmonics')).toBe(false)
    expect(isGlanceSurface('staff')).toBe(false)
  })

  it('remaps Detail-only surfaces and leaves Glance surfaces unchanged', () => {
    expect(toGlanceSurface('harmonics')).toBe('fft')
    expect(toGlanceSurface('staff')).toBe('hidden')
    expect(toGlanceSurface('hidden')).toBe('hidden')
    expect(toGlanceSurface('chord')).toBe('chord')
    expect(toGlanceSurface('fft')).toBe('fft')
    expect(toGlanceSurface('spectrogram')).toBe('spectrogram')
  })

  it('covers every analyzeSurface value', () => {
    for (const s of ALL) {
      expect(isGlanceSurface(toGlanceSurface(s))).toBe(true)
    }
  })
})
