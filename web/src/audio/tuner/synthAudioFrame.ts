/**
 * Tiny synthetic PCM helpers for tests + reference-tone audition.
 * Kept separate from multiF0 / FFT so Tune UI does not pull the DSP graph.
 */

/** Mix unit sines for synthetic stack fixtures / buffer audition. */
export function synthStackFrame(
  partialsHz: readonly number[],
  sampleRate: number,
  length: number,
  amp = 0.25,
): Float32Array {
  const out = new Float32Array(length)
  for (const hz of partialsHz) {
    const w = (2 * Math.PI * hz) / sampleRate
    for (let i = 0; i < length; i++) out[i]! += Math.sin(w * i) * amp
  }
  for (let i = 0; i < length; i++) {
    const hann = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (length - 1))
    out[i]! *= hann
  }
  return out
}

/** Generate a unit-ish sine for golden tests. */
export function synthSineFrame(
  hz: number,
  sampleRate: number,
  length: number,
  amp = 0.5,
): Float32Array {
  const out = new Float32Array(length)
  const w = (2 * Math.PI * hz) / sampleRate
  for (let i = 0; i < length; i++) out[i] = Math.sin(w * i) * amp
  return out
}
