/**
 * User-tunable Detected scoring weights (JSON Tweaks).
 * Defaults match the shipped Mild/Bold interest engine.
 */
export const DETECTED_SCORE_TWEAKS_VERSION = 2 as const

export type DetectedScoreTweaks = {
  version: typeof DETECTED_SCORE_TWEAKS_VERSION
  /** Prefer plain I/IV/V when Lead is root or fifth. */
  triadHomeBoost: number
  /** Prefer triad over I7/IV7 when Lead is the chord root. */
  seventhOnIOrIvRootPenalty: number
  /** V7 color when Lead sits on 3 or 7 of V. */
  v7LeadOn3Or7Boost: number
  /** Light I7 color when Lead sits on 3 or 7 of I. */
  i7LeadOn3Or7Boost: number
  /** Demote springboard I7 at phrase end / tag. */
  phraseEndI7Penalty: number
  mild: {
    /** Prefer V7 over plain V when Lead is 5 of V and next supports tonic. */
    v7OverVWhenLeadOn5Boost: number
    plainVWhenLeadOn5Demote: number
    /** ii7 when next leans V (circle). */
    ii7CircleBoost: number
    ii7BaseBoost: number
    /**
     * Legacy: was used to demote ii7 under Bold so V7/V could steal ★.
     * Kept for Tweaks JSON compat; scoring no longer subtracts it.
     */
    boldIi7Demote: number
    /** Demote early V under ^2 when preparing V. */
    earlyVDemote: number
  }
  bold: {
    /** Secondary dominant lift when next leans V and Lead is characteristic. */
    secondaryBaseBoost: number
    /** Extra (or sole) lift when next leans V — also for non-characteristic tones. */
    secondaryCircleBoost: number
    /** Lead is the 9 — Dom9 is the point. */
    dom9OnNineBoost: number
    /** Soft Dom9 penalty when Lead is not the 9. */
    dom9SoftPenalty: number
    /** Dom9 / add6 / etc. when not Bold-special. */
    exoticPenalty: number
  }
  held: {
    /** Minimum hold length in beats before tension→resolve split. */
    minBeats: number
  }
}

export const DEFAULT_DETECTED_SCORE_TWEAKS: Readonly<DetectedScoreTweaks> = Object.freeze({
  version: DETECTED_SCORE_TWEAKS_VERSION,
  triadHomeBoost: 3.5,
  seventhOnIOrIvRootPenalty: 6,
  v7LeadOn3Or7Boost: 5,
  i7LeadOn3Or7Boost: 1.5,
  phraseEndI7Penalty: 10,
  mild: Object.freeze({
    v7OverVWhenLeadOn5Boost: 6,
    plainVWhenLeadOn5Demote: 2.5,
    ii7CircleBoost: 48,
    ii7BaseBoost: 10,
    boldIi7Demote: 0,
    earlyVDemote: 30,
  }),
  bold: Object.freeze({
    // Keep below Mild ii7CircleBoost (48) so ★ stays Mild-like; V7/V remains a strong alt.
    secondaryBaseBoost: 18,
    secondaryCircleBoost: 12,
    dom9OnNineBoost: 4,
    dom9SoftPenalty: 2,
    exoticPenalty: 8,
  }),
  held: Object.freeze({
    minBeats: 2,
  }),
})

function num(v: unknown, fallback: number): number {
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : fallback
}

function mergeMild(
  raw: unknown,
  base: DetectedScoreTweaks['mild'],
): DetectedScoreTweaks['mild'] {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  return {
    v7OverVWhenLeadOn5Boost: num(o.v7OverVWhenLeadOn5Boost, base.v7OverVWhenLeadOn5Boost),
    plainVWhenLeadOn5Demote: num(o.plainVWhenLeadOn5Demote, base.plainVWhenLeadOn5Demote),
    ii7CircleBoost: num(o.ii7CircleBoost, base.ii7CircleBoost),
    ii7BaseBoost: num(o.ii7BaseBoost, base.ii7BaseBoost),
    boldIi7Demote: num(o.boldIi7Demote, base.boldIi7Demote),
    earlyVDemote: num(o.earlyVDemote, base.earlyVDemote),
  }
}

function mergeBold(
  raw: unknown,
  base: DetectedScoreTweaks['bold'],
): DetectedScoreTweaks['bold'] {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  return {
    secondaryBaseBoost: num(o.secondaryBaseBoost, base.secondaryBaseBoost),
    secondaryCircleBoost: num(o.secondaryCircleBoost, base.secondaryCircleBoost),
    dom9OnNineBoost: num(o.dom9OnNineBoost, base.dom9OnNineBoost),
    dom9SoftPenalty: num(o.dom9SoftPenalty, base.dom9SoftPenalty),
    exoticPenalty: num(o.exoticPenalty, base.exoticPenalty),
  }
}

function mergeHeld(
  raw: unknown,
  base: DetectedScoreTweaks['held'],
): DetectedScoreTweaks['held'] {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  return {
    minBeats: Math.max(1, Math.min(16, num(o.minBeats, base.minBeats))),
  }
}

/** Deep-merge unknown JSON into a full tweaks object (unknown keys ignored). */
export function normalizeDetectedScoreTweaks(raw: unknown): DetectedScoreTweaks {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const d = DEFAULT_DETECTED_SCORE_TWEAKS
  const storedVer = num(o.version, 0)
  // v1 Bold defaults were far too aggressive (unconditional V7/V ★ theft).
  const migrateBold = storedVer < 2
  return {
    version: DETECTED_SCORE_TWEAKS_VERSION,
    triadHomeBoost: num(o.triadHomeBoost, d.triadHomeBoost),
    seventhOnIOrIvRootPenalty: num(o.seventhOnIOrIvRootPenalty, d.seventhOnIOrIvRootPenalty),
    v7LeadOn3Or7Boost: num(o.v7LeadOn3Or7Boost, d.v7LeadOn3Or7Boost),
    i7LeadOn3Or7Boost: num(o.i7LeadOn3Or7Boost, d.i7LeadOn3Or7Boost),
    phraseEndI7Penalty: num(o.phraseEndI7Penalty, d.phraseEndI7Penalty),
    mild: migrateBold
      ? { ...mergeMild(o.mild, d.mild), boldIi7Demote: d.mild.boldIi7Demote }
      : mergeMild(o.mild, d.mild),
    bold: migrateBold ? { ...d.bold } : mergeBold(o.bold, d.bold),
    held: mergeHeld(o.held, d.held),
  }
}

export function detectedScoreTweaksEqual(
  a: DetectedScoreTweaks,
  b: DetectedScoreTweaks,
): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

export function formatDetectedScoreTweaksJson(t: DetectedScoreTweaks): string {
  return `${JSON.stringify(t, null, 2)}\n`
}

export function parseDetectedScoreTweaksJson(text: string): {
  ok: true
  tweaks: DetectedScoreTweaks
} | {
  ok: false
  error: string
} {
  try {
    const raw = JSON.parse(text) as unknown
    if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) {
      return { ok: false, error: 'Tweaks must be a JSON object.' }
    }
    return { ok: true, tweaks: normalizeDetectedScoreTweaks(raw) }
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : 'Invalid JSON',
    }
  }
}
