/**
 * Phase-comparator strobe model (pure) — cents → phase advance for horizontal stripes.
 * Detail-only; Glance never paints strobe.
 */

/** Cycles/sec per cent of detune (visual calibration). */
export const STROBE_HZ_PER_CENT = 0.08

export type StrobePhaseSample = {
  /** Wrapped phase in [0, 1). */
  phase01: number
  /** Signed advance rate in cycles/sec (positive = sharp / drift one way). */
  rateHz: number
  /** Coarse direction for tests / a11y. */
  direction: -1 | 0 | 1
}

/** Map signed cents error to strobe drift rate (Hz). */
export function centsToStrobeRateHz(cents: number): number {
  if (!Number.isFinite(cents)) return 0
  return cents * STROBE_HZ_PER_CENT
}

/** Direction of visual drift from cents (0 when |cents| < deadband). */
export function centsToStrobeDirection(cents: number, deadbandCents = 0.5): -1 | 0 | 1 {
  if (!Number.isFinite(cents) || Math.abs(cents) < deadbandCents) return 0
  return cents > 0 ? 1 : -1
}

/**
 * Advance strobe phase by `dtSec` given current cents error.
 * Positive cents → increasing phase (sharp drifts one way).
 */
export function advanceStrobePhase(phase01: number, cents: number, dtSec: number): StrobePhaseSample {
  const rateHz = centsToStrobeRateHz(cents)
  const direction = centsToStrobeDirection(cents)
  if (!(dtSec > 0) || !Number.isFinite(phase01)) {
    return { phase01: wrap01(phase01), rateHz, direction }
  }
  return {
    phase01: wrap01(phase01 + rateHz * dtSec),
    rateHz,
    direction,
  }
}

function wrap01(v: number): number {
  if (!Number.isFinite(v)) return 0
  const r = v % 1
  return r < 0 ? r + 1 : r
}

/**
 * Horizontal stripe paint model for one frame.
 * `stripeCount` bands across the height; phase shifts them horizontally.
 */
export function strobeStripeOffsets(
  phase01: number,
  stripeCount: number,
  widthPx: number,
): number[] {
  const n = Math.max(1, Math.floor(stripeCount))
  const w = Math.max(1, widthPx)
  const phasePx = wrap01(phase01) * w
  const out: number[] = []
  for (let i = 0; i < n; i++) {
    out.push(((i / n) * w + phasePx) % w)
  }
  return out
}
