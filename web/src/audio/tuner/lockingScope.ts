/**
 * Phase-locked scope model (pure) — cents → scroll rate for a standing sine.
 * On pitch → wave freezes; sharp/flat → scrolls. Detail-only (not Glance).
 */

/** Cycles/sec per cent of detune (visual calibration; slightly softer than strobe). */
export const SCOPE_HZ_PER_CENT = 0.06

/** Visible sine cycles across the plot width. */
export const SCOPE_CYCLES = 2.5

export type ScopePhaseSample = {
  /** Wrapped phase in [0, 1). */
  phase01: number
  /** Signed scroll rate in cycles/sec (positive = sharp). */
  rateHz: number
  /** Coarse direction for tests / a11y. */
  direction: -1 | 0 | 1
  /** True when drift is visually “locked” (|cents| under deadband). */
  locked: boolean
}

function wrap01(v: number): number {
  if (!Number.isFinite(v)) return 0
  const r = v % 1
  return r < 0 ? r + 1 : r
}

/** Map signed cents error to scope scroll rate (Hz). */
export function centsToScopeRateHz(cents: number): number {
  if (!Number.isFinite(cents)) return 0
  return cents * SCOPE_HZ_PER_CENT
}

export function centsToScopeDirection(cents: number, deadbandCents = 0.5): -1 | 0 | 1 {
  if (!Number.isFinite(cents) || Math.abs(cents) < deadbandCents) return 0
  return cents > 0 ? 1 : -1
}

/**
 * Advance scope phase by `dtSec` given current cents error.
 * Positive cents → increasing phase (wave scrolls one way when sharp).
 */
export function advanceScopePhase(
  phase01: number,
  cents: number,
  dtSec: number,
  deadbandCents = 0.5,
): ScopePhaseSample {
  const rateHz = centsToScopeRateHz(cents)
  const direction = centsToScopeDirection(cents, deadbandCents)
  const locked = direction === 0
  if (!(dtSec > 0) || !Number.isFinite(phase01) || locked) {
    return { phase01: wrap01(phase01), rateHz: locked ? 0 : rateHz, direction, locked }
  }
  return {
    phase01: wrap01(phase01 + rateHz * dtSec),
    rateHz,
    direction,
    locked: false,
  }
}

/**
 * Sample the display sine at horizontal fraction `x01` (0…1).
 * Returns y in −1…1.
 */
export function scopeWaveY(
  phase01: number,
  x01: number,
  cycles: number = SCOPE_CYCLES,
): number {
  const x = Math.max(0, Math.min(1, x01))
  const p = wrap01(phase01)
  return Math.sin(2 * Math.PI * (cycles * x + p))
}

/**
 * Dense polyline samples for painting (x01, y−1…1).
 * `count` includes both endpoints.
 */
export function scopeWavePoints(
  phase01: number,
  count: number,
  cycles: number = SCOPE_CYCLES,
): Array<{ x01: number; y: number }> {
  const n = Math.max(2, Math.floor(count))
  const out: Array<{ x01: number; y: number }> = new Array(n)
  for (let i = 0; i < n; i++) {
    const x01 = i / (n - 1)
    out[i] = { x01, y: scopeWaveY(phase01, x01, cycles) }
  }
  return out
}
