import type { ArrangementProject } from '../../types'
import type { ArrangementLint } from '../types'
import type { FixContext, FixStrategy, ProjectPatch } from './illegalChordFix'
import { candidatesForMelodyNote, candidateToStack } from '../../harmonize'

/** Re-pick a fuller triad voicing. */
export const incompleteTriadFix: FixStrategy = {
  ruleId: 'incomplete-triad',
  canFix(lint, project) {
    if (lint.ruleId !== 'incomplete-triad' || !lint.stackId) return false
    return revoiceStack(lint, project, undefined, 3) != null
  },
  apply(lint, project, ctx) {
    return revoiceStack(lint, project, ctx, 3)
  },
}

function revoiceStack(
  lint: ArrangementLint,
  project: ArrangementProject,
  ctx: FixContext | undefined,
  minTones: number,
): ProjectPatch | null {
  const stack = project.stacks.find((s) => s.id === lint.stackId)
  if (!stack) return null
  const note =
    project.melody.find((n) => n.startTick === stack.startTick && n.midi === stack.midi?.lead) ??
    project.melody.find((n) => n.startTick === stack.startTick)
  if (!note) return null
  const pillar =
    project.pillars.find((p) => p.startTick <= note.startTick && note.startTick < p.endTick) ?? null
  if (!pillar) return null
  const prev = [...project.stacks]
    .filter((s) => s.startTick < note.startTick)
    .sort((a, b) => b.startTick - a.startTick)[0]
  const nextPillar = project.pillars.find((x) => x.startTick >= pillar.endTick)
  const cands = candidatesForMelodyNote({
    note,
    pillar,
    tonality: project.tonality,
    prevRootPc: prev?.rootPc ?? null,
    prevNatureId: prev?.natureId ?? null,
    preferScf: note.role === 'smn',
    limit: 24,
    profile: project.contestProfile,
    nextPillarRoot: nextPillar?.rootPc ?? null,
    prevMidi: prev?.midi ?? null,
    rankerDeps: ctx?.rankerDeps,
  }).filter((c) => c.natureId === stack.natureId || c.layer === 'primary')

  const better =
    cands.find((c) => {
      const tones = new Set(
        [c.midi.bass, c.midi.bari, c.midi.lead, c.midi.tenor].map((m) => ((m % 12) + 12) % 12),
      )
      return tones.size >= minTones
    }) ?? cands[0]
  if (!better) return null
  const replacement = candidateToStack(note, better, pillar.id, ctx?.idGen)
  replacement.id = stack.id
  return {
    stacks: project.stacks.map((s) => (s.id === stack.id ? replacement : s)),
  }
}
