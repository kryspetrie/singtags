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

function markerLabel(
  m: Omit<CoachLaneMarker, 'label'>,
  lintMsg?: string,
): string {
  if (lintMsg) return lintMsg
  if (m.severity === 'empty') return 'Needs chord'
  if (m.severity === 'error') return 'Chord issue'
  if (m.severity === 'warn') return 'Check this chord'
  if (m.heldLead) return 'Post (held lead)'
  if (m.voiceLead != null && m.voiceLead < 0.35) return 'Voice-leading jump'
  if (m.harmonicity != null && m.harmonicity >= 0.65) return 'Strong ring'
  if (m.harmonicity != null) return 'OK ring'
  return 'Harmonized'
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
      for (const l of related) severity = worstSeverity(severity === 'empty' ? null : severity, l.severity)
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
      harmonicity = harm.normalize(raw)
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
    return { ...base, label: markerLabel(base, lintMessage) }
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
  if (lens === 'overview') return [...markers]
  if (lens === 'gaps') return markers.filter((m) => m.severity === 'empty')
  if (lens === 'issues') return markers.filter((m) => m.lintCount > 0 || m.severity === 'error' || m.severity === 'warn')
  if (lens === 'ring') return markers.filter((m) => m.harmonicity != null)
  return markers.filter((m) => m.voiceLead != null)
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
