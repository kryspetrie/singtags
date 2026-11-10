/**
 * Pure FFT peak picking for Analyze (Phase 6).
 * Uses the same real-DFT path as multiF0; returns note-labeled peaks.
 */

import { noteFromHz } from '../../domain/tuner/noteFromHz'
import { keyGridOffsetCents, type KeyGridTemperament } from '../../domain/tuner/keyGridTemperament'
import { multiF0 } from './multiF0'

export type FftPeak = {
  hz: number
  salience: number
  note: string | null
  /** Cents vs key-grid (or equal) target for nearest note. */
  errorCents: number | null
}

export type FftPeaksOpts = {
  a4Hz?: number
  keyPc?: number
  temperament?: KeyGridTemperament
  customOffsetsCents?: readonly number[]
  maxPeaks?: number
  fMinHz?: number
  fMaxHz?: number
}

/** Top spectral peaks with note / cents annotation. */
export function fftPeaks(
  frame: Float32Array,
  sampleRate: number,
  opts: FftPeaksOpts = {},
): FftPeak[] {
  const a4 = opts.a4Hz ?? 440
  const { peaks } = multiF0(frame, sampleRate, {
    a4Hz: a4,
    maxPeaks: opts.maxPeaks ?? 12,
    fMinHz: opts.fMinHz ?? 50,
    fMaxHz: opts.fMaxHz ?? 4000,
    salienceFloor: 0.08,
  })
  return peaks.map((p) => {
    const n = noteFromHz(p.hz, a4)
    if (!n) return { hz: p.hz, salience: p.salience, note: null, errorCents: null }
    const pc = ((n.midi % 12) + 12) % 12
    const grid = keyGridOffsetCents(
      pc,
      opts.keyPc ?? 0,
      opts.temperament ?? 'equal',
      opts.customOffsetsCents,
    )
    return {
      hz: p.hz,
      salience: p.salience,
      note: n.name,
      errorCents: n.cents - grid,
    }
  })
}
