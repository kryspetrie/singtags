/**
 * Peak-normalize a mono frame for more reliable F0 (quiet singers still clear).
 * Caps boost so noise floors aren't amplified into false pitches.
 */

export type NormalizeFrameOpts = {
  /** Target peak amplitude. Default 0.7. */
  targetPeak?: number
  /** Max gain multiplier. Default 12 (~21 dB). */
  maxGain?: number
  /** Skip rewrite when already near target. Default 0.08. */
  slack?: number
}

/** Return a peak-normalized copy (or the same buffer when already in range). */
export function normalizeFramePeak(
  frame: Float32Array,
  opts: NormalizeFrameOpts = {},
): Float32Array {
  const target = opts.targetPeak ?? 0.7
  const maxGain = opts.maxGain ?? 12
  const slack = opts.slack ?? 0.08
  if (!(target > 0) || frame.length === 0) return frame

  let peak = 0
  for (let i = 0; i < frame.length; i++) {
    const a = Math.abs(frame[i]!)
    if (a > peak) peak = a
  }
  if (peak < 1e-7) return frame

  const gain = Math.min(maxGain, target / peak)
  if (Math.abs(gain - 1) <= slack) return frame

  const out = new Float32Array(frame.length)
  for (let i = 0; i < frame.length; i++) out[i] = frame[i]! * gain
  return out
}
