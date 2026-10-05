/**
 * Render Tag Studio sheet via VexFlow (Bravura) — continuous horizontal systems.
 */
import {
  Beam,
  Factory,
  StaveModifierPosition,
  StaveNote,
  Stem,
  Voice,
  VexFlow,
  type Stave,
} from 'vexflow'
import {
  normalizeSheetMusicFont,
  normalizeSheetTextFont,
  vexMusicFontName,
  vexTextFontName,
} from '../sheetFonts'
import { SHEET_STAFF_LINE_MAX, SHEET_STAFF_LINE_MIN, clampSheetFormat } from '../sheetFormat'
import {
  SHEET_PAGE_GAP_PX,
  sheetPageHeightPx,
  sheetPageWidthPx,
} from '../sheetPage'
import { midiToMusicXmlPitch } from '../musicxmlExport'
import { measureTicks } from '../tempoMap'
import type {
  TagRollProject,
  TagRollSheetLayout,
  TagRollSheetMeasureSizing,
  TagRollSheetMusicFont,
  TagRollSheetStaveGap,
  TagRollSheetTextFont,
} from '../types'
import { TAG_ROLL_PPQ } from '../types'
import {
  SHEET_FIRST_MEASURE_CLEF_EXTRA_PX,
  SHEET_MEASURE_WIDTH_MIN,
  sheetMeasureWidthPx,
} from '../zoomFill'
import { assignSheetStaves } from './assignStaves'
import { mapTicksToDuration, type NoteDurationType } from './durationMap'
import {
  contentSizedMeasureBodyPx,
  scaledEqualMeasureBodyPx,
} from './measureWidth'
import {
  melodyRoleBorderColor,
  MELODY_PART_BORDER_COLOR,
} from '../../../domain/arranging/melodyRoleLabels'
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
  /** Top of this measure's system (0 for single-system layouts). */
  y: number
  width: number
  systemIndex: number
  /** Left edge of the engraved note area (after clef / time / key). */
  noteStartX: number
  /** Right edge of the engraved note area (before barline padding). */
  noteEndX: number
}

export type VexScorePageGeom = {
  /** 0-based page index. */
  index: number
  /** Top Y of this page frame in the canvas. */
  y: number
  /** Page frame width (px). */
  width: number
  /** Page frame height (px). */
  height: number
}

export type VexScoreLayoutResult = {
  width: number
  height: number
  /** Y offset where the top staff begins (below expression band). */
  contentOriginY: number
  /** Content x of tick 0 (after left padding). */
  contentOriginX: number
  /** Approximate height of one system row (for page playhead). */
  systemBodyHeight: number
  /**
   * Unified Size factor applied as true SVG scale (notes, stems, barlines, clefs…).
   * HTML overlays (title, expressions) should use the same factor.
   */
  sizeScale: number
  /** Applied page/strip margins in px (authoritative inch→dpi conversion). */
  marginsPx: {
    left: number
    right: number
    top: number
    bottom: number
  }
  measures: VexScoreMeasureGeom[]
  /** Page frames (empty when continuous). */
  pages: VexScorePageGeom[]
  /** Map musical tick → x in the rendered SVG content. */
  tickToX: (tick: number) => number
  /** Map musical tick → content point (page layout uses y). */
  tickToPoint: (tick: number) => { x: number; y: number }
  /** Inverse hit-test for playhead scrub. */
  pointToTick: (x: number, y: number) => number
}

/** Display-scale the VexFlow SVG so glyphs track stave geometry (viewBox zoom). */
function applySvgSizeScale(
  host: HTMLElement,
  unitWidth: number,
  unitHeight: number,
  sizeScale: number,
): void {
  const svg = host.querySelector('svg')
  if (!svg) return
  const w = Math.max(1, unitWidth)
  const h = Math.max(1, unitHeight)
  svg.setAttribute('viewBox', `0 0 ${w} ${h}`)
  svg.setAttribute('width', String(Math.max(1, Math.round(w * sizeScale))))
  svg.setAttribute('height', String(Math.max(1, Math.round(h * sizeScale))))
  svg.style.width = `${Math.max(1, Math.round(w * sizeScale))}px`
  svg.style.height = `${Math.max(1, Math.round(h * sizeScale))}px`
  svg.style.display = 'block'
}

