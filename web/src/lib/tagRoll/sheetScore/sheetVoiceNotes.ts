/**
 * Build VexFlow StaveNotes for one staff voice (dots, ties, rests, lyrics).
 */
import { Stem, type Factory, type StaveNote } from 'vexflow'
import { MELODY_PART_BORDER_COLOR } from '../../../domain/arranging/melodyRoleLabels'
import { midiToMusicXmlPitch } from '../midiPitch'
import type { TagRollProject } from '../types'
import { mapTicksToDuration, type NoteDurationType } from './durationMap'
import {
  nearbySameVoiceDegree,
  pickRestPlacement,
  restDurationKind,
  type RestOccupant,
  vexKeyToDegree,
} from './restPlacement'
import type { SheetRhythmEvent } from './rhythmLayout'
import { lyricTextLineForVoice } from './sheetLyricLanes'
import { parseLyricSyllable, type ParsedLyricSyllable } from './sheetLyricSyllabic'
import {
  spelledPitchToVexKey,
  type SpelledPitch,
} from './sheetPitchSpelling'
import {
  attachNoteDots,
  connectSheetTie,
  type SheetTieAnchor,
} from './sheetRhythmMarks'
import { applySheetStemLength } from './sheetStemLength'
import type { SheetClefKind, SheetStaffSpec } from './types'
import { concertToWrittenMidi } from './writtenPitch'

const MELODY_NOTE_STROKE = MELODY_PART_BORDER_COLOR

export type PlacedTickable = {
  tick: number
  note: StaveNote
  /** Sounding notes — use for cursor anchors (whole rests are center-shifted). */
  preferAnchor: boolean
  sourceNoteId?: string
  lyric?: string
  voice?: 1 | 2
  partId?: string
}

export function vexDuration(type: NoteDurationType, isRest: boolean): string {
  const base: Record<NoteDurationType, string> = {
    whole: 'w',
    half: 'h',
    quarter: 'q',
    eighth: '8',
    sixteenth: '16',
    'thirty-second': '32',
  }
  // Dots via StaveNoteStruct.dots + attachNoteDots — appending 'd' breaks rests.
  return base[type] + (isRest ? 'r' : '')
}

export function midiToVexKey(
  writtenMidi: number,
  preferFlats: boolean,
  spelled?: SpelledPitch | null,
): string {
  if (spelled) return spelledPitchToVexKey(spelled)
  const { step, alter, octave } = midiToMusicXmlPitch(writtenMidi, preferFlats)
  let acc = ''
  if (alter === 1) acc = '#'
  else if (alter === 2) acc = '##'
  else if (alter === -1) acc = 'b'
  else if (alter === -2) acc = 'bb'
  return `${step.toLowerCase()}${acc}/${octave}`
}

/** StaveNote staff-line math uses the note's clef, not the stave glyph. */
export function vexNoteClef(kind: SheetClefKind): string {
  return kind.startsWith('bass') ? 'bass' : 'treble'
}

