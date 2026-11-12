/**
 * Glance-safe Analyze surfaces — Tune · FFT · Spec only.
 */

import type { DigitalTunerAnalyzeSurface } from '../../lib/preferences/digitalTuner'

export const GLANCE_SURFACES = [
  'hidden',
  'fft',
  'spectrogram',
] as const satisfies readonly DigitalTunerAnalyzeSurface[]

export type GlanceSurface = (typeof GLANCE_SURFACES)[number]

export function isGlanceSurface(surface: DigitalTunerAnalyzeSurface): surface is GlanceSurface {
  return (GLANCE_SURFACES as readonly string[]).includes(surface)
}

/** Identity for Glance — prefs already remap legacy surfaces on load. */
export function toGlanceSurface(surface: DigitalTunerAnalyzeSurface): GlanceSurface {
  if (isGlanceSurface(surface)) return surface
  return 'hidden'
}
