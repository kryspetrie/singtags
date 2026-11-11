/**
 * Chord beat / relative scope — phase drift between live F0 and JI target.
 * Pure model for Lissajous-style teaching display.
 */

export type BeatScopeSample = {
  /** Live oscillator phase 0…1. */
  livePhase01: number
  /** Reference (target) phase 0…1. */
  refPhase01: number
  /** Relative beat rate (Hz); ~0 when locked. */
  beatHz: number
  locked: boolean
}

export const BEAT_HZ_PER_CENT = 0.05

function wrap01(v: number): number {
  if (!Number.isFinite(v)) return 0
  const r = v % 1
  return r < 0 ? r + 1 : r
}

/** Cents between two frequencies. */
export function centsBetweenHz(liveHz: number, targetHz: number): number | null {
  if (!(liveHz > 0) || !(targetHz > 0)) return null
  return 1200 * Math.log2(liveHz / targetHz)
}

export function advanceBeatScope(
  livePhase01: number,
  refPhase01: number,
  cents: number | null,
  dtSec: number,
  deadbandCents = 1,
): BeatScopeSample {
  if (cents == null || !Number.isFinite(cents)) {
    return {
      livePhase01: wrap01(livePhase01),
      refPhase01: wrap01(refPhase01),
      beatHz: 0,
      locked: false,
    }
  }
  const locked = Math.abs(cents) < deadbandCents
  const beatHz = locked ? 0 : cents * BEAT_HZ_PER_CENT
  const refRate = 1 // visual ref cycles/sec
  const liveRate = refRate + beatHz
  if (!(dtSec > 0)) {
    return { livePhase01: wrap01(livePhase01), refPhase01: wrap01(refPhase01), beatHz, locked }
  }
  return {
    livePhase01: wrap01(livePhase01 + liveRate * dtSec),
    refPhase01: wrap01(refPhase01 + refRate * dtSec),
    beatHz,
    locked,
  }
}

/** Lissajous point: x=sin(ref), y=sin(live). */
export function beatScopePoint(refPhase01: number, livePhase01: number): { x: number; y: number } {
  return {
    x: Math.sin(2 * Math.PI * wrap01(refPhase01)),
    y: Math.sin(2 * Math.PI * wrap01(livePhase01)),
  }
}
