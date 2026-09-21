import {
  applyEmbellishmentSeed,
  findEmbellishmentSeeds,
  type EmbellishmentSeed,
} from '../../domain/arranging/embellishments'
import { assessFinalReadiness, type FinalChecklistResult } from '../../domain/arranging/finalChecklist'
import { polishVoicings } from '../../domain/arranging/polishVoicing'
import type { ArrangementProject } from '../../domain/arranging/types'
import type { FixContext, FixRegistry } from '../../domain/arranging/qa'
import {
  copySelection,
  cutSelection,
  pasteClipboard,
  type ClipboardPayload,
} from '../../domain/arranging/clipboard'
import { assessBarbershopness, type BarbershopnessReport } from '../../domain/arranging/barbershopness'
import {
  applyCounterpartToStack,
  suggestCounterpart,
  type CounterpartSuggestion,
} from '../../domain/arranging/counterpart'
import { listSubstitutionBranches, type SubstitutionBranch } from '../../domain/arranging/substitutions'
import { romanForChord } from '../../domain/arranging/secondaryDominant'
import { pillarAtTick } from '../../domain/arranging/pillars'
import type { ArrangementSelection } from '../../domain/arranging/selection'
import type { ChordStack, MelodyEvent } from '../../domain/arranging/types'
import type { IdGenerator } from '../../ports/IdGenerator'

export function suggestEmbellishments(project: ArrangementProject): EmbellishmentSeed[] {
  return findEmbellishmentSeeds(project)
}

export function applyEmbellishment(
  project: ArrangementProject,
  seed: EmbellishmentSeed,
): ArrangementProject {
  return applyEmbellishmentSeed(project, seed)
}

export function polishArrangementVoicing(
  project: ArrangementProject,
  opts?: { registry?: FixRegistry; ctx?: FixContext },
): { project: ArrangementProject; applied: string[] } {
  return polishVoicings(project, opts)
}

export function assessFinal(project: ArrangementProject): FinalChecklistResult {
  return assessFinalReadiness(project)
}

export function assessHowBarbershop(project: ArrangementProject): BarbershopnessReport {
  return assessBarbershopness(project)
}

export function listSubstitutionsForNote(
  project: ArrangementProject,
  note: MelodyEvent,
): SubstitutionBranch[] {
  const pillar = pillarAtTick(project.pillars, note.startTick)
  if (!pillar) return []
  const nextPillar = project.pillars.find((p) => p.startTick >= pillar.endTick)
  return listSubstitutionBranches({
    leadMidi: note.midi,
    pillarRoot: pillar.rootPc,
    tonality: project.tonality,
    mode: project.tonalityMode ?? 'major',
    nextPillarRoot: nextPillar?.rootPc ?? null,
  })
}

export function suggestCounterpartForStack(
  project: ArrangementProject,
  stackId: string,
): CounterpartSuggestion | null {
  const stack = project.stacks.find((s) => s.id === stackId)
  if (!stack?.midi) return null
  const note =
    project.melody.find((n) => n.startTick === stack.startTick) ??
    ({
      id: 'tmp',
      midi: stack.midi.lead,
      startTick: stack.startTick,
      durationTicks: stack.durationTicks,
      role: 'unknown' as const,
    } satisfies MelodyEvent)
  const originalRoot =
    (stack.pillarId
      ? project.pillars.find((p) => p.id === stack.pillarId)?.rootPc
      : undefined) ?? stack.rootPc
  return suggestCounterpart({
    note,
    originalRoot,
    natureId: stack.natureId === 'ninth' ? 'ninth' : 'seventh',
  })
}

export function applyCounterpart(
  project: ArrangementProject,
  stackId: string,
): ArrangementProject | null {
  const stack = project.stacks.find((s) => s.id === stackId)
  if (!stack) return null
  const suggestion = suggestCounterpartForStack(project, stackId)
  if (!suggestion) return null
  const next: ChordStack = applyCounterpartToStack(stack, suggestion)
  return {
    ...project,
    stacks: project.stacks.map((s) => (s.id === stackId ? next : s)),
  }
}

export function romanLabelForStack(
  project: ArrangementProject,
  stackId: string,
): string | null {
  const stack = project.stacks.find((s) => s.id === stackId)
  if (!stack) return null
  const nextPillar = project.pillars
    .filter((p) => p.startTick > stack.startTick)
    .sort((a, b) => a.startTick - b.startTick)[0]
  return romanForChord({
    rootPc: stack.rootPc,
    natureId: stack.natureId,
    tonality: project.tonality,
    mode: project.tonalityMode ?? 'major',
    resolvesToRoot: nextPillar?.rootPc ?? null,
  })
}

export function copyArrangementSelection(
  project: ArrangementProject,
  selection: ArrangementSelection,
): ClipboardPayload | null {
  return copySelection(project, selection)
}

export function cutArrangementSelection(
  project: ArrangementProject,
  selection: ArrangementSelection,
): { project: ArrangementProject; clipboard: ClipboardPayload } | null {
  return cutSelection(project, selection)
}

export function pasteArrangementClipboard(
  project: ArrangementProject,
  clipboard: ClipboardPayload,
  atTick: number,
  idGen?: IdGenerator,
): ArrangementProject {
  return pasteClipboard(project, clipboard, atTick, idGen ? { next: (p) => idGen.next(p) } : undefined)
}
