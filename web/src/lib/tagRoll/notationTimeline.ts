/**
 * Shared monophonic timeline + barline splits for sheet engraving and MusicXML.
 */
import { deferOverlappingOnsets } from './portamento'
import type { TagRollNote } from './types'

export type NotationSlice = {
  start: number
  dur: number
  midi?: number
  lyric?: string
  tieStart?: boolean
  tieStop?: boolean
}

/**
 * Collapse same-part overlaps for monophonic notation.
 *
 * Portamento in the roll starts the destination note early so the glide can
 * finish at the source note’s written end. For notation we keep the source
 * duration intact and defer the destination onset to that release.
 */
export function collapsePartNotesMono(notes: readonly TagRollNote[]): TagRollNote[] {
  return deferOverlappingOnsets([...notes], (a, b) => a.midi - b.midi || a.id.localeCompare(b.id))
}

/**
 * Monophonic timeline: lowest MIDI at each onset (sheet and MusicXML stay in sync).
 * Same-onset doubles are dropped. Authored `tie.toNoteId` sets slice tie flags.
 */
export function notesToTimelineMono(
  notes: readonly TagRollNote[],
  lengthTicks: number,
): NotationSlice[] {
  const collapsed = collapsePartNotesMono(notes)
  const tiedInto = new Set(
    collapsed.map((n) => n.tie?.toNoteId).filter((id): id is string => !!id),
  )
  const slices: NotationSlice[] = []
  let cursor = 0
  let i = 0
  while (i < collapsed.length) {
    const groupStart = collapsed[i]!.startTick
    if (groupStart > cursor) {
      slices.push({ start: cursor, dur: groupStart - cursor })
      cursor = groupStart
    }
    const group: TagRollNote[] = []
    while (i < collapsed.length && collapsed[i]!.startTick === groupStart) {
      group.push(collapsed[i]!)
      i++
    }
    group.sort((a, b) => a.midi - b.midi || a.id.localeCompare(b.id))
    const n = group[0]!
    const dur = Math.max(1, n.durationTicks)
    const isTieStop = tiedInto.has(n.id)
    slices.push({
      start: groupStart,
      dur,
      midi: n.midi,
      ...(n.lyric && !isTieStop ? { lyric: n.lyric } : {}),
      ...(n.tie?.toNoteId ? { tieStart: true } : {}),
      ...(isTieStop ? { tieStop: true } : {}),
    })
    cursor = groupStart + dur
  }
  if (cursor < lengthTicks) {
    slices.push({ start: cursor, dur: lengthTicks - cursor })
  }
  return slices
}

/** Split timeline slices on barlines; ties continue sounding notes. */
export function splitSlicesAtMeasures(
  slices: NotationSlice[],
  mLen: number,
  lengthTicks: number,
): NotationSlice[][] {
  const measureCount = Math.max(1, Math.ceil(lengthTicks / mLen))
  const measures: NotationSlice[][] = Array.from({ length: measureCount }, () => [])
  for (const s of slices) {
    let remaining = s.dur
    let t = s.start
    let first = true
    while (remaining > 0) {
      const mIndex = Math.min(measureCount - 1, Math.floor(t / mLen))
      const barEnd = (mIndex + 1) * mLen
      const take = Math.min(remaining, barEnd - t, lengthTicks - t)
      if (take <= 0) break
      const isLastPiece = remaining <= take
      // Barline splits always start a tie; preserve authored start/stop on edges.
      const tieStart = s.midi != null && (remaining > take || (!!s.tieStart && isLastPiece))
      const tieStop = s.midi != null && (!first || !!s.tieStop)
      measures[mIndex]!.push({
        start: t,
        dur: take,
        midi: s.midi,
        lyric: first ? s.lyric : undefined,
        tieStart: tieStart || undefined,
        tieStop: tieStop || undefined,
      })
      t += take
      remaining -= take
      first = false
    }
  }
  for (let m = 0; m < measureCount; m++) {
    if (!measures[m]!.length) {
      measures[m]!.push({ start: m * mLen, dur: mLen })
    }
  }
  return measures
}
