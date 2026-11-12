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
  if (opts.surface === 'fft' && !opts.fftPaused) return 'fft'
  if (opts.surface === 'spectrogram' && !opts.specPaused) return 'spectrogram'
  return 'none'
}

export function prefetchAnalyzeSurface(next: DigitalTunerPrefs['analyzeSurface']): void {
  if (next === 'fft') void import('../components/tuner/TunerFftView.vue')
  else if (next === 'spectrogram') void import('../components/tuner/TunerSpectrogramView.vue')
}