let fontsKey: string | null = null
let fontsReady: Promise<void> | null = null

export function ensureVexFonts(music = 'Bravura', text = 'Academico'): Promise<void> {
  const key = `${music}|${text}`
  if (fontsReady && fontsKey === key) return fontsReady
  fontsKey = key
  fontsReady = (async () => {
    // happy-dom / some test envs lack FontFace — still set module fonts.
    if (typeof FontFace !== 'undefined') {
      await VexFlow.loadFonts(music, text)
    }
    VexFlow.setFonts(music, text)
  })()
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

/** Top-to-top stave spacing in staff-spaces (× stave.space px). */
const SPACE_BETWEEN_STAVES_TIGHT = 5
const SPACE_BETWEEN_STAVES = 6.5
const SPACE_BETWEEN_STAVES_WIDE = 9
/** Extra room between grand-staff staves when lyrics are on. */
const SPACE_BETWEEN_STAVES_LYRICS_TIGHT = 8.5
const SPACE_BETWEEN_STAVES_LYRICS = 11
const SPACE_BETWEEN_STAVES_LYRICS_WIDE = 15
/** Gap between wrapped systems in page layout. */
const SYSTEM_GAP_PX = 22

function staveGapSpaces(
  gap: TagRollSheetStaveGap,
  showLyrics: boolean,
  fine = 1,
): number {
  let base: number
  if (showLyrics) {
    if (gap === 'tight') base = SPACE_BETWEEN_STAVES_LYRICS_TIGHT
    else if (gap === 'wide') base = SPACE_BETWEEN_STAVES_LYRICS_WIDE
    else base = SPACE_BETWEEN_STAVES_LYRICS
  } else if (gap === 'tight') base = SPACE_BETWEEN_STAVES_TIGHT
  else if (gap === 'wide') base = SPACE_BETWEEN_STAVES_WIDE
  else base = SPACE_BETWEEN_STAVES
  return Math.max(3.5, Math.round(base * fine * 10) / 10)
}

const DEFAULT_LYRIC_FONT_PX = 12
/** Push lyric lines below stems / noteheads (VexFlow textLine units). */
const LYRIC_TEXT_LINE_V1 = 2
const LYRIC_TEXT_LINE_V2 = 3
/** Extra stave-gap spaces per unit of lyric line offset above the default. */
const LYRIC_OFFSET_GAP_SPACES = 0.45
const LYRIC_STAVE_SPACE_BELOW = 4

/** Base lyric textLine for stem-up (v1) / stem-down (v2), plus user nudge. */
export function lyricTextLineForVoice(voice: 1 | 2, offset = 0): number {
  const base = voice === 1 ? LYRIC_TEXT_LINE_V1 : LYRIC_TEXT_LINE_V2
  return Math.max(0, Math.round((base + offset) * 10) / 10)
}
/** Dark-red outline for the project melody voice (matches piano-roll Roles chrome). */
const MELODY_NOTE_STROKE = MELODY_PART_BORDER_COLOR

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
  noteColors: boolean,
  lyricFontPx: number,
  lyricOffsets: Readonly<Record<string, number>>,
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
    if (noteColors && !isRest && e.isMelody) {
      const roleStroke =
        e.melodyRole === 'pmn' || e.melodyRole === 'smn'
          ? melodyRoleBorderColor(e.melodyRole)
          : null
      // Strong/Passing = role-colored outline; unmarked melody stays the Lead cue.
      note.setStyle({
        strokeStyle: roleStroke ?? MELODY_NOTE_STROKE,
      })
    }
    if (showLyrics && e.lyric && !e.tieStop) {
      // Stack per voice under the staff; textLine clears stems above.
      const ann = factory.Annotation({
        text: e.lyric,
        vJustify: 'bottom',
      })
      ann.setFontSize(lyricFontPx)
      ann.setTextLine(
        lyricTextLineForVoice(e.voice, lyricOffsets[e.partId] ?? 0),
      )
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
 * Render the project as a VexFlow score into `host`.
 * Clears previous children of `host`.
 */
export async function renderVexSheetScore(opts: {
  host: HTMLElement
  project: TagRollProject
  /** Approximate pixels per quarter — scales measure widths. */
  pxPerBeat: number
  showLyrics?: boolean
  /** continuous | page (default continuous). */
  sheetLayout?: TagRollSheetLayout
  /** equal | dynamic measure widths (default equal). */
  measureSizing?: TagRollSheetMeasureSizing
  /** Page width in inches (page layout). */
  pageWidthIn?: number
  /** Page height in inches (page layout). */
  pageHeightIn?: number
  /** CSS px per inch for page frames (default 96). */
  pageDpi?: number
  /** @deprecated Prefer pageWidthIn — kept for tests that pass viewportWidth. */
  viewportWidth?: number
  /** Outline melody / roles (default true). */
  noteColors?: boolean
  /** Grand-staff spacing (default normal). */
  staveGap?: TagRollSheetStaveGap
  /** Global measure-width multiplier (default 1). */
  measureScale?: number
  /** Per-onset spacing for dynamic sizing (default 1). */
  noteSpacing?: number
  /** Equal sizing: beat-proportional width stretch. */
  beatStretch?: number
  /** Fine multiplier on stave gap preset. */
  staveGapFine?: number
  /** Page layout: system gap multiplier. */
  systemGap?: number
  /** Expression band above staves (legacy multiplier; prefer marginTopIn). */
  topMargin?: number
  /** Lyric font size (px). */
  lyricSize?: number
  /** Per-part lyric line nudges (VexFlow textLine units; 0 = default). */
  lyricOffsets?: Readonly<Record<string, number>>
  /** @deprecated Prefer marginLeftIn / marginRightIn. */
  paddingScale?: number
  /** Minimum measure width floor multiplier. */
  minBarWidth?: number
  /** Clef / key / time gutter multiplier. */
  clefGutter?: number
  /** Equal sizing time→width multiplier. */
  timeFactor?: number
  /** @deprecated Prefer marginBottomIn. */
  bottomMargin?: number
  musicFont?: TagRollSheetMusicFont
  textFont?: TagRollSheetTextFont
  /** Staff line thickness multiplier (default 1). */
  staffLineWeight?: number
  /** Part names at system starts (default false). */
  showPartNames?: boolean
  /**
   * Extra top band on page 1 for title / credits HTML.
   * Systems begin below this so metadata sits on the page, not above it.
   */
  headerBandPx?: number
  /** Margins in inches (inside page / around continuous strip). */
  marginLeftIn?: number
  marginRightIn?: number
  marginTopIn?: number
  marginBottomIn?: number
  /** Music notation scale (staff line spacing / glyphs). */
  engravingScale?: number
  /** Overall score content scale inside margins. */
  scoreScale?: number
}): Promise<VexScoreLayoutResult> {
  const musicId = normalizeSheetMusicFont(opts.musicFont)
  const textId = normalizeSheetTextFont(opts.textFont)
  await ensureVexFonts(vexMusicFontName(musicId), vexTextFontName(textId))
  const { host, project, pxPerBeat } = opts
  const showLyrics = opts.showLyrics !== false
  const noteColors = opts.noteColors === true
  const staveGapPref: TagRollSheetStaveGap =
    opts.staveGap === 'tight' || opts.staveGap === 'wide' ? opts.staveGap : 'normal'
  const measureScale = opts.measureScale ?? 1
  const noteSpacing = opts.noteSpacing ?? 1
  const beatStretch = opts.beatStretch ?? 1
  const staveGapFine = opts.staveGapFine ?? 1
  const systemGapScale = opts.systemGap ?? 1
  // One proportional Size — store keeps Score + Notation locked.
  // Layout + VexFlow draw in unit engraving space; SVG viewBox applies true scale
  // so noteheads/clefs/barlines/stems grow with staves (not just line spacing).
  const sizeScale = Math.max(
    0.4,
    opts.scoreScale ?? opts.engravingScale ?? 1,
  )
  const lyricFontPx = Math.round(opts.lyricSize ?? DEFAULT_LYRIC_FONT_PX)
  const lyricOffsets = opts.lyricOffsets ?? {}
  const maxLyricOffset = Object.values(lyricOffsets).reduce(
    (m, v) => Math.max(m, typeof v === 'number' ? v : 0),
    0,
  )
  const minBarPx = Math.round(SHEET_MEASURE_WIDTH_MIN * (opts.minBarWidth ?? 1))
  const timeFactor = opts.timeFactor ?? 1
  const staffLineWidth = clampSheetFormat(
    opts.staffLineWeight,
    SHEET_STAFF_LINE_MIN,
    SHEET_STAFF_LINE_MAX,
    1,
  )
  const showPartNames = opts.showPartNames === true
  const headerBandScreen = Math.max(0, Math.round(opts.headerBandPx ?? 0))
  const sheetLayout: TagRollSheetLayout =
    opts.sheetLayout === 'page' ? 'page' : 'continuous'
  const measureSizing: TagRollSheetMeasureSizing =
    opts.measureSizing === 'dynamic' ? 'dynamic' : 'equal'
  const pageDpi = opts.pageDpi ?? 96
  const pageWScreen = sheetPageWidthPx(opts.pageWidthIn ?? 8.5, pageDpi)
  const pageHScreen = sheetPageHeightPx(opts.pageHeightIn ?? 11, pageDpi)
  // Unit-space page / margins: inch margins stay fixed on screen after viewBox scale.
  const pageW = pageWScreen / sizeScale
  const pageH = pageHScreen / sizeScale
  const headerBandPx = headerBandScreen / sizeScale
  /** Staff-line distance in unit px — VexFlow default; display scale via viewBox. */
  const linePx = 10
  const inchesToPxScreen = (inches: number) => Math.max(0, Math.round(inches * pageDpi))
  const inchesToPx = (inches: number) => inchesToPxScreen(inches) / sizeScale
  // Extra gutter so StaveText LEFT part names are not clipped into the margin.
  const partNameGutter = showPartNames ? 78 : 0
  const leftPad = inchesToPx(opts.marginLeftIn ?? 0.3) + partNameGutter
  const rightPad = inchesToPx(opts.marginRightIn ?? 0.3)
  const topPad = inchesToPx(opts.marginTopIn ?? 0.3)
  const bottomPad = inchesToPx(opts.marginBottomIn ?? 0.3)
  // Expression headroom / below-staff breathing inside the system.
  const exprHeadroom = Math.round(8 * (opts.topMargin ?? 1))
  const staffTailPad = Math.round(10 * (opts.bottomMargin ?? 1))
  const scoreTopPad = topPad + exprHeadroom
  const clefExtraPx = Math.round(
    SHEET_FIRST_MEASURE_CLEF_EXTRA_PX * (opts.clefGutter ?? 1),
  )
  // Keep inter-page gap constant in screen px.
  const systemGapPx = Math.round(SYSTEM_GAP_PX * systemGapScale)
  const pageGapPx = SHEET_PAGE_GAP_PX / sizeScale
  // Tests may pass viewportWidth as an override for the line budget (screen px).
  const lineBudgetOverride =
    typeof opts.viewportWidth === 'number' && opts.viewportWidth > 0
      ? opts.viewportWidth / sizeScale
      : null
  host.replaceChildren()

  const assignment = assignSheetStaves(project.parts, project.clefFamily, {
    melodyPartId: project.view.melodyPartId,
    notes: project.notes,
  })
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
  const beatsPerMeasure = mLen / ppq

  const staveCount = Math.max(1, assignment.staves.length)
  const staveGap =
    staveGapSpaces(staveGapPref, showLyrics, staveGapFine) +
    (showLyrics ? maxLyricOffset * LYRIC_OFFSET_GAP_SPACES : 0)
  // Staff height ≈ 4 line-gaps; staveGap is in staff-spaces between staves.
  // Page/strip bottom margin is reserved separately — not inside each system.
  const systemBodyHeight =
    staveCount * (4 * linePx + staveGap * linePx) + staffTailPad
  const equalBody = scaledEqualMeasureBodyPx(
    sheetMeasureWidthPx(pxPerBeat, project.timeSignature, ppq) * timeFactor * beatStretch,
    measureScale,
    minBarPx,
  )

  /** Base body widths (no clef gutter) — clef extra applied at system starts. */
  const measureBodies: number[] = []
  for (let mi = 0; mi < measureCount; mi++) {
    const startTick = mi * mLen
    const endTick = Math.min(lengthTicks, (mi + 1) * mLen)
    const inMeas = eventsInMeasure(events, startTick, endTick)
    let body = equalBody
    if (measureSizing === 'dynamic') {
      const onsetCount = new Set(
        inMeas.filter((e) => e.concertMidi != null).map((e) => e.startTick),
      ).size
      body = contentSizedMeasureBodyPx({
        onsetCount,
        beatsInMeasure: (endTick - startTick) / ppq || beatsPerMeasure,
        pxPerBeat,
        equalReferencePx: equalBody,
        measureScale,
        noteSpacing,
        minMeasureWidth: minBarPx,
      })
    }
    measureBodies.push(body)
  }

  type Place = {
    mi: number
    x: number
    y: number
    systemIndex: number
    pageIndex: number
    width: number
  }
  const places: Place[] = []
  const pageMode = sheetLayout === 'page'
  const contentWidth = pageMode
    ? Math.max(
        measureBodies[0]! + clefExtraPx + leftPad + rightPad,
        lineBudgetOverride ?? pageW,
      )
    : Number.POSITIVE_INFINITY
  /** Usable height for systems on a page (after title band + top/bottom margins). */
  const pageSystemBudget = (pi: number) => {
    if (!pageMode) return Number.POSITIVE_INFINITY
    const header = pi === 0 ? headerBandPx : 0
    return Math.max(
      systemBodyHeight,
      pageH - header - scoreTopPad - bottomPad,
    )
  }

  let curX = leftPad
  let systemIndex = 0
  let pageIndex = 0
  let systemsOnPage = 0
  let maxRight = leftPad
  for (let mi = 0; mi < measureCount; mi++) {
    let w = measureBodies[mi]!
    const atSystemStart = curX === leftPad
    if (
      pageMode &&
      !atSystemStart &&
      curX + w + rightPad > contentWidth
    ) {
      // New system — maybe also a new page if height is exhausted.
      const nextSystems = systemsOnPage + 1
      const usedH =
        nextSystems * systemBodyHeight +
        Math.max(0, nextSystems - 1) * systemGapPx
      if (usedH > pageSystemBudget(pageIndex) && systemsOnPage > 0) {
        pageIndex += 1
        systemsOnPage = 0
      }
      systemIndex += 1
      systemsOnPage += 1
      curX = leftPad
      w += clefExtraPx
    } else if (atSystemStart) {
      w += clefExtraPx
      if (systemsOnPage === 0) systemsOnPage = 1
    }
    places.push({ mi, x: curX, y: 0, systemIndex, pageIndex, width: w })
    curX += w
    maxRight = Math.max(maxRight, curX)
  }

  // Y: stack systems; insert page gaps between pages; reserve title band on page 0.
  const pageCount = (places[places.length - 1]?.pageIndex ?? 0) + 1
  const pages: VexScorePageGeom[] = []
  if (pageMode) {
    for (let pi = 0; pi < pageCount; pi++) {
      pages.push({
        index: pi,
        y: pi * (pageH + pageGapPx),
        width: pageW,
        height: pageH,
      })
    }
  }

  const pageTopPad = (pi: number) =>
    (pi === 0 ? headerBandPx : 0) + scoreTopPad

  let yCursor = pageMode ? pages[0]!.y + pageTopPad(0) : headerBandPx + scoreTopPad
  let prevSi = -1
  let prevPage = 0
  for (const pl of places) {
    if (pl.systemIndex !== prevSi) {
      if (prevSi >= 0) {
        if (pl.pageIndex !== prevPage) {
          yCursor = pages[pl.pageIndex]!.y + pageTopPad(pl.pageIndex)
        } else {
          yCursor += systemBodyHeight + systemGapPx
        }
      }
      prevSi = pl.systemIndex
      prevPage = pl.pageIndex
    }
    pl.y = yCursor
  }
  const systemCount = (places[places.length - 1]?.systemIndex ?? 0) + 1
  const totalWidth = pageMode
    ? pageW
    : Math.ceil(maxRight + rightPad)
  const totalHeight = pageMode
    ? Math.ceil(pages[pageCount - 1]!.y + pageH)
    : Math.ceil(yCursor + systemBodyHeight + bottomPad)

  if (!host.id) host.id = `vex-sheet-${Math.random().toString(36).slice(2, 10)}`
  const factory = new Factory({
    renderer: { elementId: host.id, width: totalWidth, height: totalHeight },
    stave: { space: linePx },
  })

  const measures: VexScoreMeasureGeom[] = []
  /** Top stave per measure — used after draw for note-area bounds. */
  const topStaves: Stave[] = []
  /** Engraved tickables with musical start ticks (for playhead anchoring). */
  const placedByMeasure: PlacedTickable[][] = []

  for (const pl of places) {
    const mi = pl.mi
    const startTick = mi * mLen
    const endTick = Math.min(lengthTicks, (mi + 1) * mLen)
    const inMeas = eventsInMeasure(events, startTick, endTick)
    const thisWidth = pl.width
    const system = factory.System({
      x: pl.x,
      y: pl.y,
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
          noteColors,
          lyricFontPx,
          lyricOffsets,
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
      stave.setStyle({ ...stave.getStyle(), lineWidth: staffLineWidth, strokeStyle: '#000000' })
      if (showPartNames && pl.x === leftPad) {
        const partLabel = staff.labels.filter(Boolean).join(' · ')
        if (partLabel) {
          // Sit in the reserved part-name gutter (left of clef), not into the page edge.
          stave.setStaveText(partLabel, StaveModifierPosition.LEFT, {
            shiftX: -Math.max(8, partNameGutter - 10),
          })
        }
      }
      staveRefs.push(stave)
      if (pl.x === leftPad) {
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
        if (mi === 0) stave.addTimeSignature(ts)
      }
    }

    // System bracket + left bar at each system start.
    if (
      pl.x === leftPad &&
      staveRefs.length >= 2 &&
      assignment.staves[0]?.kind === 'upper'
    ) {
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
      x: pl.x,
      y: pl.y,
      systemIndex: pl.systemIndex,
      width: thisWidth,
      // Filled after draw() once VexFlow has laid out the note area.
      noteStartX: pl.x,
      noteEndX: pl.x + thisWidth,
    })
  }

  factory.draw()
  applySvgSizeScale(host, totalWidth, totalHeight, sizeScale)

  const sx = (n: number) => n * sizeScale

  // Map musical time to engraved X: note-area bounds + sounding noteheads (unit space).
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

  // Promote unit-space geometry + anchors to screen px (matches SVG display scale).
  for (const m of measures) {
    m.x = sx(m.x)
    m.y = sx(m.y)
    m.width = sx(m.width)
    m.noteStartX = sx(m.noteStartX)
    m.noteEndX = sx(m.noteEndX)
  }
  for (const pg of pages) {
    pg.y = sx(pg.y)
    pg.width = sx(pg.width)
    pg.height = sx(pg.height)
  }
  for (const c of anchorCands) c.x = sx(c.x)

  // One X per tick — prefer sounding-note anchors (screen space).
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

  const measureAtTick = (tick: number): VexScoreMeasureGeom => {
    const t = Math.max(0, Math.min(lengthTicks, Math.floor(tick)))
    for (let i = 0; i < measures.length; i++) {
      const m = measures[i]!
      if (t < m.endTick || i === measures.length - 1) return m
    }
    return measures[0]!
  }

  /** Map tick → x within one system row (page wrap resets x each line). */
  const tickToXInSystem = (systemIndex: number, tick: number): number => {
    const row = measures.filter((m) => m.systemIndex === systemIndex)
    if (!row.length) return tickToX(tick)
    const rowStart = row[0]!.startTick
    const rowEnd = row[row.length - 1]!.endTick
    const rowLeft = Math.min(...row.map((m) => m.x))
    const rowRight = Math.max(...row.map((m) => m.x + m.width))
    const seen = new Map<number, { x: number; weight: number }>()
    const consider = (t: number, ax: number, weight: number) => {
      const prev = seen.get(t)
      if (!prev || weight > prev.weight || (weight === prev.weight && ax < prev.x)) {
        seen.set(t, { x: ax, weight })
      }
    }
    for (const m of row) {
      consider(m.startTick, m.noteStartX, 0)
      consider(m.endTick, m.noteEndX, 0)
    }
    // Noteheads at the exclusive row end belong to the *next* system. Including
    // them here interpolates X backwards along the current line (CR before LF).
    for (const c of anchorCands) {
      if (c.weight < 1) continue
      if (c.tick < rowStart || c.tick >= rowEnd) continue
      if (c.x < rowLeft - 4 || c.x > rowRight + 4) continue
      consider(c.tick, c.x, c.weight)
    }
    const map = buildTickToX(
      [...seen.entries()].map(([t, v]) => ({ tick: t, x: v.x })),
    )
    // Clamp to the half-open row so the exclusive end uses noteEndX, not the
    // next system's first-note X.
    const tClamp = Math.max(rowStart, Math.min(rowEnd - 1e-6, tick))
    return map(tClamp)
  }

  const tickToPoint = (tick: number): { x: number; y: number } => {
    const m = measureAtTick(tick)
    return { x: tickToXInSystem(m.systemIndex, tick), y: m.y }
  }

  const systemBodyHeightScreen = sx(systemBodyHeight)

  const pointToTick = (px: number, py: number): number => {
    let bestSi = 0
    let bestDy = Infinity
    for (let si = 0; si < systemCount; si++) {
      const row = measures.find((m) => m.systemIndex === si)
      if (!row) continue
      const mid = row.y + systemBodyHeightScreen / 2
      const dy = Math.abs(py - mid)
      if (dy < bestDy) {
        bestDy = dy
        bestSi = si
      }
    }
    const row = measures.filter((m) => m.systemIndex === bestSi)
    if (!row.length) return 0
    type Pt = { tick: number; x: number }
    const pts: Pt[] = []
    const seen = new Map<number, { x: number; weight: number }>()
    const consider = (tick: number, ax: number, weight: number) => {
      const prev = seen.get(tick)
      if (!prev || weight > prev.weight || (weight === prev.weight && ax < prev.x)) {
        seen.set(tick, { x: ax, weight })
      }
    }
    for (const m of row) {
      consider(m.startTick, m.noteStartX, 0)
      consider(m.endTick, m.noteEndX, 0)
    }
    const rowStart = row[0]!.startTick
    const rowEnd = row[row.length - 1]!.endTick
    const rowLeft = Math.min(...row.map((m) => m.x))
    const rowRight = Math.max(...row.map((m) => m.x + m.width))
    for (const c of anchorCands) {
      if (c.weight < 1) continue
      if (c.tick < rowStart || c.tick >= rowEnd) continue
      if (c.x < rowLeft - 4 || c.x > rowRight + 4) continue
      consider(c.tick, c.x, c.weight)
    }
    for (const [tick, v] of seen) pts.push({ tick, x: v.x })
    pts.sort((a, b) => (a.x !== b.x ? a.x - b.x : a.tick - b.tick))
    if (!pts.length) return rowStart
    if (px <= pts[0]!.x) return pts[0]!.tick
    if (px >= pts[pts.length - 1]!.x) return pts[pts.length - 1]!.tick
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i]!
      const b = pts[i + 1]!
      if (px >= a.x && px <= b.x) {
        if (b.x === a.x) return a.tick
        const u = (px - a.x) / (b.x - a.x)
        return Math.round(a.tick + u * (b.tick - a.tick))
      }
    }
    return pts[pts.length - 1]!.tick
  }

  return {
    width: sx(totalWidth),
    height: sx(totalHeight),
    contentOriginY: sx((pageMode ? 0 : headerBandPx) + scoreTopPad),
    contentOriginX: measures[0]?.noteStartX ?? sx(leftPad),
    systemBodyHeight: systemBodyHeightScreen,
    sizeScale,
    marginsPx: {
      left: sx(leftPad),
      right: sx(rightPad),
      top: sx(topPad),
      bottom: sx(bottomPad),
    },
    measures,
    pages,
    tickToX,
    tickToPoint,
    pointToTick,
  }
}
