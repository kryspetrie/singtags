import { describe, expect, it } from 'vitest'
import { isGlanceSurface, toGlanceSurface } from './glanceSurface'
import type { DigitalTunerAnalyzeSurface } from '../../lib/preferences/digitalTuner'

const ALL: DigitalTunerAnalyzeSurface[] = ['hidden', 'fft', 'spectrogram']

describe('glanceSurface', () => {
  it('identifies Glance-safe surfaces', () => {
    expect(isGlanceSurface('hidden')).toBe(true)
    expect(isGlanceSurface('fft')).toBe(true)
    expect(isGlanceSurface('spectrogram')).toBe(true)
  })

  it('leaves Glance surfaces unchanged', () => {
    expect(toGlanceSurface('hidden')).toBe('hidden')
    expect(toGlanceSurface('fft')).toBe('fft')
    expect(toGlanceSurface('spectrogram')).toBe('spectrogram')
  })

  it('covers every analyzeSurface value', () => {
    for (const s of ALL) {
      expect(isGlanceSurface(toGlanceSurface(s))).toBe(true)
    }
  })
})
