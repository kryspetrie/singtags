/**
 * Shared theory scoring helpers for ranking / autocomplete / VL.
 */
import type { VoicingPitches } from './chords'
import { scoreHarmonicSeriesSpacing } from './spacing/harmonicSeriesSpacing'
import { resolutionScore, tensionReleaseCandidateScore } from './tensionRelease'

const VOICES = ['bass', 'bari', 'lead', 'tenor'] as const

export type MelodyVoiceOpts = {
  /** Part that carries the melody — excluded from VL / common-tone hold metrics. Default lead. */
  melodyVoice?: keyof VoicingPitches
}

function pc(m: number): number {
  return ((m % 12) + 12) % 12
}

function harmonyVoices(melodyVoice: keyof VoicingPitches): readonly (keyof VoicingPitches)[] {
  return VOICES.filter((v) => v !== melodyVoice)
}

/**
 * Prefer small total motion in non-melody parts (default: bass/bari/tenor).
 * Melody leaps required by the tune do not reduce the score.
 * Scale: 3 harmony voices × ~6 semitones → total 18 → score 0.
 */
export function voiceLeadScore(
  prev: VoicingPitches | null | undefined,
  next: VoicingPitches,
  opts?: MelodyVoiceOpts,
): number {
  if (!prev) return 0.5
  const melody = opts?.melodyVoice ?? 'lead'
  let total = 0
  for (const v of harmonyVoices(melody)) {
    total += Math.abs(next[v] - prev[v])
  }
  return Math.max(0, 1 - total / 18)
}

export function contraryMotionScore(
  prev: VoicingPitches | null | undefined,
  next: VoicingPitches,
): number {
  if (!prev) return 0.5
  const bassDir = Math.sign(next.bass - prev.bass)
  if (bassDir === 0) return 0.55
  const upperDeltas = [next.bari - prev.bari, next.lead - prev.lead, next.tenor - prev.tenor]
  const upperMoves = upperDeltas.filter((d) => d !== 0)
  if (!upperMoves.length) return 0.5
  const contrary = upperMoves.filter((d) => Math.sign(d) === -bassDir).length
  return contrary / upperMoves.length
}

/**
 * Prefer holding shared chord tones in the same voice.
 * When `melodyVoice` is set (ranking default: lead), only harmony parts count —
 * melody PC changes do not dilute the hold ratio. Omit opts for full-four QA lint.
 */
export function commonToneScore(
  prev: VoicingPitches | null | undefined,
  next: VoicingPitches,
  opts?: MelodyVoiceOpts,
): number {
  if (!prev) return 0.5
  const scored = opts?.melodyVoice != null ? harmonyVoices(opts.melodyVoice) : VOICES
  let holds = 0
  let shared = 0
  for (const v of scored) {
    const p = pc(prev[v])
    // Does next chord still contain this PC somewhere?
    const still = VOICES.some((w) => pc(next[w]) === p)
    if (!still) continue
    shared++
    if (pc(next[v]) === p) holds++
  }
  if (!shared) return 0.5
  return holds / shared
}

export function parallelPerfectPenalty(
  prev: VoicingPitches | null | undefined,
  next: VoicingPitches,
): number {
  if (!prev) return 0
  let hits = 0
  const pairs: [keyof VoicingPitches, keyof VoicingPitches][] = [
    ['bass', 'tenor'],
    ['bass', 'lead'],
    ['bass', 'bari'],
    ['bari', 'tenor'],
    ['lead', 'tenor'],
    ['bari', 'lead'],
  ]
  for (const [lo, hi] of pairs) {
    const d0 = prev[hi] - prev[lo]
    const d1 = next[hi] - next[lo]
    const moved = prev[lo] !== next[lo] || prev[hi] !== next[hi]
    if (!moved) continue
    if ((d0 === 7 && d1 === 7) || (d0 === 12 && d1 === 12) || (d0 === -7 && d1 === -7)) {
      // BAM: outer tenor–bass parallels are the ones to watch most
      hits += lo === 'bass' && hi === 'tenor' ? 1.5 : 1
    }
  }
  // All moving parts same direction (excluding static)
  const dirs = VOICES.map((v) => Math.sign(next[v] - prev[v])).filter((d) => d !== 0)
  if (dirs.length >= 3 && dirs.every((d) => d === dirs[0])) hits += 1.5
  return Math.min(1, hits / 3)
}

export function spacingScore(midi: VoicingPitches): number {
  return scoreHarmonicSeriesSpacing(midi).score
}

export function theoryRankBonuses(opts: {
  midi: VoicingPitches
  prevMidi?: VoicingPitches | null
  natureId: string
  rootPc: number
  layer: string
  nextPillarRoot: number | null
  towardPillar: boolean
  prevDominant?: { rootPc: number; natureId: string; midi: VoicingPitches } | null
  /** Default lead — melody-aware common-tone for ranking. */
  melodyVoice?: keyof VoicingPitches
}): {
  spacing: number
  contrary: number
  commonTone: number
  parallelPenalty: number
  tensionRelease: number
  resolution: number
} {
  const melodyVoice = opts.melodyVoice ?? 'lead'
  const spacing = spacingScore(opts.midi)
  const contrary = contraryMotionScore(opts.prevMidi, opts.midi)
  const commonTone = commonToneScore(opts.prevMidi, opts.midi, { melodyVoice })
  const parallelPenalty = parallelPerfectPenalty(opts.prevMidi, opts.midi)
  const tensionRelease = tensionReleaseCandidateScore({
    natureId: opts.natureId,
    rootPc: opts.rootPc,
    layer: opts.layer,
    nextPillarRoot: opts.nextPillarRoot,
    towardPillar: opts.towardPillar,
  })
  const resolution = opts.prevDominant
    ? resolutionScore(opts.prevDominant, opts.midi)
    : 0.5
  return { spacing, contrary, commonTone, parallelPenalty, tensionRelease, resolution }
}
