/**
 * FFT Analyze — spectrum bins for a horizontal graph + labeled fundamental peaks.
 */

import { noteFromHz } from '../../domain/tuner/noteFromHz'
import { keyGridOffsetCents, type KeyGridTemperament } from '../../domain/tuner/keyGridTemperament'
import { computeMagnitudeSpectrum, multiF0 } from './multiF0'

export type FftPeak = {
  hz: number
  salience: number
  note: string | null
  /** Cents vs key-grid (or equal) target for nearest note. */
  errorCents: number | null
}

/** Fixed-layout spectrum for the FFT graph (log-frequency axis). */
export type FftSpectrumView = {
  /** Magnitudes 0…1, left→right = fMin→fMax on a log axis. */
  bins: Float32Array
  /** Optional peak-hold overlay (same length as bins). */
  peakHold?: Float32Array
  fMinHz: number
  fMaxHz: number
  peaks: FftPeak[]
}

export type FftPeaksOpts = {
  a4Hz?: number
  keyPc?: number
  temperament?: KeyGridTemperament
  customOffsetsCents?: readonly number[]
  maxPeaks?: number
  fMinHz?: number
  fMaxHz?: number
  /** Display bin count for the graph. Default 160. */
  displayBins?: number
  /** Multi-F0 salience floor (0…1). Default 0.35. */
  salienceFloor?: number
}

/** Spectrum + fundamental-biased peaks for the FFT Analyze surface. */
export function fftSpectrumView(
  frame: Float32Array,
  sampleRate: number,
  opts: FftPeaksOpts = {},
): FftSpectrumView {
  const a4 = opts.a4Hz ?? 440
  const fMin = opts.fMinHz ?? 70
  const fMax = opts.fMaxHz ?? 2000
  const displayBins = opts.displayBins ?? 160

  const { peaks: rawPeaks, spectrum } = multiF0(frame, sampleRate, {
    a4Hz: a4,
    maxPeaks: opts.maxPeaks ?? 4,
    fMinHz: fMin,
    // Respect the user-selected analysis band (may be full hearing).
    fMaxHz: fMax,
    // Reject harmonic partials that survive as weak "fundamentals".
    salienceFloor: opts.salienceFloor ?? 0.35,
    includeSpectrum: true,
  })

  const peaks: FftPeak[] = rawPeaks.map((p) => annotatePeak(p.hz, p.salience, a4, opts))

  const bins = buildLogDisplayBins(
    spectrum ?? computeMagnitudeSpectrum(frame, sampleRate, fMin, fMax),
    displayBins,
    fMin,
    fMax,
  )

  return { bins, fMinHz: fMin, fMaxHz: fMax, peaks }
}

/** @deprecated Prefer {@link fftSpectrumView}; kept for callers that only need peaks. */
export function fftPeaks(
  frame: Float32Array,
  sampleRate: number,
  opts: FftPeaksOpts = {},
): FftPeak[] {
  return fftSpectrumView(frame, sampleRate, opts).peaks
}

function annotatePeak(
  hz: number,
  salience: number,
  a4: number,
  opts: FftPeaksOpts,
): FftPeak {
  const n = noteFromHz(hz, a4)
  if (!n) return { hz, salience, note: null, errorCents: null }
  const pc = ((n.midi % 12) + 12) % 12
  const grid = keyGridOffsetCents(
    pc,
    opts.keyPc ?? 0,
    opts.temperament ?? 'equal',
    opts.customOffsetsCents,
  )
  return {
    hz,
    salience,
    note: n.name,
    errorCents: n.cents - grid,
  }
}

function buildLogDisplayBins(
  spec: ReturnType<typeof computeMagnitudeSpectrum>,
  binCount: number,
  fMin: number,
  fMax: number,
): Float32Array {
  const out = new Float32Array(binCount)
  if (!spec || !(fMin > 0) || !(fMax > fMin)) return out
  const { mag, kMin, kMax, n, sampleRate } = spec
  const logMin = Math.log(fMin)
  const logMax = Math.log(fMax)
  let peak = 1e-12
  for (let b = 0; b < binCount; b++) {
    const t0 = b / binCount
    const t1 = (b + 1) / binCount
    const hz0 = Math.exp(logMin + (logMax - logMin) * t0)
    const hz1 = Math.exp(logMin + (logMax - logMin) * t1)
    const k0 = Math.max(kMin, Math.floor((hz0 * n) / sampleRate))
    const k1 = Math.min(kMax, Math.ceil((hz1 * n) / sampleRate))
    let m = 0
    for (let k = k0; k <= k1; k++) m = Math.max(m, mag[k] ?? 0)
    out[b] = m
    if (m > peak) peak = m
  }
  for (let b = 0; b < binCount; b++) out[b] = Math.min(1, out[b]! / peak)
  return out
}
