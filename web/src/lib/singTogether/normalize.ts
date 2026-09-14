/**
 * Text normalization and exact / partial / fuzzy string comparison.
 */
import type { Voicing } from './types'
import { isVoicing } from './types'

export type TextMatchMode = 'exact' | 'partial' | 'fuzzy'

/** Collapse case/whitespace; strip light punctuation for comparison. */
export function normalizeText(raw: string): string {
  return raw
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase()
    .replace(/['’]/g, '')
    .replace(/[.,/#!$%^&*;:{}=_`~()[\]"“”]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Stronger normalize for fuzzy: drop leading articles and parentheticals. */
export function normalizeForFuzzy(raw: string): string {
  let s = normalizeText(raw)
  s = s.replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim()
  s = s.replace(/^(the|a|an)\s+/i, '')
  return s
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0
  if (!a.length) return b.length
  if (!b.length) return a.length
  const prev = new Array<number>(b.length + 1)
  const cur = new Array<number>(b.length + 1)
  for (let j = 0; j <= b.length; j++) prev[j] = j
  for (let i = 1; i <= a.length; i++) {
    cur[0] = i
    const ca = a.charCodeAt(i - 1)
    for (let j = 1; j <= b.length; j++) {
      const cost = ca === b.charCodeAt(j - 1) ? 0 : 1
      cur[j] = Math.min(cur[j - 1]! + 1, prev[j]! + 1, prev[j - 1]! + cost)
    }
    for (let j = 0; j <= b.length; j++) prev[j] = cur[j]!
  }
  return prev[b.length]!
}

/** 1 = identical, 0 = totally different (by edit distance). */
export function similarity(a: string, b: string): number {
  if (!a && !b) return 1
  if (!a || !b) return 0
  const dist = levenshtein(a, b)
  return 1 - dist / Math.max(a.length, b.length)
}

/**
 * Compare two display strings under a match mode.
 * Empty / unspecified: caller decides wildcard behavior before calling.
 */
export function textsMatch(a: string, b: string, mode: TextMatchMode): boolean {
  const na = normalizeText(a)
  const nb = normalizeText(b)
  if (!na || !nb) return false

  if (mode === 'exact') return na === nb

  // Partial: containment after normalize (shorter must be ≥3 chars unless equal).
  if (na === nb) return true
  const shorter = na.length <= nb.length ? na : nb
  const longer = na.length <= nb.length ? nb : na
  if (shorter.length >= 3 && longer.includes(shorter)) return true
  // Token subset: every token of shorter appears in longer.
  const shortToks = shorter.split(' ').filter(Boolean)
  const longToks = new Set(longer.split(' ').filter(Boolean))
  if (shortToks.length > 0 && shortToks.every((t) => longToks.has(t))) return true

  if (mode === 'partial') return false

  // Fuzzy: articles/parens stripped + similarity threshold, or strong partial.
  const fa = normalizeForFuzzy(a)
  const fb = normalizeForFuzzy(b)
  if (!fa || !fb) return false
  if (fa === fb) return true
  if (fa.length >= 3 && fb.includes(fa)) return true
  if (fb.length >= 3 && fa.includes(fb)) return true
  const sim = similarity(fa, fb)
  // Short titles need higher similarity (typos still catchable).
  const threshold = Math.min(fa.length, fb.length) <= 5 ? 0.8 : 0.72
  return sim >= threshold
}

/**
 * Field match with wildcards: empty value matches anything when `allowUnspecified`.
 * Title should call with allowUnspecified=false.
 */
export function fieldMatch(
  a: string,
  b: string,
  mode: TextMatchMode,
  allowUnspecified: boolean,
): boolean {
  const ta = a.trim()
  const tb = b.trim()
  if (!ta && !tb) return allowUnspecified
  if (!ta || !tb) return allowUnspecified
  return textsMatch(ta, tb, mode)
}

export function voicingsMatch(
  a: Voicing | '' | undefined | null,
  b: Voicing | '' | undefined | null,
  allowUnspecified: boolean,
): boolean {
  const va = a && isVoicing(a) ? a : ''
  const vb = b && isVoicing(b) ? b : ''
  if (!va && !vb) return allowUnspecified
  if (!va || !vb) return allowUnspecified
  return va === vb
}

/** Stable exact key (legacy / tests). */
export function songMatchKey(title: string, arranger: string, voicing: Voicing): string {
  return `${normalizeText(title)}|${normalizeText(arranger)}|${voicing}`
}

export function parseVoicing(raw: unknown, fallback?: Voicing): Voicing | undefined {
  if (raw == null || raw === '') return fallback
  if (typeof raw === 'string') {
    const t = raw.trim().toUpperCase()
    if (!t) return fallback
    if (isVoicing(t)) return t
  }
  return fallback
}
