/**
 * Build per-voice rhythmic events (notes, rests, ties, beam groups) for the sheet.
 */
import {
  notesToTimelineMono,
  splitSlicesAtMeasures,
} from '../notationTimeline'
import { beamGroupTicks, beatTicks, measureTicks } from '../tempoMap'
import type { TagRollNote, TagRollTimeSignature } from '../types'
import { TAG_ROLL_PPQ } from '../types'
import {
  decomposeTicksToDurations,
  type MappedDuration,
} from './durationMap'
import {
  inferTupletsOnEvents,
  tryTupletMemberAtom,
  tupletMemberDuration,
  type SheetTupletInfo,
} from './sheetTuplets'
import type { SheetStaffAssignment, SheetStaffSpec, SheetVoiceRole } from './types'

export type SheetRhythmEvent = {
  id: string
  staffId: string
  partId: string
  color: string
  voice: 1 | 2
  stemUp: boolean
  role: SheetVoiceRole
  /** Project melody part (lyrics / melody cues follow this). */
  isMelody?: boolean
  /** Strong / Passing on melody-part notes (Roles). */
  melodyRole?: 'pmn' | 'smn'
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
  /** Tag Roll note this onset came from, when it is a real notehead. */
  sourceNoteId?: string
  /** Tuplet bracket membership (inferred or from the source note). */
  tuplet?: SheetTupletInfo
}

function assignBeams(
  events: SheetRhythmEvent[],
  timeSignature: TagRollTimeSignature,
  ppq: number,
): void {
  const gLen = beamGroupTicks(timeSignature, ppq)
  let nextBeamId = 1

  // Group by staff+voice, then by beam-group unit (beat or compound beat).
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
      const beatStart = Math.floor(e.startTick / gLen) * gLen
      const beatEnd = beatStart + gLen
      const group: SheetRhythmEvent[] = []
      let j = i
      while (j < list.length) {
        const n = list[j]!
        if (n.startTick >= beatEnd) break
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
    isMelody?: boolean
  },
  notes: readonly TagRollNote[],
  lengthTicks: number,
  timeSignature: TagRollTimeSignature,
  ppq: number,
  melodyPartAt?: (tick: number) => string | null,
): SheetRhythmEvent[] {
  const partNotes = notes.filter((n) => n.partId === voiceSlot.partId)
  const timeline = notesToTimelineMono(partNotes, lengthTicks)
  const mLen = measureTicks(timeSignature, ppq)
  const bLen = beatTicks(timeSignature, ppq)
  const measures = splitSlicesAtMeasures(timeline, mLen, lengthTicks)
  const out: SheetRhythmEvent[] = []
  let seq = 0
  for (const slices of measures) {
    for (const s of slices) {
      if (s.dur <= 0) continue
      const source = partNotes.find(
        (n) =>
          n.midi === s.midi &&
          n.startTick <= s.start &&
          s.start < n.startTick + n.durationTicks,
      )
      // Tuplet atoms (⅓ beat) stay as one glyph; otherwise greedy + mid-bar splits.
      const tupletAtom = s.midi != null ? tryTupletMemberAtom(s.dur, ppq) : null
      const pieces: MappedDuration[] = tupletAtom
        ? [tupletAtom]
        : decomposeTicksToDurations(s.dur, ppq, {
            startTick: s.start,
            measureTicks: mLen,
            beatTicks: bLen,
          })
      let t = s.start
      for (let i = 0; i < pieces.length; i++) {
        const duration = pieces[i]!
        const isFirst = i === 0
        const isLast = i === pieces.length - 1
        const durTicks = duration.ticks
        const isMelody = melodyPartAt
          ? melodyPartAt(t) === voiceSlot.partId && s.midi != null
          : !!voiceSlot.isMelody
        const onTieContinuation = !!s.tieStop || !isFirst
        const melodyRole =
          isMelody &&
          s.midi != null &&
          !onTieContinuation &&
          (source?.role === 'pmn' || source?.role === 'smn')
            ? source.role
            : undefined
        const isNote = s.midi != null
        out.push({
          id: `${staff.id}-${voiceSlot.voice}-${seq++}`,
          staffId: staff.id,
          partId: voiceSlot.partId,
          color: voiceSlot.color,
          voice: voiceSlot.voice,
          stemUp: voiceSlot.voice === 1,
          role: voiceSlot.role,
          ...(isMelody ? { isMelody: true } : {}),
          ...(source && isNote ? { sourceNoteId: source.id } : {}),
          ...(melodyRole === 'pmn' || melodyRole === 'smn' ? { melodyRole } : {}),
          startTick: t,
          durationTicks: durTicks,
          concertMidi: s.midi ?? null,
          // Rests are never tied; notes tie across splits / barlines.
          tieStart: isNote && (!isLast || !!s.tieStart),
          tieStop: isNote && (!isFirst || !!s.tieStop),
          duration,
          beamGroupId: null,
          ...(isFirst && s.lyric ? { lyric: s.lyric } : {}),
        })
        // Carry explicit tuplet from the source note onto the first engraved piece.
        if (isNote && isFirst && source?.tuplet) {
          const last = out[out.length - 1]!
          last.tuplet = {
            id: hashTupletGroupId(source.tuplet.groupId),
            actualNotes: source.tuplet.actualNotes,
            normalNotes: source.tuplet.normalNotes,
            index: -1, // filled in resolveExplicitTuplets
          }
        }
        t += durTicks
      }
    }
  }
  return out
}

