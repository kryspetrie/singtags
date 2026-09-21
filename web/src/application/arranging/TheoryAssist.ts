/**
 * Headless theory assistants: autocomplete, completion, harmony analysis.
 */
import {
  analyzeHarmonyTheory,
  explainStackTheory,
} from '../../domain/arranging/analyzeHarmonyTheory'
import {
  autocompleteNextChord,
  autocompleteSubstitutionChips,
} from '../../domain/arranging/harmonize/chordAutocomplete'
import {
  completePartialChord,
  repairStackAfterRemovingParts,
  type CompletionRequest,
  type CompletionResult,
} from '../../domain/arranging/chordCompletion'
import { isDominantNature } from '../../domain/arranging/tensionRelease'
import { analyzeArrangementHarmony } from '../../domain/arranging/progressionAnalyze'
import {
  narrateArrangementAnalysis,
  narrateStackInContext,
} from '../../domain/arranging/education/analysisNarrative'
import { pillarAtTick } from '../../domain/arranging/pillars'
import type { ArrangementProject, MelodyEvent } from '../../domain/arranging/types'
import type { ChordSuggestion } from '../../domain/arranging/chordSuggestion'
import type { RankerDeps } from '../../domain/arranging/harmonize'

function bs7Share(project: ArrangementProject): number {
  if (!project.stacks.length) return 0
  const n = project.stacks.filter(
    (s) => s.natureId === 'seventh' || s.natureId === 'ninth',
  ).length
  return n / project.stacks.length
}

function prevDominantOf(project: ArrangementProject, beforeTick: number) {
  const prev = [...project.stacks]
    .filter((s) => s.startTick < beforeTick && s.midi)
    .sort((a, b) => b.startTick - a.startTick)[0]
  if (!prev?.midi || !isDominantNature(prev.natureId)) return null
  return { rootPc: prev.rootPc, natureId: prev.natureId, midi: prev.midi }
}

export function autocompleteChordAtNote(
  project: ArrangementProject,
  note: MelodyEvent,
  opts: { preferScf?: boolean; limit?: number; rankerDeps?: RankerDeps } = {},
): ChordSuggestion[] {
  const pillar = pillarAtTick(project.pillars, note.startTick)
  if (!pillar) return []
  const prev = [...project.stacks]
    .filter((s) => s.startTick < note.startTick)
    .sort((a, b) => b.startTick - a.startTick)[0]
  const nextPillar = project.pillars.find((p) => p.startTick >= pillar.endTick)
  return autocompleteNextChord({
    note,
    pillar,
    tonality: project.tonality,
    mode: project.tonalityMode ?? 'major',
    profile: project.contestProfile,
    prevRootPc: prev?.rootPc ?? null,
    prevMidi: prev?.midi ?? null,
    prevDominant: prevDominantOf(project, note.startTick),
    nextPillarRoot: nextPillar?.rootPc ?? null,
    preferScf: opts.preferScf ?? note.role === 'smn',
    limit: opts.limit ?? 12,
    rankerDeps: opts.rankerDeps,
    preferSevenths: bs7Share(project) < 0.3,
  })
}

export function listTheorySubstitutionChips(project: ArrangementProject, note: MelodyEvent) {
  const pillar = pillarAtTick(project.pillars, note.startTick)
  if (!pillar) return []
  const nextPillar = project.pillars.find((p) => p.startTick >= pillar.endTick)
  return autocompleteSubstitutionChips({
    leadMidi: note.midi,
    pillarRoot: pillar.rootPc,
    tonality: project.tonality,
    mode: project.tonalityMode ?? 'major',
    nextPillarRoot: nextPillar?.rootPc ?? null,
  })
}

export function completeChordFromPitches(
  project: ArrangementProject,
  request: Omit<CompletionRequest, 'tonality' | 'mode' | 'profile'> & {
    tick?: number
  },
): CompletionResult {
  const tick = request.tick ?? 0
  const pillar = pillarAtTick(project.pillars, tick)
  const nextPillar = pillar
    ? project.pillars.find((p) => p.startTick >= pillar.endTick)
    : undefined
  return completePartialChord({
    ...request,
    tonality: project.tonality,
    mode: project.tonalityMode ?? 'major',
    profile: project.contestProfile,
    pillarRoot: request.pillarRoot ?? pillar?.rootPc,
    nextPillarRoot: request.nextPillarRoot ?? nextPillar?.rootPc ?? null,
    prevDominant: request.prevDominant ?? prevDominantOf(project, tick),
  })
}

export function repairProjectStack(
  project: ArrangementProject,
  stackId: string,
  remove: ('tenor' | 'lead' | 'bari' | 'bass')[],
): CompletionResult {
  const stack = project.stacks.find((s) => s.id === stackId)
  if (!stack?.midi) return { inferredNatures: [], suggestions: [] }
  const pillar = stack.pillarId
    ? project.pillars.find((p) => p.id === stack.pillarId)
    : pillarAtTick(project.pillars, stack.startTick)
  const nextPillar = project.pillars
    .filter((p) => p.startTick > stack.startTick)
    .sort((a, b) => a.startTick - b.startTick)[0]
  const prev = [...project.stacks]
    .filter((s) => s.startTick < stack.startTick)
    .sort((a, b) => b.startTick - a.startTick)[0]
  return repairStackAfterRemovingParts({
    midi: stack.midi,
    natureId: stack.natureId,
    rootPc: stack.rootPc,
    remove,
    profile: project.contestProfile,
    tonality: project.tonality,
    mode: project.tonalityMode ?? 'major',
    pillarRoot: pillar?.rootPc,
    nextPillarRoot: nextPillar?.rootPc ?? null,
    prevMidi: prev?.midi ?? null,
  })
}

export function runHarmonyTheoryAnalysis(project: ArrangementProject) {
  return analyzeHarmonyTheory(project)
}

export function explainProjectStackTheory(project: ArrangementProject, stackId: string) {
  return explainStackTheory(project, stackId)
}

export function analyzeProjectProgression(project: ArrangementProject) {
  return analyzeArrangementHarmony(project)
}

/** Full teaching narrative: chords in context, cadences, style, next steps. */
export function teachArrangementAnalysis(project: ArrangementProject) {
  return narrateArrangementAnalysis(project)
}

export function teachStackAnalysis(project: ArrangementProject, stackId: string) {
  return narrateStackInContext(project, stackId)
}
