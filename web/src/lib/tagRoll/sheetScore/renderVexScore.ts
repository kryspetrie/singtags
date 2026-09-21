/**
 * Render Tag Studio sheet via VexFlow (Bravura) — continuous horizontal systems.
 */
import {
  Beam,
  Factory,
  StaveNote,
  Stem,
  Voice,
  VexFlow,
  type Stave,
} from 'vexflow'
import { midiToMusicXmlPitch } from '../musicxmlExport'
import { measureTicks } from '../tempoMap'
import type { TagRollProject } from '../types'
import { TAG_ROLL_PPQ } from '../types'
import {
  SHEET_FIRST_MEASURE_CLEF_EXTRA_PX,
  SHEET_LEFT_PAD,
  SHEET_RIGHT_PAD,
  sheetMeasureWidthPx,
} from '../zoomFill'
import { assignSheetStaves } from './assignStaves'
import { mapTicksToDuration, type NoteDurationType } from './durationMap'
import {
  noteOccupantsFromEvents,
  pickRestKey,
  restDurationKind,
  type RestOccupant,
  vexKeyToDegree,
} from './restPlacement'
import { buildSheetRhythm, type SheetRhythmEvent } from './rhythmLayout'
import type { SheetClefKind, SheetStaffSpec } from './types'
import { concertToWrittenMidi } from './writtenPitch'
import { vexKeySpec } from '../keySignature'

export type VexScoreMeasureGeom = {
  measureIndex: number
  startTick: number
  endTick: number
  /** Left edge of the measure system (includes clef gutter on m0). */
  x: number
  width: number
  /** Left edge of the engraved note area (after clef / time / key). */
  noteStartX: number
  /** Right edge of the engraved note area (before barline padding). */
  noteEndX: number
}

export type VexScoreLayoutResult = {
  width: number
  height: number
  /** Y offset where the top staff begins (below expression band). */
  contentOriginY: number
  /** Content x of tick 0 (after left padding). */
  contentOriginX: number
  measures: VexScoreMeasureGeom[]
  /** Map musical tick → x in the rendered SVG content. */
  tickToX: (tick: number) => number
}

let fontsReady: Promise<void> | null = null

export function ensureVexFonts(): Promise<void> {
  if (!fontsReady) {
    fontsReady = (async () => {
      // happy-dom / some test envs lack FontFace — still set module fonts.
      if (typeof FontFace !== 'undefined') {
        await VexFlow.loadFonts('Bravura', 'Academico')
      }
      VexFlow.setFonts('Bravura', 'Academico')
    })()
  }
  return fontsReady
}

function vexDuration(type: NoteDurationType, isRest: boolean): string {
  const base: Record<NoteDurationType, string> = {
    whole: 'w',
    half: 'h',
    quarter: 'q',
    eighth: '8',
    sixteenth: '16',
    'thirty-second': '32',
  }
  // Dots via StaveNoteStruct.dots — appending 'd' breaks rest glyphs.
  return base[type] + (isRest ? 'r' : '')
}

function midiToVexKey(writtenMidi: number, preferFlats: boolean): string {
  const { step, alter, octave } = midiToMusicXmlPitch(writtenMidi, preferFlats)
  let acc = ''
  if (alter === 1) acc = '#'
  else if (alter === 2) acc = '##'
  else if (alter === -1) acc = 'b'
  else if (alter === -2) acc = 'bb'
  return `${step.toLowerCase()}${acc}/${octave}`
}

function clefSpec(kind: SheetClefKind): { clef: string; annotation?: string } {
  switch (kind) {
    case 'treble8vb':
      return { clef: 'treble', annotation: '8vb' }
    case 'bass8va':
      return { clef: 'bass', annotation: '8va' }
    case 'bass':
      return { clef: 'bass' }
    default:
      return { clef: 'treble' }
  }
}

/** StaveNote staff-line math uses the note's clef, not the stave glyph. */
function vexNoteClef(kind: SheetClefKind): string {
  return kind.startsWith('bass') ? 'bass' : 'treble'
}

const FIRST_MEASURE_CLEF_EXTRA_PX = SHEET_FIRST_MEASURE_CLEF_EXTRA_PX
/** Top-to-top stave spacing in staff-spaces (×10px). */
const SPACE_BETWEEN_STAVES = 8
/** Extra room between grand-staff staves when lyrics are on. */
const SPACE_BETWEEN_STAVES_LYRICS = 18
/** Top pad inside the SVG for expression marks drawn in the HTML overlay. */
const SCORE_TOP_PAD = 52
const SCORE_BOTTOM_PAD = 36
const LYRIC_FONT_PX = 12
/** Push lyric lines below stems / noteheads (VexFlow textLine units). */
const LYRIC_TEXT_LINE_V1 = 2
const LYRIC_TEXT_LINE_V2 = 3
const LYRIC_STAVE_SPACE_BELOW = 4

