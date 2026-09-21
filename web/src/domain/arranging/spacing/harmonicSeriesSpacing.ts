/**
 * Harmonic-series spacing heuristic — wide at bottom, tighter on top.
 * @see knowledge/17-general-theory-and-acappella.md
 */
import type { VoicingPitches } from '../chords'
import type { ChordStack } from '../types'

export type SpacingIssue = {
  id: string
  severity: 'warn' | 'info'
  message: string
  stackId?: string
  teachingId: string
}

export type SpacingReport = {
  /** 0..1 higher = better series-like spacing */
  score: number
  bassToNext: number
  upperSpan: number
  tenorLeadGap: number
  issues: SpacingIssue[]
}

function parts(m: VoicingPitches): { name: keyof VoicingPitches; midi: number }[] {
  return (
    [
      { name: 'bass' as const, midi: m.bass },
      { name: 'bari' as const, midi: m.bari },
      { name: 'lead' as const, midi: m.lead },
      { name: 'tenor' as const, midi: m.tenor },
    ] as { name: keyof VoicingPitches; midi: number }[]
  ).sort((a, b) => a.midi - b.midi)
}

/** Score one TTBB stack for series-like spacing. */
export function scoreHarmonicSeriesSpacing(midi: VoicingPitches): SpacingReport {
  const sorted = parts(midi)
  const low = sorted[0]!
  const midLow = sorted[1]!
  const high = sorted[3]!

  const bassToNext = midLow.midi - low.midi
  const upperSpan = high.midi - midLow.midi
  const tenorLeadGap = Math.abs(midi.tenor - midi.lead)

  const issues: SpacingIssue[] = []
  let score = 1

  // Prefer ≥ P5 (~7) between lowest and next
  if (bassToNext < 5) {
    score -= 0.35
    issues.push({
      id: 'spacing-narrow-bass',
      severity: 'warn',
      message: 'Bass is close to the next part — low thirds often sound muddy.',
      teachingId: 'harmonic_series_spacing',
    })
  } else if (bassToNext >= 7) {
    score += 0.05
  }

  // Upper three should be relatively compact
  if (upperSpan > 16) {
    score -= 0.25
    issues.push({
      id: 'spacing-wide-upper',
      severity: 'info',
      message: 'Upper voices span a wide range — tighter spacing usually locks better.',
      teachingId: 'harmonic_series_spacing',
    })
  }

  // Hole between tenor and lead
  if (tenorLeadGap > 12) {
    score -= 0.3
    issues.push({
      id: 'spacing-tenor-lead-hole',
      severity: 'warn',
      message: 'Tenor and lead are more than an octave apart — a hole in the chord.',
      teachingId: 'harmonic_series_spacing',
    })
  }

  // Low chordal third mud: if bari or tenor is the lowest-but-one and sits a M3/m3 above bass in mud zone
  const aboveBass = midLow.midi - low.midi
  if (aboveBass <= 4 && low.name === 'bass') {
    score -= 0.2
    issues.push({
      id: 'spacing-low-third',
      severity: 'info',
      message: 'A close interval just above the bass can muddy the stack.',
      teachingId: 'harmonic_series_spacing',
    })
  }

  // Reward classic closed upper with divorced-ish bass
  if (bassToNext >= 7 && upperSpan <= 12 && tenorLeadGap <= 9) {
    score += 0.1
  }

  const clamped = Math.max(0, Math.min(1, score))
  return {
    score: clamped,
    bassToNext,
    upperSpan,
    tenorLeadGap,
    issues: issues.map((i) => ({ ...i })),
  }
}

export function checkStackSpacing(stack: ChordStack): SpacingIssue[] {
  if (!stack.midi) return []
  return scoreHarmonicSeriesSpacing(stack.midi).issues.map((i) => ({
    ...i,
    id: `${i.id}-${stack.id}`,
    stackId: stack.id,
  }))
}

export function analyzeSpacing(stacks: readonly ChordStack[]): SpacingIssue[] {
  return stacks.flatMap(checkStackSpacing)
}
