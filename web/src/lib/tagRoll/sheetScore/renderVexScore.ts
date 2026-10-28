/**
 * Render Tag Studio sheet via VexFlow (Bravura) — continuous horizontal systems.
 */
import {
  Beam,
  Factory,
  StaveModifierPosition,
  StaveNote,
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
import { measureTicks } from '../tempoMap'
import { melodyPartAtTick, resolveMelodyPasses } from '../melodyPass'
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
import {
  estimateUnitChordClearancesForPlaces,
  type SheetChordDetectSegment,
} from '../sheetChordMarks'
import { stackSheetSystems } from '../sheetSystemStack'
import { assignSheetStaves } from './assignStaves'
import { sheetEngraveLengthTicks } from './engraveLength'
import { justifySheetSystems } from './justifySheetSystems'
import {
  contentSizedMeasureBodyPx,
  scaledEqualMeasureBodyPx,
} from './measureWidth'
import {
  noteOccupantsFromEvents,
  type RestOccupant,
} from './restPlacement'
import { buildSheetRhythm, type SheetRhythmEvent } from './rhythmLayout'
import { staffCrossoverNoteIds } from './sheetCrossover'
import {
  drawStraightLyricLanes,
  sheetLyricSystemPads,
  staveGapSpaces,
  straightLyricStaveGapExtra,
} from './sheetLyricLanes'
import { type SheetTieAnchor } from './sheetRhythmMarks'
import { clampSheetStemLength } from './sheetStemLength'
import {
  applySvgSizeScale,
  drawCrossoverMarks,
  drawMelodyHandoffLines,
  noteheadPoint,
} from './sheetScoreOverlays'
import type { SheetClefKind } from './types'
import {
  buildVoiceNotes,
  fillMeasureIfEmpty,
  vexNoteClef,
  type PlacedTickable,
} from './sheetVoiceNotes'
import {
  applySheetAccidentals,
  preferFlatsAtTick,
  sheetKeySpecAtTick,
} from './sheetAccidentals'
import { applyOpposingVoiceOffsets } from './sheetNoteCollision'
import { spellWrittenMidi } from './sheetPitchSpelling'
import { attachSheetTuplets } from './sheetTuplets'

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

let fontsKey: string | null = null
let fontsReady: Promise<void> | null = null

export function ensureVexFonts(music = 'Bravura', text = 'Academico'): Promise<void> {
  const key = `${music}|${text}`
  if (fontsReady && fontsKey === key) return fontsReady
  fontsKey = key
  fontsReady = (async () => {
    const { configureSheetFontHost } = await import('../sheetFontAssets')
    configureSheetFontHost()
    // happy-dom / some test envs lack FontFace — still set module fonts.
    if (typeof FontFace !== 'undefined') {
      await VexFlow.loadFonts(music, text)
    }
    VexFlow.setFonts(music, text)
  })()
  return fontsReady
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

/** Gap between wrapped systems in page layout. */
const SYSTEM_GAP_PX = 22
const DEFAULT_LYRIC_FONT_PX = 12
const LYRIC_OFFSET_GAP_SPACES = 0.45
const LYRIC_STAVE_SPACE_BELOW = 4

function eventsInMeasure(
  events: readonly SheetRhythmEvent[],
  start: number,
  end: number,
): SheetRhythmEvent[] {
  return events.filter((e) => e.startTick >= start && e.startTick < end)
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
 * Beam eighths+ using rhythmLayout beamGroupId (beat groups; rests break beams).
 * Falls back to VexFlow generateBeams with rests kept so gaps still break groups.
 */
function beamNotes(
  factory: Factory,
  notes: StaveNote[],
  events: readonly SheetRhythmEvent[],
): void {
  const byGroup = new Map<number, StaveNote[]>()
  for (let i = 0; i < notes.length; i++) {
    const n = notes[i]!
    if (n.isRest()) continue
    const d = n.getDuration()
    const beamable =
      d === '8' ||
      d === '16' ||
      d === '32' ||
      d.startsWith('8') ||
      d.startsWith('16') ||
      d.startsWith('32')
    if (!beamable) continue
    const gid = events[i]?.beamGroupId
    if (gid == null) continue
    const list = byGroup.get(gid) ?? []
    list.push(n)
    byGroup.set(gid, list)
  }
  let drew = false
  for (const group of byGroup.values()) {
    if (group.length < 2) continue
    try {
      factory.Beam({ notes: group, options: { autoStem: false } })
      drew = true
    } catch {
      /* ignore beam failures on mixed groups */
    }
  }
  if (drew) return
  try {
    // Keep rests so generateBeams does not bridge gaps between beamable notes.
    const withRests = notes.filter((n) => {
      if (n.isRest()) return true
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
    if (withRests.filter((n) => !n.isRest()).length < 2) return
    const beams = Beam.generateBeams(withRests, { maintainStemDirections: true })
    for (const beam of beams) {
      factory.Beam({ notes: beam.getNotes(), options: { autoStem: false } })
    }
  } catch {
    /* ignore */
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
  /** Straight per-part lyric lanes (default on when lyrics shown). */
  straightLyrics?: boolean
  /** continuous | page (default continuous). */
  sheetLayout?: TagRollSheetLayout
  /** equal | dynamic measure widths (default equal). */
  measureSizing?: TagRollSheetMeasureSizing
  /** Page layout: stretch each system to the margins (default on). */
  fullJustify?: boolean
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
  /** Mark same-staff crossings (lead>tenor, bass>bari) with × (default on). */
  showCrossoverMarks?: boolean
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
  /** Per-part lyric nudges (textLine units). Missing part visibility = shown. */
  lyricOffsets?: Readonly<Record<string, number>>
  lyricPartVisible?: Readonly<Record<string, boolean>>
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
  /** Stem length multiplier (default 1). */
  stemLength?: number
  /** Part names (default false). */
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
  /** Detected chord segments for sheet chord clearance (viewport / export). */
  chordDetectSegments?: readonly SheetChordDetectSegment[]
  /** Include Sketch+Detected whenever data exists (PDF / print). */
  chordForceInclude?: boolean
}): Promise<VexScoreLayoutResult> {
  const musicId = normalizeSheetMusicFont(opts.musicFont)
  const textId = normalizeSheetTextFont(opts.textFont)
  await ensureVexFonts(vexMusicFontName(musicId), vexTextFontName(textId))
  const { host, project, pxPerBeat } = opts
  const showLyrics = opts.showLyrics !== false
  const straightLyrics = showLyrics && opts.straightLyrics !== false
  const noteColors = opts.noteColors === true
  const showCrossoverMarks = opts.showCrossoverMarks !== false
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
  const lyricPartVisible = opts.lyricPartVisible ?? {}
  const lyricPartOn = (partId: string) => lyricPartVisible[partId] !== false
  const maxLyricOffset = Object.entries(lyricOffsets).reduce((m, [id, v]) => {
    if (!lyricPartOn(id) || typeof v !== 'number') return m
    return Math.max(m, v)
  }, 0)
  const minBarPx = Math.round(SHEET_MEASURE_WIDTH_MIN * (opts.minBarWidth ?? 1))
  const timeFactor = opts.timeFactor ?? 1
  const staffLineWidth = clampSheetFormat(
    opts.staffLineWeight,
    SHEET_STAFF_LINE_MIN,
    SHEET_STAFF_LINE_MAX,
    1,
  )
  const stemLength = clampSheetStemLength(opts.stemLength, 1)
  const showPartNames = opts.showPartNames === true
  const headerBandScreen = Math.max(0, Math.round(opts.headerBandPx ?? 0))
  const sheetLayout: TagRollSheetLayout =
    opts.sheetLayout === 'page' ? 'page' : 'continuous'
  const measureSizing: TagRollSheetMeasureSizing =
    opts.measureSizing === 'dynamic' ? 'dynamic' : 'equal'
  const fullJustify = opts.fullJustify !== false
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

  const ppq = project.ppq || TAG_ROLL_PPQ
  const mLen = measureTicks(project.timeSignature, ppq)
  // Drop trailing empty measures past the last note / mark (keep ≥1 measure).
  const lengthTicks = sheetEngraveLengthTicks(project, mLen)
  const measureCount = Math.max(1, Math.ceil(lengthTicks / mLen))

  const assignment = assignSheetStaves(project.parts, project.clefFamily, {
    melodyPartId: project.view.melodyPartId,
    notes: project.notes,
  })
  const abovePartIds =
    assignment.staves[0]?.voices.filter((v) => v.voice === 1).map((v) => v.partId) ?? []
  const { exprHeadroom, staffTailPad } = sheetLyricSystemPads({
    straightLyrics, lyricFontPx, lyricOffsets, abovePartIds, lyricPartOn,
    topMargin: opts.topMargin, bottomMargin: opts.bottomMargin, stemLength, linePx,
  })
  const scoreTopPad = topPad + exprHeadroom
  const events = buildSheetRhythm({
    assignment,
    notes: project.notes,
    lengthTicks,
    timeSignature: project.timeSignature,
    ppq,
    tuplets: project.tuplets,
    melodyPartAt: (tick) => melodyPartAtTick(project, tick),
  })
  const ts = `${project.timeSignature.numerator}/${project.timeSignature.denominator}`
  const beatsPerMeasure = mLen / ppq

  const staveCount = Math.max(1, assignment.staves.length)
  const staveGap =
    staveGapSpaces(staveGapPref, showLyrics, staveGapFine) +
    (showLyrics ? maxLyricOffset * LYRIC_OFFSET_GAP_SPACES : 0) +
    (straightLyrics ? straightLyricStaveGapExtra(lyricFontPx, linePx, stemLength) : 0)
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

  // Width-wrap into systems first; page breaks come after chord clearance.
  let curX = leftPad
  let systemIndex = 0
  let maxRight = leftPad
  for (let mi = 0; mi < measureCount; mi++) {
    let w = measureBodies[mi]!
    const atSystemStart = curX === leftPad
    if (
      pageMode &&
      !atSystemStart &&
      curX + w + rightPad > contentWidth
    ) {
      systemIndex += 1
      curX = leftPad
      w += clefExtraPx
    } else if (atSystemStart) {
      w += clefExtraPx
    }
    places.push({ mi, x: curX, y: 0, systemIndex, pageIndex: 0, width: w })
    curX += w
    maxRight = Math.max(maxRight, curX)
  }

  if (pageMode) {
    justifySheetSystems(places, {
      enabled: fullJustify,
      leftPad,
      targetInnerWidth: Math.max(1, contentWidth - leftPad - rightPad),
    })
    maxRight = places.reduce((m, p) => Math.max(m, p.x + p.width), leftPad)
  }

  const pageTopPad = (pi: number) =>
    (pi === 0 ? headerBandPx : 0) + scoreTopPad
  stackSheetSystems(places, {
    systemBodyHeight,
    baseSystemGap: systemGapPx,
    chordClearanceBySystem: estimateUnitChordClearancesForPlaces(
      project,
      places,
      {
        measureTicks: mLen,
        lengthTicks,
        sizeScale,
        detectSegments: opts.chordDetectSegments,
        forceInclude: opts.chordForceInclude,
      },
    ),
    existingTopHeadroom: exprHeadroom,
    pageMode,
    pageSystemBudget,
    pageContentTopY: (pi) => pi * (pageH + pageGapPx) + pageTopPad(pi),
    continuousOriginY: headerBandPx + scoreTopPad,
  })

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

  const systemCount = (places[places.length - 1]?.systemIndex ?? 0) + 1
  const yCursor = places.reduce((max, pl) => Math.max(max, pl.y), 0)
  const totalWidth = pageMode ? pageW : Math.ceil(maxRight + rightPad)
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
  /** Open tie starts awaiting a stop (across measures). */
  const openTies = new Map<string, SheetTieAnchor>()
  /** Last key signature drawn on each system (accidentals follow the printed key). */
  const printedKeyBySystem = new Map<number, string>()

  for (const pl of places) {
    const mi = pl.mi
    const startTick = mi * mLen
    const endTick = Math.min(lengthTicks, (mi + 1) * mLen)
    const inMeas = eventsInMeasure(events, startTick, endTick)
    const thisWidth = pl.width
    const musicalKey = sheetKeySpecAtTick(project, startTick)
    const prevPrinted = printedKeyBySystem.get(pl.systemIndex)
    const systemStart = pl.x === leftPad
    const keyChangedMidSystem = !systemStart && prevPrinted != null && prevPrinted !== musicalKey
    // Print key at system start, or mid-system when the marker changes.
    if (systemStart || keyChangedMidSystem || prevPrinted == null) {
      printedKeyBySystem.set(pl.systemIndex, musicalKey)
    }
    const printedKey = printedKeyBySystem.get(pl.systemIndex) ?? musicalKey
    const drawKeySig = systemStart || keyChangedMidSystem
    const system = factory.System({
      x: pl.x,
      y: pl.y,
      width: thisWidth,
      spaceBetweenStaves: staveGap,
    })

    const staveRefs: Stave[] = []
    const placedHere: PlacedTickable[] = []
    const measureBeats = Math.max(
      1,
      Math.round(((endTick - startTick) / ppq) * (project.timeSignature.denominator / 4)),
    )
    for (const staff of assignment.staves) {
      const noteClef = vexNoteClef(staff.clef)
      const voices = []
      const staffPartIds = new Set(staff.voices.map((v) => v.partId))
      const staffEvents = inMeas.filter((e) => staffPartIds.has(e.partId))
      /** Rests placed so far on this staff (later voices dodge earlier ones). */
      const placedRests: RestOccupant[] = []
      const flatsAt = (tick: number) => preferFlatsAtTick(project, tick)
      const spellAt = (writtenMidi: number, tick: number) =>
        spellWrittenMidi(writtenMidi, project, tick, opts.chordDetectSegments)
      const voiceBuilt: {
        slotEvents: SheetRhythmEvent[]
        notes: StaveNote[]
        voiceNum: 1 | 2
      }[] = []
      for (const slot of staff.voices) {
        const slotEvents = staffEvents.filter((e) => e.partId === slot.partId)
        const exclude = new Set([slot.partId])
        const noteOcc = noteOccupantsFromEvents(
          staffEvents, exclude, project.clefFamily, staff.kind, flatsAt(startTick),
        )
        const restOccupants = [...noteOcc, ...placedRests]
        let notes = buildVoiceNotes(
          factory,
          slotEvents,
          staff,
          project.clefFamily,
          flatsAt,
          slot.voice === 1,
          showLyrics,
          straightLyrics,
          restOccupants,
          placedRests,
          placedHere,
          noteColors,
          lyricFontPx,
          lyricOffsets,
          lyricPartOn,
          stemLength,
          slot.voice,
          openTies,
          spellAt,
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
        voiceBuilt.push({ slotEvents, notes, voiceNum: slot.voice })
      }
      const v1 = voiceBuilt.find((v) => v.voiceNum === 1)
      const v2 = voiceBuilt.find((v) => v.voiceNum === 2)
      if (v1 && v2 && v1.slotEvents.length && v2.slotEvents.length) {
        applyOpposingVoiceOffsets({
          v1Events: v1.slotEvents,
          v1Notes: v1.notes,
          v2Events: v2.slotEvents,
          v2Notes: v2.notes,
          clefFamily: project.clefFamily,
          staffKind: staff.kind,
          preferFlats: flatsAt(startTick),
        })
      }
      for (const built of voiceBuilt) {
        beamNotes(factory, built.notes, built.slotEvents)
        attachSheetTuplets(factory, built.notes, built.slotEvents)
        const voice = factory
          .Voice({
            time: {
              numBeats: measureBeats,
              beatValue: project.timeSignature.denominator,
            },
          })
          // SOFT only as fallback when tick sum drifts; prefer exact fill from rhythmLayout.
          .setMode(Voice.Mode.SOFT)
          .addTickables(built.notes)
        voices.push(voice)
      }
      if (!voices.length) {
        const notes = fillMeasureIfEmpty(
          factory, [], endTick - startTick, startTick, ppq, noteClef, true, [], placedRests, placedHere,
        )
        voices.push(
          factory
            .Voice({
              time: {
                numBeats: measureBeats,
                beatValue: project.timeSignature.denominator,
              },
            })
            .setMode(Voice.Mode.SOFT)
            .addTickables(notes),
        )
      }
      applySheetAccidentals(voices, printedKey)

      const stave = system.addStave({
        voices,
        spaceBelow: showLyrics
          ? LYRIC_STAVE_SPACE_BELOW + (straightLyrics ? 1 : 0)
          : 0,
      })
      stave.setStyle({ ...stave.getStyle(), lineWidth: staffLineWidth, strokeStyle: '#000000' })
      // Part names once, on the first system only. StaveText LEFT already sits
      // left of the clef (staveX − width − 24); a further negative shiftX was
      // pushing labels off the left edge of the SVG.
      if (showPartNames && pl.systemIndex === 0 && systemStart) {
        const partLabel = staff.labels.filter(Boolean).join(' · ')
        if (partLabel) {
          stave.setStaveText(partLabel, StaveModifierPosition.LEFT, { shiftX: 4 })
        }
      }
      staveRefs.push(stave)
      if (systemStart) {
        const c = clefSpec(staff.clef)
        if (c.annotation) stave.addClef(c.clef, undefined, c.annotation)
        else stave.addClef(c.clef)
        stave.addKeySignature(printedKey)
        if (mi === 0) stave.addTimeSignature(ts)
      } else if (drawKeySig) {
        stave.addKeySignature(printedKey)
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
  const placedFlat = placedByMeasure.flat()
  // Lyrics (white boxes under staff lines) then raise notes; overlays stay on top.
  if (straightLyrics) {
    drawStraightLyricLanes(host, placedFlat, {
      fontPx: lyricFontPx, linePx, stemLength, fontFamily: vexTextFontName(textId),
      offsets: lyricOffsets, partVisible: lyricPartOn,
    })
  }
  drawMelodyHandoffLines(host, placedFlat, resolveMelodyPasses(project))
  if (showCrossoverMarks) {
    drawCrossoverMarks(host, placedFlat, staffCrossoverNoteIds(project.notes, project.parts))
  }
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