function eventsInMeasure(
  events: readonly SheetRhythmEvent[],
  start: number,
  end: number,
): SheetRhythmEvent[] {
  return events.filter((e) => e.startTick >= start && e.startTick < end)
}

type PlacedTickable = {
  tick: number
  note: StaveNote
  /** Sounding notes — use for cursor anchors (whole rests are center-shifted). */
  preferAnchor: boolean
}

function buildVoiceNotes(
  factory: Factory,
  events: readonly SheetRhythmEvent[],
  staff: SheetStaffSpec,
  clefFamily: TagRollProject['clefFamily'],
  preferFlats: boolean,
  stemUp: boolean,
  showLyrics: boolean,
  /** Other-voice notes/rests on this staff that occupy diatonic degrees. */
  restOccupants: readonly RestOccupant[],
  /** Collect placed rest degrees so later voices can dodge them. */
  placedRestsOut: RestOccupant[],
  placedOut: PlacedTickable[],
): StaveNote[] {
  const clef = vexNoteClef(staff.clef)
  const notes: StaveNote[] = []
  for (const e of events) {
    const isRest = e.concertMidi == null
    let keys: string[]
    if (isRest) {
      const key = pickRestKey({
        clef: clef as 'treble' | 'bass',
        stemUp,
        startTick: e.startTick,
        durationTicks: e.durationTicks,
        occupants: restOccupants,
        durationKind: restDurationKind(e.duration.type),
      })
      keys = [key]
      placedRestsOut.push({
        startTick: e.startTick,
        durationTicks: e.durationTicks,
        degree: vexKeyToDegree(key),
      })
    } else {
      keys = [
        midiToVexKey(
          concertToWrittenMidi(e.concertMidi!, clefFamily, staff.kind),
          preferFlats,
        ),
      ]
    }
    const note = factory.StaveNote({
      keys,
      duration: vexDuration(e.duration.type, isRest),
      dots: e.duration.dots || undefined,
      clef,
      stemDirection: isRest ? undefined : stemUp ? Stem.UP : Stem.DOWN,
      autoStem: false,
    })
    if (showLyrics && e.lyric && !e.tieStop) {
      // Stack per voice under the staff; textLine clears stems above.
      const ann = factory.Annotation({
        text: e.lyric,
        vJustify: 'bottom',
      })
      ann.setFontSize(LYRIC_FONT_PX)
      ann.setTextLine(e.voice === 1 ? LYRIC_TEXT_LINE_V1 : LYRIC_TEXT_LINE_V2)
      note.addModifier(ann, 0)
    }
    notes.push(note)
    placedOut.push({ tick: e.startTick, note, preferAnchor: !isRest })
  }
  return notes
}

function fillMeasureIfEmpty(
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
  const key = pickRestKey({
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
    degree: vexKeyToDegree(key),
  })
  const note = factory.StaveNote({
    keys: [key],
    duration: vexDuration(mapped.type, true),
    dots: mapped.dots || undefined,
    clef,
    autoStem: false,
  })
  placedOut.push({ tick: measureStartTick, note, preferAnchor: false })
  return [note]
}

/** Piecewise-linear tick → x from sorted, unique-tick anchors. */
function buildTickToX(anchors: { tick: number; x: number }[]): (tick: number) => number {
  const pts = anchors
    .slice()
    .sort((a, b) => a.tick - b.tick || a.x - b.x)
    .filter((p, i, arr) => i === 0 || p.tick !== arr[i - 1]!.tick)
  if (!pts.length) return () => 0
  if (pts.length === 1) return () => pts[0]!.x
  return (tick: number) => {
    const t = tick
    if (t <= pts[0]!.tick) return pts[0]!.x
    const last = pts[pts.length - 1]!
    if (t >= last.tick) return last.x
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i]!
      const b = pts[i + 1]!
      if (t <= b.tick) {
        const span = Math.max(1e-6, b.tick - a.tick)
        const frac = (t - a.tick) / span
        return a.x + frac * (b.x - a.x)
      }
    }
    return last.x
  }
}

/**
 * Auto-beam eighths+ and register beams on the Factory render queue.
 * Naked `Beam.generateBeams` attaches beams (suppressing stems) but never draws them.
 */
