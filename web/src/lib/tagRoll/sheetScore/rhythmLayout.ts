/**
 * Build per-voice rhythmic events (notes, rests, ties, beam groups) for the sheet.
 */
import { collapsePartNotesMono, splitSlicesAtMeasures } from '../musicxmlExport'
import { beatTicks, measureTicks } from '../tempoMap'
import type { TagRollNote, TagRollTimeSignature } from '../types'
import { TAG_ROLL_PPQ } from '../types'
import { mapTicksToDuration, type MappedDuration } from './durationMap'
import type { SheetStaffAssignment, SheetStaffSpec, SheetVoiceRole } from './types'

export type SheetRhythmEvent = {
  id: string
  staffId: string
  partId: string
  color: string
  voice: 1 | 2
  stemUp: boolean
  role: SheetVoiceRole
  startTick: number
  durationTicks: number
  /** Concert MIDI; null = rest. */
  concertMidi: number | null
  tieStart: boolean
  tieStop: boolean
  duration: MappedDuration
  /** Shared id for beamed notes; null = draw flags / no beam. */
  beamGroupId: number | null
  /** Lyric syllable for this onset (Lead / solo); omitted on tie continuations. */
  lyric?: string
}

type RawSlice = {
  start: number
  dur: number
  midi?: number
  lyric?: string
  tieStart?: boolean
  tieStop?: boolean
}

function notesToTimeline(notes: readonly TagRollNote[], lengthTicks: number): RawSlice[] {
  const collapsed = collapsePartNotesMono(notes)
  const slices: RawSlice[] = []
  let cursor = 0
  let i = 0
  while (i < collapsed.length) {
    const groupStart = collapsed[i]!.startTick
    if (groupStart > cursor) {
      slices.push({ start: cursor, dur: groupStart - cursor })
      cursor = groupStart
    }
    // Monophonic voice: take the first note at this onset (lowest midi as tie-break).
    const group: TagRollNote[] = []
    while (i < collapsed.length && collapsed[i]!.startTick === groupStart) {
      group.push(collapsed[i]!)
      i++
    }
    group.sort((a, b) => a.midi - b.midi || a.id.localeCompare(b.id))
    const n = group[0]!
    const dur = Math.max(1, n.durationTicks)
    slices.push({
      start: groupStart,
      dur,
      midi: n.midi,
      ...(n.lyric ? { lyric: n.lyric } : {}),
    })
    cursor = groupStart + dur
  }
  if (cursor < lengthTicks) {
    slices.push({ start: cursor, dur: lengthTicks - cursor })
  }
  return slices
}

function assignBeams(
  events: SheetRhythmEvent[],
  timeSignature: TagRollTimeSignature,
  ppq: number,
): void {
  const bLen = beatTicks(timeSignature, ppq)
  let nextBeamId = 1

  // Group by staff+voice, then by beat.
  const byVoice = new Map<string, SheetRhythmEvent[]>()
  for (const e of events) {
    if (e.concertMidi == null) continue
    if (e.duration.flags < 1) continue
    const key = `${e.staffId}:${e.voice}`
    const list = byVoice.get(key) ?? []
    list.push(e)
    byVoice.set(key, list)
  }

  for (const list of byVoice.values()) {
    list.sort((a, b) => a.startTick - b.startTick)
    let i = 0
    while (i < list.length) {
      const e = list[i]!
      const beatStart = Math.floor(e.startTick / bLen) * bLen
      const beatEnd = beatStart + bLen
      const group: SheetRhythmEvent[] = []
      let j = i
      while (j < list.length) {
        const n = list[j]!
        if (n.startTick >= beatEnd) break
        // Break beam on gaps (another event of this voice that isn't in list means rest —
        // check contiguous starts).
        if (group.length) {
          const prev = group[group.length - 1]!
          if (n.startTick > prev.startTick + prev.durationTicks + 1) break
        }
        if (n.startTick < beatStart) {
          j++
          continue
        }
        group.push(n)
        j++
      }
      if (group.length >= 2) {
        const id = nextBeamId++
        for (const g of group) g.beamGroupId = id
      }
      i = Math.max(i + 1, j)
      // Advance past this beat's members
      while (i < list.length && list[i]!.startTick < beatEnd) i++
    }
  }
}

function eventsForStaffVoice(
  staff: SheetStaffSpec,
  voiceSlot: {
    partId: string
    color: string
    voice: 1 | 2
    role: SheetVoiceRole
  },
  notes: readonly TagRollNote[],
  lengthTicks: number,
  timeSignature: TagRollTimeSignature,
  ppq: number,
): SheetRhythmEvent[] {
  const partNotes = notes.filter((n) => n.partId === voiceSlot.partId)
  const timeline = notesToTimeline(partNotes, lengthTicks)
  const mLen = measureTicks(timeSignature, ppq)
  const measures = splitSlicesAtMeasures(timeline, mLen, lengthTicks)
  const out: SheetRhythmEvent[] = []
  let seq = 0
  for (const slices of measures) {
    for (const s of slices) {
      if (s.dur <= 0) continue
      const duration = mapTicksToDuration(s.dur, ppq)
      out.push({
        id: `${staff.id}-${voiceSlot.voice}-${seq++}`,
        staffId: staff.id,
        partId: voiceSlot.partId,
        color: voiceSlot.color,
        voice: voiceSlot.voice,
        stemUp: voiceSlot.voice === 1,
        role: voiceSlot.role,
        startTick: s.start,
        durationTicks: s.dur,
        concertMidi: s.midi ?? null,
        tieStart: !!s.tieStart,
        tieStop: !!s.tieStop,
        duration,
        beamGroupId: null,
        ...(s.lyric ? { lyric: s.lyric } : {}),
      })
    }
  }
  return out
}

/** Build all rhythmic events for the assigned staves. */
export function buildSheetRhythm(opts: {
  assignment: SheetStaffAssignment
  notes: readonly TagRollNote[]
  lengthTicks: number
  timeSignature: TagRollTimeSignature
  ppq?: number
}): SheetRhythmEvent[] {
  const ppq = opts.ppq ?? TAG_ROLL_PPQ
  const lengthTicks = Math.max(
    measureTicks(opts.timeSignature, ppq),
    opts.lengthTicks,
  )
  const events: SheetRhythmEvent[] = []
  for (const staff of opts.assignment.staves) {
    for (const slot of staff.voices) {
      events.push(
        ...eventsForStaffVoice(
          staff,
          slot,
          opts.notes,
          lengthTicks,
          opts.timeSignature,
          ppq,
        ),
      )
    }
  }
  assignBeams(events, opts.timeSignature, ppq)
  return events.sort(
    (a, b) =>
      a.startTick - b.startTick ||
      a.staffId.localeCompare(b.staffId) ||
      a.voice - b.voice,
  )
}