/** Stable positive id from a tuplet group string. */
function hashTupletGroupId(groupId: string): number {
  let h = 0
  for (let i = 0; i < groupId.length; i++) h = (h * 31 + groupId.charCodeAt(i)) | 0
  return Math.abs(h) || 1
}

/** Assign indices + written durations for notes that already carry a tuplet id. */
function resolveExplicitTuplets(events: SheetRhythmEvent[], ppq: number): void {
  const byId = new Map<number, SheetRhythmEvent[]>()
  for (const e of events) {
    if (!e.tuplet || e.concertMidi == null) continue
    const list = byId.get(e.tuplet.id) ?? []
    list.push(e)
    byId.set(e.tuplet.id, list)
  }
  for (const members of byId.values()) {
    members.sort((a, b) => a.startTick - b.startTick)
    const sum = members.reduce((s, e) => s + e.durationTicks, 0)
    const written = tupletMemberDuration(sum, ppq)
    for (let i = 0; i < members.length; i++) {
      const e = members[i]!
      e.tuplet = {
        id: e.tuplet!.id,
        actualNotes: e.tuplet!.actualNotes,
        normalNotes: e.tuplet!.normalNotes,
        index: i,
      }
      e.duration = { ...written, ticks: e.durationTicks }
    }
  }
}

/** Build all rhythmic events for the assigned staves. */
export function buildSheetRhythm(opts: {
  assignment: SheetStaffAssignment
  notes: readonly TagRollNote[]
  lengthTicks: number
  timeSignature: TagRollTimeSignature
  ppq?: number
  /** Part that owns the melody at a tick. Omitted: use each voice slot's isMelody flag. */
  melodyPartAt?: (tick: number) => string | null
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
          opts.melodyPartAt,
        ),
      )
    }
  }
  assignBeams(events, opts.timeSignature, ppq)
  resolveExplicitTuplets(events, ppq)
  // Infer 3:2 tuplets per staff+voice (skips events that already have tuplet info).
  const byVoice = new Map<string, SheetRhythmEvent[]>()
  for (const e of events) {
    const key = `${e.staffId}:${e.voice}`
    const list = byVoice.get(key) ?? []
    list.push(e)
    byVoice.set(key, list)
  }
  for (const list of byVoice.values()) inferTupletsOnEvents(list, ppq)
  return events.sort(
    (a, b) =>
      a.startTick - b.startTick ||
      a.staffId.localeCompare(b.staffId) ||
      a.voice - b.voice,
  )
}
