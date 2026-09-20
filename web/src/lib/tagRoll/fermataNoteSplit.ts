/**
 * Fermata sounding for bounce/MIDI: play the full written note, then hold,
 * then gap — never chop the note at the fermata mark and resume the remainder.
 */
import {
  bpmAtTick,
  fermataExecutionTick,
  performanceTick,
  secondsAtTick,
  ticksToSecondsAtBpm,
} from './tempoMap'
import type { TagRollExpression, TagRollNote, TagRollTempoMarker } from './types'
import { TAG_ROLL_DEFAULT_BPM, TAG_ROLL_PPQ } from './types'

export type SoundSegment = { startSec: number; durSec: number }

export type PerformanceNoteSlice = {
  startTick: number
  durationTicks: number
  midi: number
  partId: string
  lyric?: string
}

function noteEnd(n: { startTick: number; durationTicks: number }): number {
  return n.startTick + Math.max(0, n.durationTicks)
}

/** Fermatas whose hold runs at this note’s written end (note participates). */
function fermatasAtNoteEnd(
  note: { startTick: number; durationTicks: number },
  expressions: readonly TagRollExpression[],
  allNotes: readonly { startTick: number; durationTicks: number }[],
): Extract<TagRollExpression, { kind: 'fermata' }>[] {
  const end = noteEnd(note)
  return expressions
    .filter((e): e is Extract<TagRollExpression, { kind: 'fermata' }> => {
      if (e.kind !== 'fermata') return false
      if (fermataExecutionTick(e.tick, allNotes) !== end) return false
      const startsHere = note.startTick === e.tick
      const spans = note.startTick < e.tick && end > e.tick
      return startsHere || spans
    })
    .slice()
    .sort((a, b) => a.tick - b.tick)
}

/**
 * Wall-clock sounding segments for one score note (gaps omitted = silence).
 * Continuous through written duration + hold(s) at the note end.
 */
export function noteSoundSegments(
  note: Pick<TagRollNote, 'startTick' | 'durationTicks'>,
  markers: readonly TagRollTempoMarker[],
  expressions: readonly TagRollExpression[],
  fallbackBpm = TAG_ROLL_DEFAULT_BPM,
  allNotes: readonly { startTick: number; durationTicks: number }[] = [note],
): SoundSegment[] {
  const startTick = note.startTick
  const endTick = noteEnd(note)
  if (endTick <= startTick) return []

  const closing = fermatasAtNoteEnd(note, expressions, allNotes)
  let holdSec = 0
  for (const f of closing) {
    const bpm = Math.max(1, bpmAtTick(f.tick, markers, expressions, fallbackBpm))
    holdSec += ticksToSecondsAtBpm(f.holdTicks, bpm)
  }

  const step = Math.max(1, Math.round(TAG_ROLL_PPQ / 16))
  const wStart = secondsAtTick(
    startTick,
    markers,
    expressions,
    fallbackBpm,
    step,
    allNotes,
  )
  const wEnd =
    secondsAtTick(endTick, markers, expressions, fallbackBpm, step, allNotes) + holdSec
  const dur = wEnd - wStart
  if (dur <= 1e-4) return []
  return [{ startSec: wStart, durSec: dur }]
}

/**
 * Performance-timeline note slices for MIDI (written duration + hold; gap silent).
 */
export function notePerformanceSlices(
  note: TagRollNote,
  expressions: readonly TagRollExpression[],
  allNotes: readonly { startTick: number; durationTicks: number }[] = [note],
): PerformanceNoteSlice[] {
  const startTick = note.startTick
  const endTick = noteEnd(note)
  if (endTick <= startTick) return []

  const closing = fermatasAtNoteEnd(note, expressions, allNotes)
  let holdTicks = 0
  for (const f of closing) holdTicks += f.holdTicks

  const pStart = performanceTick(startTick, expressions, allNotes)
  const pEnd = performanceTick(endTick, expressions, allNotes) + holdTicks
  const dur = pEnd - pStart
  if (dur <= 0) return []
  return [
    {
      startTick: pStart,
      durationTicks: dur,
      midi: note.midi,
      partId: note.partId,
      lyric: note.lyric,
    },
  ]
}

export function expandNotesForMidi(
  notes: readonly TagRollNote[],
  expressions: readonly TagRollExpression[],
): PerformanceNoteSlice[] {
  const out: PerformanceNoteSlice[] = []
  for (const n of notes) {
    out.push(...notePerformanceSlices(n, expressions, notes))
  }
  return out
}
