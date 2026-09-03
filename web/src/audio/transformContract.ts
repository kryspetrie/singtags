/**
 * Pitch/speed transform contracts (pitch-speed-bake ADR).
 *
 * Kill-list: no MES for tag playback; no audible playbackRate ≠ 1; no PSOLA stretch
 * as default; no silent coupled fallback; no main-thread batch DSP; no automatic
 * downgrade to coupled playbackRate on worker failure; no independent per-channel
 * stretch without stereo-image proof.
 */
import { MIN_PITCH_SEMITONES, MAX_PITCH_SEMITONES, clampPitchSemitonesFractional } from './pitchPlayer'

export { MIN_PITCH_SEMITONES, MAX_PITCH_SEMITONES }

export const MIN_SPEED = 0.25
export const MAX_SPEED = 2
export const ALGORITHM_ID = 'wsola+formant'
export const ALGORITHM_VERSION = '1.0.0'

/** Canonical pitch (semitones) and speed multipliers after UI clamping/rounding. */
export type CanonicalTransform = {
  pitchSemitones: number
  speed: number
}

/** Clamp UI speed to supported range. */
export function clampSpeed(n: number): number {
  if (!Number.isFinite(n)) return 1
  return Math.min(MAX_SPEED, Math.max(MIN_SPEED, n))
}

function roundTo(n: number, decimals: number): number {
  const f = 10 ** decimals
  const r = Math.round(n * f) / f
  return Object.is(r, -0) ? 0 : r
}

/**
 * Clamp pitch to ± one octave without rounding — preserves fractional semitones
 * (e.g. shared fine detune as cents/100). UI controls still use {@link clampPitchSemitones}.
 */
function clampPitchSemitonesRange(n: number): number {
  return clampPitchSemitonesFractional(n)
}

/**
 * Canonicalize once at the public setter boundary.
 * Every identity / cache / worker / UI / audible comparison uses this value.
 */
export function canonicalizeTransform(pitch: number, speed: number): CanonicalTransform {
  const pitchSemitones = roundTo(clampPitchSemitonesRange(pitch), 2)
  const spd = roundTo(clampSpeed(speed), 3)
  return {
    pitchSemitones: pitchSemitones + 0,
    speed: spd + 0,
  }
}

export function isCanonicalIdentity(t: CanonicalTransform): boolean {
  return t.pitchSemitones === 0 && t.speed === 1
}

/** stretchFactor = 1 / speed (speed=0.5 → factor 2). */
export function stretchFactor(speed: number): number {
  const s = canonicalizeTransform(0, speed).speed
  return 1 / s
}

/**
 * Locked output-frame contract (P0.8):
 * - pitch-only (speed === 1): expectedFrames = inputFrames
 * - otherwise: expectedFrames = Math.round(inputFrames * stretchFactor)
 * Pitch must not change length; combined transforms still follow speed only.
 */
export function expectedFrames(inputFrames: number, speed: number): number {
  const s = canonicalizeTransform(0, speed).speed
  if (s === 1) return Math.max(0, Math.floor(inputFrames))
  return Math.max(0, Math.round(inputFrames * (1 / s)))
}

/** Trim/pad channel data to exactly `target` frames. */
export function normalizeToFrameCount(data: Float32Array, target: number): Float32Array {
  if (data.length === target) return data
  const out = new Float32Array(target)
  out.set(data.subarray(0, Math.min(data.length, target)))
  return out
}

export function bakeCacheKey(opts: {
  sourceRevision: string
  sampleRate: number
  channels: number
  pitchSemitones: number
  speed: number
  algorithmId?: string
  algorithmVersion?: string
}): string {
  const c = canonicalizeTransform(opts.pitchSemitones, opts.speed)
  const algo = opts.algorithmId ?? ALGORITHM_ID
  const ver = opts.algorithmVersion ?? ALGORITHM_VERSION
  return [
    opts.sourceRevision,
    opts.sampleRate,
    opts.channels,
    c.pitchSemitones,
    c.speed,
    algo,
    ver,
  ].join('|')
}

/** Map original timeline frame ↔ playable frame using measured lengths. */
export function originalFrameToPlayable(
  originalFrame: number,
  originalFrames: number,
  playableFrames: number,
): number {
  if (originalFrames <= 0) return 0
  return Math.round((originalFrame * playableFrames) / originalFrames)
}

export function playableFrameToOriginal(
  playableFrame: number,
  originalFrames: number,
  playableFrames: number,
): number {
  if (playableFrames <= 0) return 0
  return Math.round((playableFrame * originalFrames) / playableFrames)
}

export function originalSecondsToPlayable(
  originalSec: number,
  sampleRate: number,
  originalFrames: number,
  playableFrames: number,
): number {
  const of = Math.round(originalSec * sampleRate)
  return originalFrameToPlayable(of, originalFrames, playableFrames) / sampleRate
}

export function playableSecondsToOriginal(
  playableSec: number,
  sampleRate: number,
  originalFrames: number,
  playableFrames: number,
): number {
  const pf = Math.round(playableSec * sampleRate)
  return playableFrameToOriginal(pf, originalFrames, playableFrames) / sampleRate
}

/** Rough peak memory estimate (bytes) before accepting a bake. */
export function estimateBakePeakBytes(
  frames: number,
  channels: number,
  speed: number,
): number {
  const outFrames = expectedFrames(frames, speed)
  // original + worker copy + intermediates (~2×) + output
  const sampleBytes = 4
  return (frames * 2 + outFrames * 2) * channels * sampleBytes
}
