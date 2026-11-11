/**
 * Live F0 display smoothing — median + EMA + MIDI hysteresis.
 * Pure state machine for unit tests; wired in useTunerCapture.
 */

export type SmoothLivePitchState = {
  /** Recent raw Hz (newest last), for short median. */
  recent: number[]
  /** Smoothed Hz after median→EMA. */
  emaHz: number | null
  /** Sticky MIDI for note-name / cents reference. */
  stickyMidi: number | null
  emaClarity: number
}

export type SmoothLivePitchOpts = {
  /** Median window (frames). Default 9 (~190 ms at 48 kHz / 1024 hop). */
  medianWindow?: number
  /** EMA coefficient on Hz after median (0…1). Default 0.08 — heavier smoothing. */
  emaAlpha?: number
  /** Extra cents past the ±50¢ boundary before MIDI flips. Default 35. */
  midiHysteresisCents?: number
  /** Snap EMA when sample jumps farther than this (¢). Default 500. */
  snapCents?: number
  /** Concert A for MIDI float. Default 440. */
  a4Hz?: number
}

export type SmoothLivePitchResult = {
  hz: number | null
  clarity: number
  /** Hysteresis-stable MIDI for naming / cents vs target. */
  displayMidi: number | null
}

export function createSmoothLivePitchState(): SmoothLivePitchState {
  return { recent: [], emaHz: null, stickyMidi: null, emaClarity: 0 }
}

export function resetSmoothLivePitch(state: SmoothLivePitchState): void {
  state.recent.length = 0
  state.emaHz = null
  state.stickyMidi = null
  state.emaClarity = 0
}

/** Push one accepted F0 sample; returns smoothed reading. */
export function smoothLivePitch(
  state: SmoothLivePitchState,
  sample: { hz: number; clarity: number },
  opts: SmoothLivePitchOpts = {},
): SmoothLivePitchResult {
  const medianWindow = opts.medianWindow ?? 9
  const emaAlpha = opts.emaAlpha ?? 0.08
  const hystCents = opts.midiHysteresisCents ?? 35
  const snapCents = opts.snapCents ?? 500
  const a4Hz = opts.a4Hz ?? 440

  if (!(sample.hz > 0) || !(a4Hz > 0)) {
    return { hz: state.emaHz, clarity: state.emaClarity, displayMidi: state.stickyMidi }
  }

  state.recent.push(sample.hz)
  while (state.recent.length > Math.max(1, medianWindow)) state.recent.shift()

  const med = medianHz(state.recent)
  if (state.emaHz == null) {
    state.emaHz = med
  } else {
    const jump = Math.abs(1200 * Math.log2(med / state.emaHz))
    state.emaHz = jump >= snapCents ? med : state.emaHz + emaAlpha * (med - state.emaHz)
  }

  const alphaC = Math.min(1, Math.max(0.05, emaAlpha + 0.1))
  state.emaClarity =
    state.emaClarity <= 0
      ? sample.clarity
      : state.emaClarity + alphaC * (sample.clarity - state.emaClarity)

  const midiFloat = 69 + 12 * Math.log2(state.emaHz / a4Hz)
  state.stickyMidi = updateStickyMidi(state.stickyMidi, midiFloat, hystCents)

  return {
    hz: state.emaHz,
    clarity: state.emaClarity,
    displayMidi: state.stickyMidi,
  }
}

function medianHz(xs: readonly number[]): number {
  const s = [...xs].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  if (s.length % 2 === 1) return s[mid]!
  return (s[mid - 1]! + s[mid]!) / 2
}

function updateStickyMidi(
  sticky: number | null,
  midiFloat: number,
  hysteresisCents: number,
): number {
  const rounded = Math.round(midiFloat)
  if (sticky == null || !Number.isFinite(sticky)) return rounded
  const hyst = Math.max(0, hysteresisCents) / 100
  const delta = midiFloat - sticky
  // Stay on sticky until past the note boundary by hysteresis.
  if (delta > 0.5 + hyst) return Math.floor(midiFloat + 0.5)
  if (delta < -0.5 - hyst) return Math.floor(midiFloat + 0.5)
  return sticky
}
