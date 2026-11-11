/**
 * Confidence-scaled cents display policy for Digital Tuner.
 * High clarity → 0.1¢; otherwise integer cents. Never invent false precision.
 * Layout uses fixed-width parts so sign / digits / unit don't jitter.
 */

export type DisplayCentsOpts = {
  /** Estimator clarity 0…1 (higher = more trustworthy). */
  clarity: number
  /** Clarity at/above this shows one decimal place. Default 0.85. */
  highClarity?: number
}

export type DisplayCentsParts = {
  /** '+' | '−' | '\u00a0' (nbsp for zero) | '—' */
  sign: string
  /** Absolute magnitude string, fixed width via CSS. */
  body: string
  unit: '¢'
  /** Compact string for a11y / export. */
  text: string
}

/** Format a signed cents error for the Tune readout. */
export function formatDisplayCents(cents: number, opts: DisplayCentsOpts): string {
  return formatDisplayCentsParts(cents, opts).text
}

/** Fixed-slot parts for tabular cents readout. */
export function formatDisplayCentsParts(cents: number, opts: DisplayCentsOpts): DisplayCentsParts {
  if (!Number.isFinite(cents)) return { sign: '—', body: '', unit: '¢', text: '—' }
  const high = opts.highClarity ?? 0.85
  const clarity = Number.isFinite(opts.clarity) ? Math.max(0, Math.min(1, opts.clarity)) : 0
  const signed =
    clarity >= high ? Math.round(cents * 10) / 10 : Math.round(cents)
  const sign = signed > 0 ? '+' : signed < 0 ? '−' : '\u00a0'
  const abs = Math.abs(signed)
  const body = clarity >= high ? abs.toFixed(1) : String(Math.round(abs))
  const asciiSign = signed > 0 ? '+' : signed < 0 ? '-' : ''
  return {
    sign,
    body,
    unit: '¢',
    text: signed === 0 ? `${body}¢` : `${asciiSign}${body}¢`,
  }
}

/** True when |cents| is within the green in-tune window. */
export function isInTuneCents(cents: number, windowCents: number): boolean {
  if (!Number.isFinite(cents) || !Number.isFinite(windowCents) || windowCents < 0) return false
  return Math.abs(cents) <= windowCents
}
