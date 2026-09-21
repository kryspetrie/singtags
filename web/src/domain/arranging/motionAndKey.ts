/**
 * Approach Three motion lint across consecutive stacks + key suggestion from range.
 */
import { classifyRootMotion, isBs7Nature } from './approachThree'
import type { ArrangementProject, ChordStack } from './types'
import type { ArrangementLint } from './qa/types'
import { RANGE_PRESETS } from './songEligibility'

export function motionLints(
  project: ArrangementProject,
): ArrangementLint[] {
  const sorted = [...project.stacks].sort((a, b) => a.startTick - b.startTick)
  const out: ArrangementLint[] = []
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1]!
    const cur = sorted[i]!
    if (prev.rootPc === cur.rootPc) continue
    const kind = classifyRootMotion({
      fromRoot: prev.rootPc,
      toRoot: cur.rootPc,
      tonality: project.tonality,
      fromIsSeventh: isBs7Nature(prev.natureId),
    })
    if (kind === 'other') {
      out.push({
        id: `motion-${prev.id}-${cur.id}`,
        ruleId: 'harmonic-motion',
        severity: 'info',
        message:
          'Root motion is outside Approach Three’s preferred set — check for a stronger secondary-dominant or chromatic approach.',
        stackId: cur.id,
        data: { from: prev.rootPc, to: cur.rootPc, kind },
      })
    } else if (kind === 'p5_up_retro') {
      out.push({
        id: `retro-${prev.id}-${cur.id}`,
        ruleId: 'harmonic-motion',
        severity: 'info',
        message: 'Retrogression (up a P5) — legal but weaker than down-a-fifth motion.',
        stackId: cur.id,
      })
    }
  }
  return out
}

export function keySuggestionLints(project: ArrangementProject): ArrangementLint[] {
  const preset = RANGE_PRESETS.find((p) => p.id === 'ttbb_lead') ?? RANGE_PRESETS[0]!
  if (!project.melody.length) return []
  const lows = project.melody.filter((n) => n.midi < preset.leadMin)
  const highs = project.melody.filter((n) => n.midi > preset.leadMax)
  if (!lows.length && !highs.length) return []

  let semitones = 0
  if (lows.length && !highs.length) {
    const deficit = Math.max(...lows.map((n) => preset.leadMin - n.midi))
    semitones = Math.ceil(deficit)
  } else if (highs.length && !lows.length) {
    const excess = Math.max(...highs.map((n) => n.midi - preset.leadMax))
    semitones = -Math.ceil(excess)
  } else {
    return [
      {
        id: 'key-both-ends',
        ruleId: 'key-suggestion',
        severity: 'warn',
        message:
          'Lead spans both below and above the TTBB comfort range — consider rewriting extremes rather than a simple transpose.',
      },
    ]
  }

  const dir = semitones > 0 ? 'up' : 'down'
  return [
    {
      id: 'key-suggest',
      ruleId: 'key-suggestion',
      severity: 'warn',
      message: `Lead range suggests transposing the chart ${dir} ~${Math.abs(semitones)} semitone(s) (confirm before applying).`,
      data: { semitones },
    },
  ]
}

export function orphanStackLints(project: ArrangementProject): ArrangementLint[] {
  const out: ArrangementLint[] = []
  for (const s of project.stacks) {
    const hasMelody = project.melody.some(
      (n) => n.startTick === s.startTick || (n.startTick <= s.startTick && s.startTick < n.startTick + n.durationTicks),
    )
    if (!hasMelody) {
      out.push({
        id: `orphan-${s.id}`,
        ruleId: 'orphan-stack',
        severity: 'error',
        message: 'Harmony stack has no matching melody onset — remove or snap to a note.',
        stackId: s.id,
      })
    }
  }
  return out
}

export function missingPillarCoverageLints(project: ArrangementProject): ArrangementLint[] {
  if (!project.pillars.length) return []
  const out: ArrangementLint[] = []
  for (const n of project.melody) {
    const covered = project.pillars.some(
      (p) => p.startTick <= n.startTick && n.startTick < p.endTick,
    )
    if (!covered) {
      out.push({
        id: `no-pillar-${n.id}`,
        ruleId: 'missing-pillar',
        severity: 'warn',
        message: 'Melody note sits outside any pillar span.',
        noteId: n.id,
      })
    }
  }
  return out
}

/** Soft swipe opportunity: long phrase-end holds. */
export function swipeOpportunityLints(project: ArrangementProject): ArrangementLint[] {
  const out: ArrangementLint[] = []
  const sorted = [...project.melody].sort((a, b) => a.startTick - b.startTick)
  for (let i = 0; i < sorted.length; i++) {
    const n = sorted[i]!
    const next = sorted[i + 1]
    const gap = next ? next.startTick - (n.startTick + n.durationTicks) : 9999
    if (n.durationTicks >= 960 && gap >= 240) {
      out.push({
        id: `swipe-${n.id}`,
        ruleId: 'swipe-opportunity',
        severity: 'info',
        message: 'Long hold near a gap — optional swipe/embellishment candidate (manual).',
        noteId: n.id,
      })
    }
  }
  return out
}

export function countSeventhDensity(stacks: readonly ChordStack[]): number {
  if (!stacks.length) return 0
  return (
    stacks.filter((s) => s.natureId === 'seventh' || s.natureId === 'ninth').length /
    stacks.length
  )
}
