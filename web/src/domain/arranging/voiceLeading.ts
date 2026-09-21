/**
 * Basic TTBB voice-leading checks (Prietto / manual / chorale heuristics).
 */
import type { ChordStack } from './types'
import type { VoicingPitches } from './chords'
import {
  commonToneScore,
  contraryMotionScore,
  parallelPerfectPenalty,
} from './theoryScores'

export type VoiceLeadingIssue = {
  id: string
  severity: 'error' | 'warn' | 'info'
  message: string
  stackId?: string
  prevStackId?: string
  teachingId?: string
  data?: Record<string, unknown>
}

function midiOf(s: ChordStack): NonNullable<ChordStack['midi']> | null {
  return s.midi
}

export function checkStackInternal(stack: ChordStack): VoiceLeadingIssue[] {
  const m = midiOf(stack)
  if (!m) return []
  const out: VoiceLeadingIssue[] = []
  if (!(m.tenor > m.lead)) {
    out.push({
      id: `tenor-below-lead-${stack.id}`,
      severity: 'error',
      message: 'Tenor should be above lead in TTBB closed/spread stack.',
      stackId: stack.id,
      teachingId: 'ttbb',
    })
  }
  if (!(m.bass <= Math.min(m.bari, m.lead))) {
    out.push({
      id: `bass-high-${stack.id}`,
      severity: 'warn',
      message: 'Bass is above bari or lead — check voicing.',
      stackId: stack.id,
      teachingId: 'ttbb',
    })
  }
  const pcs = [m.bass, m.bari, m.lead, m.tenor]
  for (let i = 0; i < pcs.length; i++) {
    for (let j = i + 1; j < pcs.length; j++) {
      if (Math.abs(pcs[i]! - pcs[j]!) === 1) {
        // S13: sounding m2 banned except maj7 chord-tone pair (root ↔ M7)
        if (stack.natureId === 'maj7') continue
        out.push({
          id: `m2-${stack.id}-${i}-${j}`,
          severity: 'warn',
          message: 'Minor second between parts — often muddy in contest charts.',
          stackId: stack.id,
        })
      }
    }
  }
  return out
}

export function checkParallelFifths(
  prev: ChordStack,
  next: ChordStack,
): VoiceLeadingIssue[] {
  const a = midiOf(prev)
  const b = midiOf(next)
  if (!a || !b) return []
  const pairs: [keyof VoicingPitches, keyof VoicingPitches][] = [
    ['bass', 'tenor'],
    ['bass', 'lead'],
    ['bass', 'bari'],
    ['bari', 'tenor'],
    ['lead', 'tenor'],
    ['bari', 'lead'],
  ]
  const out: VoiceLeadingIssue[] = []
  for (const [lo, hi] of pairs) {
    const d0 = a[hi] - a[lo]
    const d1 = b[hi] - b[lo]
    const moved = a[lo] !== b[lo] || a[hi] !== b[hi]
    if (!moved) continue
    if (d0 === 7 && d1 === 7) {
      const outer = lo === 'bass' && hi === 'tenor'
      out.push({
        id: `p5-${prev.id}-${next.id}-${lo}-${hi}`,
        severity: 'info',
        message: outer
          ? `Parallel perfect fifth on outer voices (tenor–bass) — softest place to revoice if easy.`
          : `Parallel perfect fifth ${lo}→${hi} across stacks.`,
        stackId: next.id,
        prevStackId: prev.id,
        teachingId: 'parallel_5_8',
        ...(outer ? { data: { outer: true, weight: 1.5 } } : {}),
      })
    }
    if (d0 === 12 && d1 === 12) {
      out.push({
        id: `p8-${prev.id}-${next.id}-${lo}-${hi}`,
        severity: 'info',
        message: `Parallel octave ${lo}→${hi} across stacks.`,
        stackId: next.id,
        prevStackId: prev.id,
        teachingId: 'parallel_5_8',
      })
    }
  }
  return out
}

export function checkContraryAndCommonTone(
  prev: ChordStack,
  next: ChordStack,
): VoiceLeadingIssue[] {
  const a = midiOf(prev)
  const b = midiOf(next)
  if (!a || !b) return []
  const out: VoiceLeadingIssue[] = []
  const contrary = contraryMotionScore(a, b)
  const bassMoved = a.bass !== b.bass
  if (bassMoved && contrary < 0.34) {
    out.push({
      id: `contrary-${prev.id}-${next.id}`,
      severity: 'info',
      message: 'Outer voices move mostly in the same direction — try contrary motion for a fuller succession.',
      stackId: next.id,
      prevStackId: prev.id,
      teachingId: 'contrary_motion',
    })
  }
  const common = commonToneScore(a, b)
  if (common < 0.4 && parallelPerfectPenalty(a, b) > 0.3) {
    out.push({
      id: `common-tone-${prev.id}-${next.id}`,
      severity: 'info',
      message: 'Shared chord tones may be jumping voices — consider holding common tones.',
      stackId: next.id,
      prevStackId: prev.id,
      teachingId: 'common_tone',
    })
  }
  // Large leaps
  for (const v of ['bass', 'bari', 'tenor'] as const) {
    const leap = Math.abs(b[v] - a[v])
    if (leap > 7) {
      out.push({
        id: `leap-${v}-${prev.id}-${next.id}`,
        severity: leap > 12 ? 'warn' : 'info',
        message: `${v} leaps ${leap} semitones — large leaps are harder to tune.`,
        stackId: next.id,
        prevStackId: prev.id,
        teachingId: 'common_tone',
      })
    }
  }
  return out
}

export function analyzeVoiceLeading(stacks: readonly ChordStack[]): VoiceLeadingIssue[] {
  const sorted = [...stacks].sort((x, y) => x.startTick - y.startTick)
  const out: VoiceLeadingIssue[] = []
  for (const s of sorted) out.push(...checkStackInternal(s))
  for (let i = 1; i < sorted.length; i++) {
    out.push(...checkParallelFifths(sorted[i - 1]!, sorted[i]!))
    out.push(...checkContraryAndCommonTone(sorted[i - 1]!, sorted[i]!))
  }
  return out
}
