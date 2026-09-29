/**
 * Per-moment metrics + pillar bands for the arranging coach analysis lane.
 */
import { createHarmonicityScorer } from '../../domain/arranging/harmonicity/harmonicityScore'
import {
  buildHarmonicMoments,
  momentsFromMelodyAlone,
  type HarmonicMoment,
} from '../../domain/arranging/harmonicMoments'
import { voiceLeadScore } from '../../domain/arranging/theoryScores'
import type { ArrangementLint } from '../../domain/arranging/qa/types'
import type { ArrangementProject, Pillar } from '../../domain/arranging/types'
import type { CoachLaneLens } from './coachHighlight'

export type CoachLaneMarker = {
  melodyId: string
  startTick: number
  durationTicks: number
  heldLead?: boolean
  voiceLead: number | null
  harmonicity: number | null
  severity: ArrangementLint['severity'] | 'empty' | null
  lintCount: number
  label: string
  lintMessage?: string
}

export type CoachLanePillarBand = {
  pillarId: string
  startTick: number
  endTick: number
  rootPc: number
  confirmed: boolean
  reason?: string
}

const harm = createHarmonicityScorer()

function worstSeverity(
  a: ArrangementLint['severity'] | null,
  b: ArrangementLint['severity'],
): ArrangementLint['severity'] {
  const rank = { error: 3, warn: 2, info: 1 }
  if (!a) return b
  return rank[b] > rank[a] ? b : a
}

/** Short lane hover — never the lint message body (that lives under Potential issues). */
function markerLabel(m: Omit<CoachLaneMarker, 'label'>): string {
  if (m.severity === 'empty') return 'Needs chord'
  if (m.lintCount > 0) {
    if (m.severity === 'error') return 'Issue'
    if (m.severity === 'warn') return 'Check'
    return 'Note'
  }
  if (m.heldLead) return 'Post (held lead)'
  if (m.harmonicity != null) return `Ring ${Math.round(m.harmonicity * 100)}`
  return 'Has chord'
}

/** Prefer harmonic moments when provided; else melody onsets (legacy). */
export function buildCoachLaneMarkers(
  project: ArrangementProject,
  lints: readonly ArrangementLint[],
  moments?: readonly HarmonicMoment[],
): CoachLaneMarker[] {
  const stacks = [...project.stacks].sort((a, b) => a.startTick - b.startTick)
  const stackByTick = new Map(stacks.map((s) => [s.startTick, s]))
  const steps =
    moments && moments.length
      ? moments
      : momentsFromMelodyAlone(project.melody)

  return steps.map((mom, i) => {
    const stack = stackByTick.get(mom.startTick) ?? null
    const related = lints.filter(
      (l) =>
        l.noteId === mom.leadNoteId ||
        (stack != null && l.stackId === stack.id) ||
        (l.noteId &&
          project.melody.some(
            (m) =>
              m.id === l.noteId &&
              m.startTick <= mom.startTick &&
              mom.startTick < m.startTick + m.durationTicks,
          )),
    )
    let severity: CoachLaneMarker['severity'] = null
    if (!stack) severity = 'empty'
    else {
      let lintSev: ArrangementLint['severity'] | null = null
      for (const l of related) lintSev = worstSeverity(lintSev, l.severity)
      severity = lintSev
    }

    let harmonicity: number | null = null
    let voiceLead: number | null = null
    if (stack?.midi) {
      const raw = harm.score({
        midi: stack.midi,
        rootPc: stack.rootPc,
        natureId: stack.natureId,
        voicing: stack.voicing,
      })
      // Display scale: strong 4-part lock ≈ 100% (ranking keeps absolute normalize).
      harmonicity = harm.normalizeForDisplay(raw, { partCount: 4 })
      const prev = stacks.filter((s) => s.startTick < stack.startTick).at(-1)
      if (prev?.midi) {
        voiceLead = voiceLeadScore(prev.midi, stack.midi, { melodyVoice: 'lead' })
      } else if (i === 0) {
        voiceLead = 1
      }
    }

    const lintMessage = related[0]?.message
    const base = {
      melodyId: mom.leadNoteId ?? mom.id,
      startTick: mom.startTick,
      durationTicks: mom.durationTicks,
      heldLead: mom.heldLead,
      voiceLead,
      harmonicity,
      severity,
      lintCount: related.length,
      lintMessage,
    }
    return { ...base, label: markerLabel(base) }
  })
}

/** Build moments from arrangement melody alone (tests / no tag roll). */
export function momentsForLane(project: ArrangementProject): HarmonicMoment[] {
  return buildHarmonicMoments(
    project.melody,
    project.melody.map((m) => ({
      startTick: m.startTick,
      durationTicks: m.durationTicks,
      midi: m.midi,
      isLead: true,
    })),
  )
}

export function filterMarkersForLens(
  markers: readonly CoachLaneMarker[],
  lens: CoachLaneLens,
): CoachLaneMarker[] {
  if (lens === 'issues') {
    return markers.filter(
      (m) => m.lintCount > 0 || m.severity === 'error' || m.severity === 'warn',
    )
  }
  // Ring / voice-leading keep empties visible as dashed boxes.
  return [...markers]
}

export function buildCoachLanePillarBands(
  pillars: readonly Pillar[],
): CoachLanePillarBand[] {
  return [...pillars]
    .sort((a, b) => a.startTick - b.startTick)
    .map((p) => ({
      pillarId: p.id,
      startTick: p.startTick,
      endTick: p.endTick,
      rootPc: p.rootPc,
      confirmed: p.confirmed,
      reason: p.reason,
    }))
}
