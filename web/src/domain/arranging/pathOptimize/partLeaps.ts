/**
 * Part-aware leap / jumpiness for Path Optimize.
 *
 * Melody (lead) is given — do not score it. Bari is a flexible counter-melody.
 * Jumpiness is driven by tenor + bass. Bass may take an occasional octave leap.
 */
import type { VoicingPitches } from '../chords'

/** Soft filter caps (semitones) from Basic (0) → Risky (1). */
export function leapCapsForRisk(risk: number): {
  tenor: number
  bass: number
  bari: number
} {
  const r = Math.min(1, Math.max(0, risk))
  return {
    // Basic needs room to settle onto a root-doubled tonic after a BS7 shell
    // (tenor often moves ~5–7). Octave-only was too tight and trapped paths on I7.
    tenor: Math.round(7 + r * 4), // 7…11
    bass: Math.round(7 + r * 4), // 7…11 (octave 12 always allowed)
    bari: Math.round(12 + r * 5), // 12…17 (bari is the flexible voice)
  }
}

/** True when bass leap is an octave (common acceptable bass move). */
export function isBassOctaveLeap(prev: number, next: number): boolean {
  return Math.abs(next - prev) === 12
}

/**
 * Cost of one transition — higher = jumpier.
 * Tenor weighted highest; bass high (octave discounted); bari light; lead ignored.
 */
export function partJumpCost(prev: VoicingPitches, next: VoicingPitches): number {
  const tenor = Math.abs(next.tenor - prev.tenor)
  const bass = Math.abs(next.bass - prev.bass)
  const bari = Math.abs(next.bari - prev.bari)
  const bassCost = bass === 12 ? 1.25 : bass
  return tenor * 1.65 + bassCost * 1.25 + bari * 0.3
}

/** 0–1 smoother is better (for ranking / path score blend). */
export function partAwareVoiceLeadScore(
  prev: VoicingPitches | null | undefined,
  next: VoicingPitches,
): number {
  if (!prev) return 0.55
  // Typical bad jump ~14–18 weighted cost.
  return Math.max(0, 1 - partJumpCost(prev, next) / 16)
}

/**
 * Hard filter: reject candidates with illegal tenor/bass (or catastrophic bari) leaps.
 * Bass octave is always allowed. Explore gets a small cap bump so Try again can diversify.
 */
export function leapsWithinCaps(
  prev: VoicingPitches | null | undefined,
  next: VoicingPitches,
  risk: number,
  nextNeighbor?: VoicingPitches | null,
  explore = false,
): boolean {
  const caps = leapCapsForRisk(explore ? Math.min(1, risk + 0.25) : risk)
  if (explore) {
    caps.tenor += 2
    caps.bass += 2
    caps.bari += 3
  }
  const okPair = (a: VoicingPitches, b: VoicingPitches): boolean => {
    const t = Math.abs(b.tenor - a.tenor)
    const bass = Math.abs(b.bass - a.bass)
    const bari = Math.abs(b.bari - a.bari)
    if (t > caps.tenor) return false
    // Settling down from a high V7 into a root-doubled tonic often drops
    // bass/bari a 9th–11th — allow descending settle more than ascending thrash.
    const bassDescOk = b.bass < a.bass && bass <= Math.max(caps.bass + 5, 16)
    if (bass !== 12 && bass > caps.bass && !bassDescOk) return false
    const bariDescOk = b.bari < a.bari && bari <= Math.max(caps.bari + 3, 14)
    if (bari > caps.bari && !bariDescOk) return false
    return true
  }
  if (prev && !okPair(prev, next)) return false
  if (nextNeighbor && !okPair(next, nextNeighbor)) return false
  return true
}

/** Max tenor leap or non-octave bass leap across a path (critical parts). */
export function maxCriticalLeap(seq: readonly VoicingPitches[]): number {
  let max = 0
  for (let i = 1; i < seq.length; i++) {
    const a = seq[i - 1]!
    const b = seq[i]!
    max = Math.max(max, Math.abs(b.tenor - a.tenor))
    const bass = Math.abs(b.bass - a.bass)
    if (bass !== 12) max = Math.max(max, bass)
  }
  return max
}

/** Sum of partJumpCost across the path. */
export function pathJumpiness(seq: readonly VoicingPitches[]): number {
  let sum = 0
  for (let i = 1; i < seq.length; i++) {
    sum += partJumpCost(seq[i - 1]!, seq[i]!)
  }
  return sum
}

/**
 * Extra cost when a single transition's tenor/bass leap spikes vs the path median.
 * Catches “one weird inversion” in an otherwise smooth chart.
 */
export function outlierJumpPenalty(seq: readonly VoicingPitches[]): number {
  if (seq.length < 3) return 0
  const critical: number[] = []
  for (let i = 1; i < seq.length; i++) {
    const a = seq[i - 1]!
    const b = seq[i]!
    const t = Math.abs(b.tenor - a.tenor)
    const bass = Math.abs(b.bass - a.bass)
    critical.push(Math.max(t, bass === 12 ? 2 : bass))
  }
  const sorted = [...critical].sort((x, y) => x - y)
  const mid = sorted[Math.floor(sorted.length / 2)] ?? 0
  let pen = 0
  for (const c of critical) {
    if (c >= mid + 5 && c >= 6) pen += (c - mid) * 1.8
  }
  return pen
}
