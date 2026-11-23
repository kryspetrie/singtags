/**
 * Clipboard helpers for tuplet containers + members as one unit.
 */
import {
  assertNoTupletOverlap,
  createTupletContainer,
  notesForTuplet,
  type TupletRatio,
} from './tupletContainers'
import { ensureLengthForTick } from './snap'
import { measureTicks } from './tempoMap'
import type { TagRollNote, TagRollProject, TagRollTuplet } from './types'

/** Member note relative to its container start. */
export type ClipboardTupletMember = {
  midi: number
  startTick: number
  durationTicks: number
  partId: string
  lyric?: string
}

/** Container relative to clipboard origin (min container start of the copied set). */
export type ClipboardTuplet = {
  startTick: number
  spanTicks: number
  partId: string
  actualNotes: number
  normalNotes: number
  members: ClipboardTupletMember[]
}

export function tupletToClipboard(
  tuplet: TagRollTuplet,
  notes: readonly TagRollNote[],
): ClipboardTuplet {
  const origin = tuplet.startTick
  const members = notesForTuplet(notes, tuplet.id).map((n) => ({
    midi: n.midi,
    startTick: n.startTick - origin,
    durationTicks: n.durationTicks,
    partId: n.partId,
    ...(n.lyric ? { lyric: n.lyric } : {}),
  }))
  return {
    startTick: 0,
    spanTicks: tuplet.spanTicks,
    partId: tuplet.partId,
    actualNotes: tuplet.actualNotes,
    normalNotes: tuplet.normalNotes,
    members,
  }
}

export function tupletsToClipboard(
  tuplets: readonly TagRollTuplet[],
  notes: readonly TagRollNote[],
): ClipboardTuplet[] | null {
  if (!tuplets.length) return null
  const sorted = [...tuplets].sort((a, b) => a.startTick - b.startTick || a.id.localeCompare(b.id))
  const origin = sorted[0]!.startTick
  return sorted.map((t) => {
    const unit = tupletToClipboard(t, notes)
    return { ...unit, startTick: t.startTick - origin }
  })
}

function mapPartId(
  partId: string,
  partIds: ReadonlySet<string>,
  fallback: string | undefined,
): string {
  return partIds.has(partId) ? partId : (fallback ?? partId)
}

function crossesBarline(
  startTick: number,
  spanTicks: number,
  mTicks: number,
): boolean {
  return Math.floor(startTick / mTicks) !== Math.floor((startTick + spanTicks - 1) / mTicks)
}

/**
 * Place clipboard tuplets at `originTick`. Returns null when any unit would
 * overlap an existing container or cross a barline.
 */
export function clipboardTupletsAtPlayhead(
  project: TagRollProject,
  clipTuplets: readonly ClipboardTuplet[],
  originTick: number,
  opts: {
    newNoteId: () => string
    newTupletId: () => string
  },
): {
  notes: TagRollNote[]
  tuplets: TagRollTuplet[]
  createdTupletIds: string[]
  createdNoteIds: string[]
  lengthTicks: number
} | null {
  if (!clipTuplets.length) {
    return {
      notes: [],
      tuplets: [],
      createdTupletIds: [],
      createdNoteIds: [],
      lengthTicks: project.lengthTicks,
    }
  }

  const partIds = new Set(project.parts.map((p) => p.id))
  const active = project.view.activePartId ?? project.parts[0]?.id
  const mTicks = measureTicks(project.timeSignature)
  const origin = Math.max(0, Math.round(originTick))

  let lengthTicks = project.lengthTicks
  const nextTuplets = [...(project.tuplets ?? [])]
  const createdNotes: TagRollNote[] = []
  const createdTupletIds: string[] = []
  const createdNoteIds: string[] = []

  for (const unit of clipTuplets) {
    const startTick = origin + Math.max(0, Math.round(unit.startTick))
    const spanTicks = Math.max(1, Math.round(unit.spanTicks))
    const partId = mapPartId(unit.partId, partIds, active)
    const ratio: TupletRatio = {
      actualNotes: Math.max(2, Math.round(unit.actualNotes)),
      normalNotes: Math.max(1, Math.round(unit.normalNotes)),
    }
    if (crossesBarline(startTick, spanTicks, mTicks)) return null
    const candidate = createTupletContainer({
      id: opts.newTupletId(),
      partId,
      startTick,
      spanTicks,
      ...ratio,
    })
    if (!assertNoTupletOverlap(nextTuplets, candidate)) return null
    nextTuplets.push(candidate)
    createdTupletIds.push(candidate.id)
    lengthTicks = ensureLengthForTick(lengthTicks, startTick + spanTicks, mTicks)

    for (const m of unit.members) {
      const note: TagRollNote = {
        id: opts.newNoteId(),
        partId: mapPartId(m.partId, partIds, partId),
        midi: m.midi,
        startTick: Math.max(0, Math.round(startTick + m.startTick)),
        durationTicks: Math.max(1, Math.round(m.durationTicks)),
        ...(m.lyric ? { lyric: m.lyric } : {}),
        tuplet: {
          groupId: candidate.id,
          actualNotes: ratio.actualNotes,
          normalNotes: ratio.normalNotes,
        },
      }
      createdNotes.push(note)
      createdNoteIds.push(note.id)
      lengthTicks = ensureLengthForTick(
        lengthTicks,
        note.startTick + note.durationTicks,
        mTicks,
      )
    }
  }

  return {
    notes: createdNotes,
    tuplets: nextTuplets,
    createdTupletIds,
    createdNoteIds,
    lengthTicks,
  }
}
