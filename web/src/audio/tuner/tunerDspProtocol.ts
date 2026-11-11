/**
 * Shared messages / config for the tuner DSP worker ↔ main-thread client.
 * Heavy FFT / YIN / multi-F0 stay off the UI thread when Worker is available.
 */

import type { KeyGridTemperament } from '../../domain/tuner/keyGridTemperament'
import type { FftPeak } from './fftPeaks'
import type { MultiF0Peak } from './multiF0'
import type { SpectrogramFreqScale } from './spectrogramRing'

export type TunerDspAnalyzeMode = 'none' | 'chord' | 'fft' | 'spectrogram'

export type TunerDspConfig = {
  suppressDetection: boolean
  /** Absolute RMS gate for mono F0 (pre-normalize). Undefined = estimator default. */
  rmsGate?: number
  a4Hz: number
  analyze: TunerDspAnalyzeMode
  /** When false, skip YIN (Analyze-only CPU save). Default true. */
  monoEnabled?: boolean
  /** Sliding mono analysis length (samples). Default 4096. */
  monoAnalysisSamples?: number
  /**
   * Multi-F0 / FFT peak salience floor (0…1).
   * Independent of Tune clarityMin (applied on the main thread).
   */
  salienceFloor: number
  /** FFT Analyze */
  fftSize: number
  fftDisplayBins: number
  keyPc: number
  temperament: KeyGridTemperament
  customOffsetsCents: number[]
  /** Analysis reaction band (Tune / Chord / FFT peaks). */
  analysisFMinHz: number
  analysisFMaxHz: number
  /** Spectrogram Analyze */
  specAnalysisSamples: number
  specBinCount: number
  specFMinHz: number
  specFMaxHz: number
  specFreqScale: SpectrogramFreqScale
  specShowTracks: boolean
}

export const DEFAULT_TUNER_DSP_CONFIG: TunerDspConfig = {
  suppressDetection: false,
  a4Hz: 440,
  analyze: 'none',
  monoEnabled: true,
  monoAnalysisSamples: 4096,
  salienceFloor: 0.35,
  fftSize: 4096,
  fftDisplayBins: 200,
  keyPc: 0,
  temperament: 'equal',
  customOffsetsCents: [],
  analysisFMinHz: 55,
  analysisFMaxHz: 1200,
  specAnalysisSamples: 4096,
  specBinCount: 160,
  specFMinHz: 55,
  specFMaxHz: 1200,
  specFreqScale: 'log',
  specShowTracks: true,
}

export type TunerDspMono = {
  hz: number | null
  clarity: number
}

export type TunerDspChord = {
  peaks: MultiF0Peak[]
  pitchClasses: number[]
}

export type TunerDspFft = {
  bins: Float32Array
  fMinHz: number
  fMaxHz: number
  peaks: FftPeak[]
}

export type TunerDspSpec = {
  bins: Float32Array
  /** Present when tracks are enabled and this hop ran multi-F0. */
  trackPeaks?: MultiF0Peak[]
}

export type TunerDspResult = {
  seq: number
  sampleRate: number
  level: number
  /** Null when detection is suppressed. */
  mono: TunerDspMono | null
  chord?: TunerDspChord
  fft?: TunerDspFft
  spec?: TunerDspSpec
}

export type TunerDspToWorker =
  | { type: 'config'; config: Partial<TunerDspConfig> }
  | { type: 'frame'; seq: number; sampleRate: number; samples: Float32Array }
  | { type: 'recomputeFft'; seq: number }
  | { type: 'reset' }

export type TunerDspFromWorker =
  | { type: 'result'; result: TunerDspResult }
  | { type: 'idle' }
  | { type: 'error'; message: string }

export function displayBinsForFftSize(fftSize: number): number {
  if (fftSize >= 16384) return 320
  if (fftSize >= 8192) return 256
  if (fftSize >= 4096) return 200
  return 160
}
