/**
 * Confidence-scaled cents display policy for Digital Tuner.
 * High clarity → 0.1¢; otherwise integer cents. Never invent false precision.
 */

export type DisplayCentsOpts = {
  /** Estimator clarity 0…1 (higher = more trustworthy). */
  clarity: number
  /** Clarity at/above this shows one decimal place. Default 0.85. */
  highClarity?: number
}

/** Format a signed cents error for the Tune readout. */
export function formatDisplayCents(cents: number, opts: DisplayCentsOpts): string {
  if (!Number.isFinite(cents)) return '—'
  const high = opts.highClarity ?? 0.85
  const clarity = Number.isFinite(opts.clarity) ? Math.max(0, Math.min(1, opts.clarity)) : 0
  if (clarity >= high) {
    const v = Math.round(cents * 10) / 10
    const body = Number.isInteger(v) ? v.toFixed(1) : String(v)
    return `${v > 0 ? '+' : ''}${body}¢`
  }
  const v = Math.round(cents)
  return `${v > 0 ? '+' : ''}${v}¢`
}

/** True when |cents| is within the green in-tune window. */
export function isInTuneCents(cents: number, windowCents: number): boolean {
  if (!Number.isFinite(cents) || !Number.isFinite(windowCents) || windowCents < 0) return false
  return Math.abs(cents) <= windowCents
}