function beamNotes(factory: Factory, notes: StaveNote[]): void {
  const beamable = notes.filter((n) => {
    if (n.isRest()) return false
    const d = n.getDuration()
    return (
      d === '8' ||
      d === '16' ||
      d === '32' ||
      d.startsWith('8') ||
      d.startsWith('16') ||
      d.startsWith('32')
    )
  })
  if (beamable.length < 2) return
  try {
    const beams = Beam.generateBeams(beamable, { maintainStemDirections: true })
    for (const beam of beams) {
      factory.Beam({ notes: beam.getNotes(), options: { autoStem: false } })
    }
  } catch {
    /* ignore beam failures on mixed groups */
  }
}

/**
 * Render the project as a continuous horizontal VexFlow score into `host`.
 * Clears previous children of `host`.
 */
export async function renderVexSheetScore(opts: {
  host: HTMLElement
  project: TagRollProject
  /** Approximate pixels per quarter — scales measure widths. */
  pxPerBeat: number
  showLyrics?: boolean
}): Promise<VexScoreLayoutResult> {
  await ensureVexFonts()
  const { host, project, pxPerBeat } = opts
  const showLyrics = opts.showLyrics !== false
  host.replaceChildren()

  const assignment = assignSheetStaves(project.parts, project.clefFamily)
  const events = buildSheetRhythm({
    assignment,
    notes: project.notes,
    lengthTicks: project.lengthTicks,
    timeSignature: project.timeSignature,
    ppq: project.ppq || TAG_ROLL_PPQ,
  })

  const ppq = project.ppq || TAG_ROLL_PPQ
  const mLen = measureTicks(project.timeSignature, ppq)
  const lengthTicks = Math.max(mLen, project.lengthTicks)
  const measureCount = Math.max(1, Math.ceil(lengthTicks / mLen))
  const ts = `${project.timeSignature.numerator}/${project.timeSignature.denominator}`

  const staveCount = Math.max(1, assignment.staves.length)
  const staveGap = showLyrics ? SPACE_BETWEEN_STAVES_LYRICS : SPACE_BETWEEN_STAVES
  const systemHeight = SCORE_TOP_PAD + staveCount * (40 + staveGap * 10) + SCORE_BOTTOM_PAD
  const leftPad = SHEET_LEFT_PAD
  const bodyMeasureWidth = sheetMeasureWidthPx(pxPerBeat, project.timeSignature, ppq)
  const firstMeasureWidth = bodyMeasureWidth + FIRST_MEASURE_CLEF_EXTRA_PX
  const totalWidth =
    leftPad +
    firstMeasureWidth +
    Math.max(0, measureCount - 1) * bodyMeasureWidth +
    SHEET_RIGHT_PAD
  const totalHeight = systemHeight

  if (!host.id) host.id = `vex-sheet-${Math.random().toString(36).slice(2, 10)}`
  const factory = new Factory({
    renderer: { elementId: host.id, width: totalWidth, height: totalHeight },
  })

  const measures: VexScoreMeasureGeom[] = []
  /** Top stave per measure — used after draw for note-area bounds. */
  const topStaves: Stave[] = []
  /** Engraved tickables with musical start ticks (for playhead anchoring). */
  const placedByMeasure: PlacedTickable[][] = []
  let x = leftPad

  for (let mi = 0; mi < measureCount; mi++) {
    const startTick = mi * mLen
    const endTick = Math.min(lengthTicks, (mi + 1) * mLen)
    const inMeas = eventsInMeasure(events, startTick, endTick)
    const thisWidth = mi === 0 ? firstMeasureWidth : bodyMeasureWidth
    const system = factory.System({
      x,
      y: SCORE_TOP_PAD,
      width: thisWidth,
      spaceBetweenStaves: staveGap,
    })

    const staveRefs: Stave[] = []
    const placedHere: PlacedTickable[] = []
    for (const staff of assignment.staves) {
      const noteClef = vexNoteClef(staff.clef)
      const voices = []
      const staffPartIds = new Set(staff.voices.map((v) => v.partId))
      const staffEvents = inMeas.filter((e) => staffPartIds.has(e.partId))
      /** Rests placed so far on this staff (later voices dodge earlier ones). */
      const placedRests: RestOccupant[] = []
      for (const slot of staff.voices) {
        const slotEvents = staffEvents.filter((e) => e.partId === slot.partId)
        const exclude = new Set([slot.partId])
        const noteOcc = noteOccupantsFromEvents(
          staffEvents,
          exclude,
          project.clefFamily,
          staff.kind,
          project.preferFlats,
        )
        const restOccupants = [...noteOcc, ...placedRests]
        let notes = buildVoiceNotes(
          factory,
          slotEvents,
          staff,
          project.clefFamily,
          project.preferFlats,
          slot.voice === 1,
          showLyrics,
          restOccupants,
          placedRests,
          placedHere,
        )
        notes = fillMeasureIfEmpty(
          factory,
          notes,
          endTick - startTick,
          startTick,
          ppq,
          noteClef,
          slot.voice === 1,
          [...noteOcc, ...placedRests],
          placedRests,
          placedHere,
        )
        beamNotes(factory, notes)
        const voice = factory
          .Voice({
            time: {
              numBeats: project.timeSignature.numerator,
              beatValue: project.timeSignature.denominator,
            },
          })
          .setMode(Voice.Mode.SOFT)
          .addTickables(notes)
        voices.push(voice)
      }
      if (!voices.length) {
        const notes = fillMeasureIfEmpty(
          factory,
          [],
          endTick - startTick,
          startTick,
          ppq,
          noteClef,
          true,
          [],
          placedRests,
          placedHere,
        )
        voices.push(
          factory
            .Voice({
              time: {
                numBeats: project.timeSignature.numerator,
                beatValue: project.timeSignature.denominator,
              },
            })
            .setMode(Voice.Mode.SOFT)
            .addTickables(notes),
        )
      }

      const stave = system.addStave({
        voices,
        spaceBelow: showLyrics ? LYRIC_STAVE_SPACE_BELOW : 0,
      })
      staveRefs.push(stave)
      if (mi === 0) {
        const c = clefSpec(staff.clef)
        if (c.annotation) stave.addClef(c.clef, undefined, c.annotation)
        else stave.addClef(c.clef)
        stave.addKeySignature(
          vexKeySpec(
            project.tonality,
            project.preferFlats,
            project.tonalityMode ?? 'major',
          ),
        )
        stave.addTimeSignature(ts)
      }
    }

    // System bracket + left bar only at the start of the score — not every measure.
    if (mi === 0 && staveRefs.length >= 2 && assignment.staves[0]?.kind === 'upper') {
      factory.StaveConnector({
        topStave: staveRefs[0]!,
        bottomStave: staveRefs[1]!,
        type: 'bracket',
      })
      factory.StaveConnector({
        topStave: staveRefs[0]!,
        bottomStave: staveRefs[1]!,
        type: 'singleLeft',
      })
    }

    topStaves.push(staveRefs[0]!)
    placedByMeasure.push(placedHere)
    measures.push({
      measureIndex: mi,
      startTick,
      endTick,
      x,
      width: thisWidth,
      // Filled after draw() once VexFlow has laid out the note area.
      noteStartX: x,
      noteEndX: x + thisWidth,
    })
    x += thisWidth
  }

  factory.draw()

  // Map musical time to engraved X: note-area bounds + sounding noteheads.
  type AnchorCand = { tick: number; x: number; weight: number }
  const anchorCands: AnchorCand[] = []
  for (let mi = 0; mi < measures.length; mi++) {
    const m = measures[mi]!
    const stave = topStaves[mi]
    if (stave) {
      try {
        const ns = stave.getNoteStartX()
        const ne = stave.getNoteEndX()
        if (Number.isFinite(ns) && Number.isFinite(ne) && ne > ns) {
          m.noteStartX = ns
          m.noteEndX = ne
        }
      } catch {
        /* keep fallback */
      }
    }
    // Low-weight bounds so real noteheads win on the same tick.
    anchorCands.push({ tick: m.startTick, x: m.noteStartX, weight: 0 })
    anchorCands.push({ tick: m.endTick, x: m.noteEndX, weight: 0 })
    for (const p of placedByMeasure[mi] ?? []) {
      if (!p.preferAnchor) continue
      try {
        const ax = p.note.getAbsoluteX()
        if (Number.isFinite(ax)) {
          anchorCands.push({ tick: p.tick, x: ax, weight: 1 })
        }
      } catch {
        /* tick context missing */
      }
    }
  }

  // One X per tick — prefer sounding-note anchors.
  const byTick = new Map<number, AnchorCand>()
  for (const c of anchorCands) {
    const prev = byTick.get(c.tick)
    if (!prev || c.weight > prev.weight) byTick.set(c.tick, c)
  }
  const tickToXRaw = buildTickToX(
    [...byTick.values()].map((c) => ({ tick: c.tick, x: c.x })),
  )
  const tickToX = (tick: number): number =>
    tickToXRaw(Math.max(0, Math.min(lengthTicks, tick)))

  return {
    width: totalWidth,
    height: totalHeight,
    contentOriginY: SCORE_TOP_PAD,
    contentOriginX: measures[0]?.noteStartX ?? leftPad,
    measures,
    tickToX,
  }
}
