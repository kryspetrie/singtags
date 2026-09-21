/**
 * Clipboard ops for melody + stacks (tick-rebase on paste).
 */
import type { ArrangementProject, ChordStack, MelodyEvent } from './types'
import type { ArrangementSelection } from './selection'
import { selectionIsEmpty } from './selection'

export type ClipboardPayload = {
  melody: MelodyEvent[]
  stacks: ChordStack[]
  /** Tick origin of the cut/copy selection (min startTick). */
  originTick: number
}

export type IdGen = { next(prefix: string): string }

function fallbackId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`
}

export function copySelection(
  project: ArrangementProject,
  selection: ArrangementSelection,
): ClipboardPayload | null {
  if (selectionIsEmpty(selection)) return null
  const melody = project.melody.filter((m) => selection.melodyIds.includes(m.id))
  const stacks = project.stacks.filter((s) => selection.stackIds.includes(s.id))
  if (!melody.length && !stacks.length) return null
  const originTick = Math.min(
    ...[...melody.map((m) => m.startTick), ...stacks.map((s) => s.startTick)],
  )
  return {
    melody: melody.map((m) => ({ ...m })),
    stacks: stacks.map((s) => ({
      ...s,
      midi: s.midi ? { ...s.midi } : null,
      ruleTags: [...s.ruleTags],
    })),
    originTick,
  }
}

export function cutSelection(
  project: ArrangementProject,
  selection: ArrangementSelection,
): { project: ArrangementProject; clipboard: ClipboardPayload } | null {
  const clipboard = copySelection(project, selection)
  if (!clipboard) return null
  const melodyIds = new Set(selection.melodyIds)
  const stackIds = new Set(selection.stackIds)
  return {
    clipboard,
    project: {
      ...project,
      melody: project.melody.filter((m) => !melodyIds.has(m.id)),
      stacks: project.stacks.filter((s) => !stackIds.has(s.id)),
    },
  }
}

export function pasteClipboard(
  project: ArrangementProject,
  clipboard: ClipboardPayload,
  atTick: number,
  idGen?: IdGen,
): ArrangementProject {
  const next = idGen?.next ?? fallbackId
  const delta = atTick - clipboard.originTick
  const melody: MelodyEvent[] = [
    ...project.melody,
    ...clipboard.melody.map((m) => ({
      ...m,
      id: next('mel'),
      startTick: m.startTick + delta,
    })),
  ].sort((a, b) => a.startTick - b.startTick)

  const stacks: ChordStack[] = [
    ...project.stacks,
    ...clipboard.stacks.map((s) => ({
      ...s,
      id: next('stk'),
      startTick: s.startTick + delta,
      pillarId: null,
      midi: s.midi ? { ...s.midi } : null,
      ruleTags: [...s.ruleTags],
    })),
  ].sort((a, b) => a.startTick - b.startTick)

  return { ...project, melody, stacks }
}
