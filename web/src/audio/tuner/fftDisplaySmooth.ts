/**
 * Temporal smoothing + peak-hold for FFT display bins.
 */

export type FftDisplaySmoothState = {
  smoothed: Float32Array | null
  peakHold: Float32Array | null
}

export function createFftDisplaySmoothState(): FftDisplaySmoothState {
  return { smoothed: null, peakHold: null }
}

export function resetFftDisplaySmooth(state: FftDisplaySmoothState): void {
  state.smoothed = null
  state.peakHold = null
}

export type ApplyFftDisplaySmoothOpts = {
  /** EMA coefficient for live bars (0…1). Default 0.22. */
  alpha?: number
  /** Peak-hold decay per frame (0…1). Default 0.965. */
  peakDecay?: number
  smoothing?: boolean
  peakHold?: boolean
}

/**
 * Returns display bins (and optional peak-hold overlay) for painting.
 * Mutates `state` for continuity across frames.
 */
export function applyFftDisplaySmooth(
  state: FftDisplaySmoothState,
  incoming: Float32Array,
  opts: ApplyFftDisplaySmoothOpts = {},
): { bins: Float32Array; peaks: Float32Array | null } {
  const alpha = opts.alpha ?? 0.22
  const decay = opts.peakDecay ?? 0.965
  const doSmooth = opts.smoothing !== false
  const doPeak = opts.peakHold === true
  const n = incoming.length

  if (!doSmooth) {
    state.smoothed = null
    if (!doPeak) {
      state.peakHold = null
      return { bins: incoming, peaks: null }
    }
  }

  if (!state.smoothed || state.smoothed.length !== n) {
    state.smoothed = new Float32Array(incoming)
  } else if (doSmooth) {
    for (let i = 0; i < n; i++) {
      state.smoothed[i] = state.smoothed[i]! + alpha * (incoming[i]! - state.smoothed[i]!)
    }
  } else {
    state.smoothed.set(incoming)
  }

  let peaks: Float32Array | null = null
  if (doPeak) {
    if (!state.peakHold || state.peakHold.length !== n) {
      state.peakHold = new Float32Array(state.smoothed)
    } else {
      for (let i = 0; i < n; i++) {
        const v = state.smoothed[i]!
        state.peakHold[i] = Math.max(v, state.peakHold[i]! * decay)
      }
    }
    peaks = state.peakHold
  } else {
    state.peakHold = null
  }

  return { bins: state.smoothed, peaks }
}
