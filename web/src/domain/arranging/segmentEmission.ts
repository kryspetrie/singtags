/**
 * Segment-level emission: score a candidate home against Lead PCs in a span.
 * Used to break single-note scale-degree ties (I↔V, II↔IV) without chart roots.
 */
import type { MelodyEvent } from './types'

const CHORD_TONE_RELS = [0, 4, 7, 10] as const // 1, 3, 5, ♭7

function overlapTicks(
  noteStart: number,
  noteDur: number,
  spanStart: number,
  spanEnd: number,
): number {
  const noteEnd = noteStart + Math.max(1, noteDur)
  const a = Math.max(noteStart, spanStart)
  const b = Math.min(noteEnd, spanEnd)
  return Math.max(0, b - a)
}

/**
 * Duration-weighted fraction of Lead material that fits `homeDeg` chord tones
 * (Mm7 set). Returns 0..1 — no soft color tones (they blurred I vs V).
 */
export function segmentChordToneFit(opts: {
  melody: readonly MelodyEvent[]
  startTick: number
  endTick: number
  tonality: number
  homeDeg: number
}): number {
  const spanStart = opts.startTick
  const spanEnd = Math.max(opts.endTick, spanStart + 1)
  const rootPc = ((opts.tonality + opts.homeDeg) % 12 + 12) % 12
  const chord = new Set(CHORD_TONE_RELS.map((r) => (rootPc + r) % 12))

  let weight = 0
  let chordW = 0
  for (const n of opts.melody) {
    const w = overlapTicks(n.startTick, n.durationTicks, spanStart, spanEnd)
    if (w <= 0) continue
    weight += w
    const pc = ((n.midi % 12) + 12) % 12
    if (chord.has(pc)) chordW += w
  }
  if (weight <= 0) return 0
  return chordW / weight
}

/** Distinct chord-tone PCs present in the span (for overturn confidence). */
export function segmentChordToneDiversity(opts: {
  melody: readonly MelodyEvent[]
  startTick: number
  endTick: number
  tonality: number
  homeDeg: number
}): number {
  const spanStart = opts.startTick
  const spanEnd = Math.max(opts.endTick, spanStart + 1)
  const rootPc = ((opts.tonality + opts.homeDeg) % 12 + 12) % 12
  const chord = new Set(CHORD_TONE_RELS.map((r) => (rootPc + r) % 12))
  const seen = new Set<number>()
  for (const n of opts.melody) {
    const w = overlapTicks(n.startTick, n.durationTicks, spanStart, spanEnd)
    if (w <= 0) continue
    const pc = ((n.midi % 12) + 12) % 12
    if (chord.has(pc)) seen.add(pc)
  }
  return seen.size
}

/**
 * Score additive for Strong-root ranking (same units as proposeRootForStrongNote).
 * Typical range ~0..3.5 when fit is strong.
 */
export function segmentEmissionBonus(opts: {
  melody: readonly MelodyEvent[]
  startTick: number
  endTick: number
  tonality: number
  homeDeg: number
  weight?: number
}): number {
  const fit = segmentChordToneFit(opts)
  const w = opts.weight ?? 3.5
  // Emphasize clear winners; near-ties stay small.
  return fit * w
}
