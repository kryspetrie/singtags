/**
 * 10-foot Glance vocabulary — wash + huge words (never color-only).
 * Shared across Tune / Chord / FFT / Spec so surfaces feel like one product.
 */

import type { ChordStackScore } from './chordStack'

export type GlanceWash = 'neutral' | 'good' | 'sharp' | 'flat' | 'shifted' | 'fix'

export type TuneGlanceKind = 'wait' | 'inTune' | 'sharp' | 'flat'

export type TuneGlanceStatus = {
  kind: TuneGlanceKind
  /** Room-scale word. */
  word: 'WAIT' | 'IN TUNE' | 'SHARP' | 'FLAT'
  wash: GlanceWash
}

export type ChordGlanceKind = 'wait' | 'locked' | 'shifted' | 'fix'

export type ChordGlanceStatus = {
  kind: ChordGlanceKind
  word: 'WAIT' | 'LOCKED' | 'FIX'
  /** Present when locked but sharp/flat of key. */
  keyMark: '▲' | '▼' | null
  wash: GlanceWash
}

export type AnalyzeGlanceKind = 'wait' | 'live' | 'paused' | 'held'

export type AnalyzeGlanceStatus = {
  kind: AnalyzeGlanceKind
  word: 'WAIT' | 'LIVE' | 'PAUSED' | 'HELD'
  wash: GlanceWash
  /** Optional subtitle under the hero word (e.g. peak count). */
  detail: string | null
}

/** Solo Tune glance from live cents / in-tune window. */
export function tuneGlanceStatus(
  cents: number | null,
  inTune: boolean,
): TuneGlanceStatus {
  if (cents == null || !Number.isFinite(cents)) {
    return { kind: 'wait', word: 'WAIT', wash: 'neutral' }
  }
  if (inTune) return { kind: 'inTune', word: 'IN TUNE', wash: 'good' }
  if (cents > 0) return { kind: 'sharp', word: 'SHARP', wash: 'sharp' }
  return { kind: 'flat', word: 'FLAT', wash: 'flat' }
}

/** Chord Analyze glance from stack score (Assisted pin → WAIT). */
export function chordGlanceStatus(score: ChordStackScore | null): ChordGlanceStatus {
  if (!score || score.unstable || score.assistedPinRequired || score.status === 'wait') {
    return { kind: 'wait', word: 'WAIT', wash: 'neutral', keyMark: null }
  }
  if (score.status === 'locked') {
    return { kind: 'locked', word: 'LOCKED', wash: 'good', keyMark: null }
  }
  if (score.status === 'shifted') {
    const keyMark = score.commonShiftCents >= 0 ? '▲' : '▼'
    return { kind: 'shifted', word: 'LOCKED', wash: 'shifted', keyMark }
  }
  return { kind: 'fix', word: 'FIX', wash: 'fix', keyMark: null }
}

/** FFT / Spec glance — same wash vocabulary as Tune/Chord. */
export function analyzeGlanceStatus(opts: {
  paused: boolean
  /** True once the surface has something to show (peaks / columns). */
  hasSignal: boolean
  /** Spec held tracks or strong FFT fundamentals. */
  heldOrStrong?: boolean
  /** Short room-scale detail, e.g. "3 peaks". */
  detail?: string | null
}): AnalyzeGlanceStatus {
  if (opts.paused) {
    return { kind: 'paused', word: 'PAUSED', wash: 'neutral', detail: opts.detail ?? null }
  }
  if (!opts.hasSignal) {
    return { kind: 'wait', word: 'WAIT', wash: 'neutral', detail: null }
  }
  if (opts.heldOrStrong) {
    return { kind: 'held', word: 'HELD', wash: 'good', detail: opts.detail ?? null }
  }
  return { kind: 'live', word: 'LIVE', wash: 'good', detail: opts.detail ?? null }
}