export function buildVoiceNotes(
  factory: Factory,
  events: readonly SheetRhythmEvent[],
  staff: SheetStaffSpec,
  clefFamily: TagRollProject['clefFamily'],
  flatsFor: (tick: number) => boolean,
  stemUp: boolean,
  showLyrics: boolean,
  straightLyrics: boolean,
  restOccupants: readonly RestOccupant[],
  placedRestsOut: RestOccupant[],
  placedOut: PlacedTickable[],
  noteColors: boolean,
  lyricFontPx: number,
  lyricOffsets: Readonly<Record<string, number>>,
  lyricPartOn: (partId: string) => boolean,
  stemLength: number,
  voice: 1 | 2,
  openTies: Map<string, SheetTieAnchor>,
  spellFor?: (writtenMidi: number, tick: number) => SpelledPitch,
  systemIndex = 0,
): StaveNote[] {
  const clef = vexNoteClef(staff.clef)
  const notes: StaveNote[] = []
  let lyricOpen = false
  for (const e of events) {
    const isRest = e.concertMidi == null
    let keys: string[]
    let restXShift = 0
    if (isRest) {
      const preferDegree = nearbySameVoiceDegree(
        events, e.startTick, e.durationTicks, clefFamily, staff.kind, flatsFor(e.startTick),
      )
      const place = pickRestPlacement({
        clef: clef as 'treble' | 'bass', stemUp,
        startTick: e.startTick, durationTicks: e.durationTicks,
        occupants: restOccupants, durationKind: restDurationKind(e.duration.type),
        ...(preferDegree != null ? { preferDegree } : {}),
      })
      keys = [place.key]
      restXShift = place.xShift
      placedRestsOut.push({
        startTick: e.startTick, durationTicks: e.durationTicks, degree: vexKeyToDegree(place.key),
      })
    } else {
      const written = concertToWrittenMidi(e.concertMidi!, clefFamily, staff.kind)
      const spelled = spellFor?.(written, e.startTick) ?? null
      keys = [midiToVexKey(written, flatsFor(e.startTick), spelled)]
    }
    const note = factory.StaveNote({
      keys,
      duration: vexDuration(e.duration.type, isRest),
      dots: e.duration.dots || undefined,
      clef,
      stemDirection: isRest ? undefined : stemUp ? Stem.UP : Stem.DOWN,
      autoStem: false,
    })
    if (e.duration.dots > 0) attachNoteDots(note, e.duration.dots)
    if (restXShift) note.setXShift(restXShift)
    if (!isRest) applySheetStemLength(note, stemLength)
    if (noteColors && !isRest && e.isMelody) {
      note.setStyle({ strokeStyle: MELODY_NOTE_STROKE })
    }
    connectSheetTie(
      factory,
      openTies,
      `${e.partId}:${voice}`,
      note,
      e.concertMidi,
      e.tieStart,
      e.tieStop,
      systemIndex,
    )
    const showPartLyric = showLyrics && lyricPartOn(e.partId)
    const parsed: ParsedLyricSyllable | null =
      showPartLyric && e.lyric && !e.tieStop
        ? parseLyricSyllable(e.lyric, lyricOpen)
        : null
    if (parsed) {
      lyricOpen =
        parsed.syllabic === 'begin' ||
        parsed.syllabic === 'middle' ||
        parsed.extendAfter
      if (parsed.syllabic === 'end' || parsed.syllabic === 'single') {
        lyricOpen = parsed.extendAfter
      }
    }
    const lyricText = parsed?.text || undefined
    if (lyricText && !straightLyrics) {
      const ann = factory.Annotation({ text: lyricText, vJustify: 'bottom' })
      ann.setFontSize(lyricFontPx)
      // Match vector PDF outlines (regular Academico) — never synthetic bold.
      ann.fontWeight = 'normal'
      ann.setTextLine(lyricTextLineForVoice(e.voice, lyricOffsets[e.partId] ?? 0))
      note.addModifier(ann, 0)
    }
    notes.push(note)
    placedOut.push({
      tick: e.startTick,
      note,
      preferAnchor: !isRest,
      voice,
      partId: e.partId,
      ...(e.sourceNoteId ? { sourceNoteId: e.sourceNoteId } : {}),
      // Straight lanes re-parse from raw lyric (keep hyphen / extender tokens).
      ...(showPartLyric && e.lyric && !e.tieStop && straightLyrics
        ? { lyric: e.lyric }
        : {}),
    })
  }
  return notes
}

export function fillMeasureIfEmpty(
  factory: Factory,
  notes: StaveNote[],
  measureTicksCount: number,
  measureStartTick: number,
  ppq: number,
  clef: string,
  stemUp: boolean,
  restOccupants: readonly RestOccupant[],
  placedRestsOut: RestOccupant[],
  placedOut: PlacedTickable[],
): StaveNote[] {
  if (notes.length) return notes
  const mapped = mapTicksToDuration(measureTicksCount, ppq)
  const place = pickRestPlacement({
    clef: clef as 'treble' | 'bass',
    stemUp,
    startTick: measureStartTick,
    durationTicks: measureTicksCount,
    occupants: restOccupants,
    durationKind: restDurationKind(mapped.type),
  })
  placedRestsOut.push({
    startTick: measureStartTick,
    durationTicks: measureTicksCount,
    degree: vexKeyToDegree(place.key),
  })
  const note = factory.StaveNote({
    keys: [place.key],
    duration: vexDuration(mapped.type, true),
    dots: mapped.dots || undefined,
    clef,
    autoStem: false,
  })
  if (mapped.dots > 0) attachNoteDots(note, mapped.dots)
  if (place.xShift) note.setXShift(place.xShift)
  placedOut.push({ tick: measureStartTick, note, preferAnchor: false })
  return [note]
}
