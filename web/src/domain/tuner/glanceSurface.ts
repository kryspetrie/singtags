/**
 * Glance-safe Analyze surfaces — Tune · Chord · FFT · Spec only.
 * Harmonics / Staff are Detail teaching views; remap on 10-ft entry.
 */

import type { DigitalTunerAnalyzeSurface } from '../../lib/preferences/digitalTuner'

export const GLANCE_SURFACES = [
  'hidden',
  'chord',
  'fft',
  'spectrogram',
] as const satisfies readonly DigitalTunerAnalyzeSurface[]

export type GlanceSurface = (typeof GLANCE_SURFACES)[number]

export function isGlanceSurface(surface: DigitalTunerAnalyzeSurface): surface is GlanceSurface {
  return (GLANCE_SURFACES as readonly string[]).includes(surface)
}

/** Map Detail-only surfaces onto a Glance body before opening 10-ft. */
export function toGlanceSurface(surface: DigitalTunerAnalyzeSurface): GlanceSurface {
  if (surface === 'harmonics') return 'fft'
  if (surface === 'staff') return 'hidden'
  if (isGlanceSurface(surface)) return surface
  return 'hidden'
}
