/**
 * Document snapshots for arranging undo/redo (mirrors SingTags tagRoll/history.ts).
 */
import type {
  ArrangementProject,
  ChordStack,
  MelodyEvent,
  Pillar,
  ContestProfile,
  TuningMode,
  WizardStep,
} from './types'
import type { ArrangementQaConfig } from './coachConfig'
import { normalizeQaConfig } from './coachConfig'

export const ARRANGING_HISTORY_LIMIT = 80

export type ArrangementDocumentSnapshot = {
  title: string
  tonality: number
  preferFlats: boolean
  bpm: number
  wizardStep: WizardStep
  tuningMode: TuningMode
  contestProfile: ContestProfile
  qaConfig: ArrangementQaConfig
  melody: MelodyEvent[]
  pillars: Pillar[]
  stacks: ChordStack[]
}

export function captureDocumentSnapshot(p: ArrangementProject): ArrangementDocumentSnapshot {
  return {
    title: p.title,
    tonality: p.tonality,
    preferFlats: p.preferFlats,
    bpm: p.bpm,
    wizardStep: p.wizardStep,
    tuningMode: p.tuningMode,
    contestProfile: p.contestProfile,
    qaConfig: normalizeQaConfig(p.qaConfig),
    melody: p.melody.map((n) => ({ ...n })),
    pillars: p.pillars.map((x) => ({ ...x })),
    stacks: p.stacks.map((s) => ({
      ...s,
      midi: s.midi ? { ...s.midi } : null,
      ruleTags: [...s.ruleTags],
    })),
  }
}

export function applyDocumentSnapshot(
  p: ArrangementProject,
  snap: ArrangementDocumentSnapshot,
): ArrangementProject {
  return {
    ...p,
    title: snap.title,
    tonality: snap.tonality,
    preferFlats: snap.preferFlats,
    bpm: snap.bpm,
    wizardStep: snap.wizardStep,
    tuningMode: snap.tuningMode,
    contestProfile: snap.contestProfile,
    qaConfig: normalizeQaConfig(snap.qaConfig),
    melody: snap.melody.map((n) => ({ ...n })),
    pillars: snap.pillars.map((x) => ({ ...x })),
    stacks: snap.stacks.map((s) => ({
      ...s,
      midi: s.midi ? { ...s.midi } : null,
      ruleTags: [...s.ruleTags],
    })),
  }
}

export type HistoryStacks = {
  undo: ArrangementDocumentSnapshot[]
  redo: ArrangementDocumentSnapshot[]
}

export function pushUndo(
  stacks: HistoryStacks,
  current: ArrangementProject,
  limit = ARRANGING_HISTORY_LIMIT,
): HistoryStacks {
  const snap = captureDocumentSnapshot(current)
  const undo = [...stacks.undo, snap]
  while (undo.length > limit) undo.shift()
  return { undo, redo: [] }
}

export function undoOnce(
  project: ArrangementProject,
  stacks: HistoryStacks,
): { project: ArrangementProject; stacks: HistoryStacks } | null {
  if (!stacks.undo.length) return null
  const prev = stacks.undo[stacks.undo.length - 1]!
  const undo = stacks.undo.slice(0, -1)
  const redo = [...stacks.redo, captureDocumentSnapshot(project)]
  return {
    project: applyDocumentSnapshot(project, prev),
    stacks: { undo, redo },
  }
}

export function redoOnce(
  project: ArrangementProject,
  stacks: HistoryStacks,
): { project: ArrangementProject; stacks: HistoryStacks } | null {
  if (!stacks.redo.length) return null
  const next = stacks.redo[stacks.redo.length - 1]!
  const redo = stacks.redo.slice(0, -1)
  const undo = [...stacks.undo, captureDocumentSnapshot(project)]
  return {
    project: applyDocumentSnapshot(project, next),
    stacks: { undo, redo },
  }
}
