/**
 * Analyze-surface helpers for TunerView — DSP mode + tab prefetch.
 */
import type { TunerDspAnalyzeMode } from '../audio/tuner/tunerDspProtocol'
import type { DigitalTunerPrefs } from '../lib/preferences/digitalTuner'

export function analyzeModeForSurface(opts: {
  running: boolean
  surface: DigitalTunerPrefs['analyzeSurface']
  fftPaused: boolean
  specPaused: boolean
}): TunerDspAnalyzeMode {
  if (!opts.running) return 'none'
  if (opts.surface === 'chord') return 'chord'
  if ((opts.surface === 'fft' || opts.surface === 'harmonics') && !opts.fftPaused) return 'fft'
  if (opts.surface === 'spectrogram' && !opts.specPaused) return 'spectrogram'
  return 'none'
}

export function prefetchAnalyzeSurface(next: DigitalTunerPrefs['analyzeSurface']): void {
  if (next === 'chord') void import('../components/tuner/ChordStackView.vue')
  else if (next === 'fft') void import('../components/tuner/TunerFftView.vue')
  else if (next === 'spectrogram') void import('../components/tuner/TunerSpectrogramView.vue')
  else if (next === 'harmonics') void import('../components/tuner/TunerHarmonicsView.vue')
  else if (next === 'staff') void import('../components/tuner/TunerStaffPlotView.vue')
}
