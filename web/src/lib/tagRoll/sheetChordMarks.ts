/**
 * Chord label boxes above the staff in Tag Studio sheet view / export / print.
 */
import type { VexScoreLayoutResult } from './sheetScore/renderVexScore'
import { sketchLabel, sketchRomanDisplay } from './harmonySketch'
import type { TagRollProject, TagRollSheetChordMarkStyle } from './types'

export type SheetChordMarkVariant = 'sketch' | 'detected'
export type SheetChordLabelMode = 'name' | 'roman' | 'both'
export type SheetChordMarkStyle = TagRollSheetChordMarkStyle

export type SheetChordMarkSpan = {
  id: string
  startTick: number
  endTick: number
  label: string
  variant: SheetChordMarkVariant
  /** Stack row when multiple lanes show (0 = closest to staff). */
  row?: number
}

export type SheetChordMarkBox = {
  id: string
  left: number
  top: number
  width: number
  label: string
  variant: SheetChordMarkVariant
  /** Stack row when sketch + detected both show (0 = closer to staff). */
  row: number
  /** Chrome: off (text only) | span (duration) | boxed (tight lead-sheet). */
  markStyle: SheetChordMarkStyle
  /** System this mark sits above (for clearance / stacking). */
  systemIndex: number
}

/** Minimal Detected segment fields needed for sheet chord overlays. */
export type SheetChordDetectSegment = {
  id: string
  startTick: number
  endTick: number
  rootPc?: number | null
  displayName?: string
  name?: string
  displayRoman?: string
  roman?: string
}

const MIN_BOX_W = 22
/** Floor for lead-sheet boxed marks (single-char “I” still needs room). */
const MIN_BOXED_W = 18
const SVG_NS = 'http://www.w3.org/2000/svg'

export type CollectSheetChordMarkOpts = {
  /**
   * When true (PDF / image / print), include Sketch + Detected whenever data exists.
   * Screen viewport omits this and honors Format toggles only.
   */
  forceInclude?: boolean
}

export function normalizeSheetChordLabelMode(v: unknown): SheetChordLabelMode {
  return v === 'name' || v === 'roman' || v === 'both' ? v : 'both'
}

/** Build the visible sheet label from absolute name + roman. */
export function formatSheetChordLabel(
  name: string,
  roman: string,
  mode: SheetChordLabelMode,
): string {
  const n = name.trim()
  const r = roman.trim()
  if (mode === 'name') return n || r
  if (mode === 'roman') return r || n
  if (n && r && n !== r) return `${n} (${r})`
  return n || r
}

/**
 * Collect Sketch / Detected chord spans using the same rules as the sheet viewport.
 */
export function collectSheetChordMarkSpans(
  project: TagRollProject,
  detectSegments?: readonly SheetChordDetectSegment[],
  opts?: CollectSheetChordMarkOpts,
): SheetChordMarkSpan[] {
  const force = opts?.forceInclude === true
  const wantSketch = force || project.view.sheetShowSketchChords === true
  const wantDetected = force || project.view.sheetShowDetectedChords === true
  if (!wantSketch && !wantDetected) return []

  const preferFlats = project.preferFlats
  const tonality = project.tonality
  const mode = project.tonalityMode ?? 'major'
  const labelMode = normalizeSheetChordLabelMode(project.view.sheetChordLabelMode)
  const sketch = project.harmonySketch ?? []

  const sketchSpans: SheetChordMarkSpan[] = []
  const detectedSpans: SheetChordMarkSpan[] = []

  if (wantSketch) {
    for (let i = 0; i < sketch.length; i++) {
      const span = sketch[i]!
      if (!span.locked) continue
      const next = sketch[i + 1]
      const name = sketchLabel(span, preferFlats, tonality, mode)
      const roman = sketchRomanDisplay(span, tonality, mode, next?.rootPc ?? null)
      const label = formatSheetChordLabel(name, roman, labelMode)
      if (!label) continue
      sketchSpans.push({
        id: span.id,
        startTick: span.startTick,
        endTick: span.endTick,
        label,
        variant: 'sketch',
        row: 0, // fixed below once we know both lanes have content
      })
    }
  }
  if (wantDetected) {
    for (const seg of detectSegments ?? []) {
      if (seg.rootPc == null) continue
      const name = (seg.displayName || seg.name || '').trim()
      const roman = (seg.displayRoman || seg.roman || '').trim()
      const label = formatSheetChordLabel(name, roman, labelMode)
      if (!label) continue
      detectedSpans.push({
        id: seg.id,
        startTick: seg.startTick,
        endTick: seg.endTick,
        label,
        variant: 'detected',
        row: 0,
      })
    }
  }

  // Stack only when both lanes actually contribute — avoids floating Sketch up
  // on export when Detected is empty.
  const sketchRow = sketchSpans.length && detectedSpans.length ? 1 : 0
  for (const s of sketchSpans) s.row = sketchRow
  return [...sketchSpans, ...detectedSpans]
}

export function sheetChordMarkLayoutOpts(project: TagRollProject): {
  boxHeight: number
  gapAboveStaff: number
  markStyle: SheetChordMarkStyle
  fontSize: number
} {
  const s = Math.max(0.55, project.view.sheetScoreScale ?? 1)
  // Tall enough for padded boxed labels (border + line-height) without clipping.
  const boxHeight = Math.round(22 * s)
  return {
    boxHeight,
    gapAboveStaff: Math.round(8 * s),
    markStyle: normalizeSheetChordMarkStyle(project.view.sheetChordMarkStyle),
    fontSize: Math.max(10, Math.round(boxHeight * 0.58)),
  }
}

export function normalizeSheetChordMarkStyle(v: unknown): SheetChordMarkStyle {
  return v === 'off' || v === 'span' || v === 'boxed' ? v : 'boxed'
}

/**
 * Approximate label advance for boxed / text-only marks (bold Georgia).
 * Includes horizontal padding + border so glyphs don't collide with the box.
 */
export function estimateChordLabelWidthPx(label: string, fontSize: number): number {
  const s = label.trim() || '?'
  const fs = Math.max(8, fontSize)
  let units = 0
  for (const ch of s) {
    if (ch === ' ') units += 0.3
    else if ('Iil.,;:|'.includes(ch)) units += 0.45
    else if ('1fj()[]'.includes(ch)) units += 0.52
    else if ('trbº♭♯♮#b'.includes(ch)) units += 0.58
    else if ('mwMW@'.includes(ch)) units += 1.05
    else units += 0.74
  }
  // CSS: ~0.4em pad each side + 1.25px border each side (border-box width).
  const pad = Math.max(12, Math.round(fs * 0.85) + 6)
  return Math.max(MIN_BOXED_W, Math.ceil(units * fs) + pad)
}

type ChordMeasureGeom = {
  startTick: number
  endTick: number
  x: number
  width: number
  y: number
  systemIndex: number
}

function measureForChordTick(
  rowMs: readonly ChordMeasureGeom[],
  tick: number,
  role: 'start' | 'end',
): ChordMeasureGeom {
  if (role === 'end') {
    const ending = rowMs.find((m) => m.endTick === tick)
    if (ending) return ending
    const inside = rowMs.find((m) => tick > m.startTick && tick <= m.endTick)
    if (inside) return inside
    return rowMs[rowMs.length - 1]!
  }
  const inside = rowMs.find((m) => tick >= m.startTick && tick < m.endTick)
  if (inside) return inside
  return rowMs.find((m) => tick === m.endTick) ?? rowMs[0]!
}

function isMeasureStartTick(m: ChordMeasureGeom, tick: number): boolean {
  return tick <= m.startTick
}

function isMeasureEndTick(m: ChordMeasureGeom, tick: number): boolean {
  return tick >= m.endTick
}

/**
 * Chord-box X convention:
 * - Measure start / end → left / right barline (not the next system's first note).
 * - Mid-measure → sit above the notes; shared edges split the *visual* gap
 *   between consecutive chord onsets (notehead X), not pure tick proportion.
 */
function chordBoxEdgeX(
  layout: VexScoreLayoutResult,
  rowMs: readonly ChordMeasureGeom[],
  tick: number,
  role: 'start' | 'end',
  /** Other onset to split with when mid-measure (prev start, or this/next start). */
  splitWithTick: number | null,
): number {
  const m = measureForChordTick(rowMs, tick, role)
  if (role === 'start' && isMeasureStartTick(m, tick)) return m.x
  if (role === 'end' && isMeasureEndTick(m, tick)) return m.x + m.width

  const vx = layout.tickToX(tick)
  if (splitWithTick == null) return vx
  // Mid-measure splits always use notehead X for both onsets (even if the
  // neighbor onset also happens to be beat 1 — its *outer* edge uses the
  // barline, but the shared interior edge sits between the notes).
  if (
    splitWithTick < rowMs[0]!.startTick ||
    splitWithTick > rowMs[rowMs.length - 1]!.endTick
  ) {
    return vx
  }
  return (vx + layout.tickToX(splitWithTick)) / 2
}

type SpanSeg = {
  span: SheetChordMarkSpan
  systemIndex: number
  rowMs: ChordMeasureGeom[]
  segStart: number
  segEnd: number
  row: number
}

/**
 * Build per-system boxes for chord spans. Spans that wrap systems get one box
 * per system row.
 */
export function buildSheetChordMarkBoxes(
  layout: VexScoreLayoutResult,
  spans: readonly SheetChordMarkSpan[],
  opts?: {
    boxHeight?: number
    gapAboveStaff?: number
    markStyle?: SheetChordMarkStyle
    fontSize?: number
  },
): SheetChordMarkBox[] {
  const boxH = opts?.boxHeight ?? 18
  const gapAbove = opts?.gapAboveStaff ?? 6
  const markStyle = normalizeSheetChordMarkStyle(opts?.markStyle)
  const fontSize = opts?.fontSize ?? Math.max(9, Math.round(boxH * 0.62))

  const segs: SpanSeg[] = []
  for (const span of spans) {
    if (!span.label.trim()) continue
    if (!(span.endTick > span.startTick)) continue
    const overlapping = layout.measures.filter(
      (m) => m.endTick > span.startTick && m.startTick < span.endTick,
    )
    if (!overlapping.length) continue

    const bySys = new Map<number, typeof overlapping>()
    for (const m of overlapping) {
      const list = bySys.get(m.systemIndex)
      if (list) list.push(m)
      else bySys.set(m.systemIndex, [m])
    }

    const row = span.row ?? (span.variant === 'sketch' ? 1 : 0)
    for (const [systemIndex, rowMs] of bySys) {
      rowMs.sort((a, b) => a.startTick - b.startTick)
      const first = rowMs[0]!
      const last = rowMs[rowMs.length - 1]!
      segs.push({
        span,
        systemIndex,
        rowMs,
        segStart: Math.max(span.startTick, first.startTick),
        segEnd: Math.min(span.endTick, last.endTick),
        row,
      })
    }
  }

  // Per system + stack row: sort so adjacent mid-measure chords share a visual split.
  const out: SheetChordMarkBox[] = []
  const groups = new Map<string, SpanSeg[]>()
  for (const seg of segs) {
    const key = `${seg.systemIndex}:${seg.row}:${seg.span.variant}`
    const list = groups.get(key)
    if (list) list.push(seg)
    else groups.set(key, [seg])
  }

  for (const group of groups.values()) {
    group.sort((a, b) => a.segStart - b.segStart || a.segEnd - b.segEnd)
    for (let i = 0; i < group.length; i++) {
      const seg = group[i]!
      const prev = group[i - 1]
      const startM = measureForChordTick(seg.rowMs, seg.segStart, 'start')
      const endM = measureForChordTick(seg.rowMs, seg.segEnd, 'end')
      const top = startM.y - gapAbove - boxH * (seg.row + 1) - seg.row * 3

      if (markStyle === 'boxed' || markStyle === 'off') {
        // Lead-sheet style: tight mark at the chord onset (above the notes).
        const onsetX = layout.tickToX(seg.segStart)
        const width = estimateChordLabelWidthPx(seg.span.label, fontSize)
        out.push({
          id: `${seg.span.variant}-${seg.span.id}-s${seg.systemIndex}`,
          left: onsetX,
          top,
          width,
          label: seg.span.label,
          variant: seg.span.variant,
          row: seg.row,
          markStyle,
          systemIndex: seg.systemIndex,
        })
        continue
      }

      // Mid-measure left: split visually with the previous chord's onset.
      const splitLeftWith =
        !isMeasureStartTick(startM, seg.segStart) &&
        prev &&
        prev.segEnd === seg.segStart
          ? prev.segStart
          : null
      // Mid-measure right: split visually between this onset and the next onset.
      const splitRightWith = !isMeasureEndTick(endM, seg.segEnd)
        ? seg.segStart
        : null

      const left = chordBoxEdgeX(
        layout,
        seg.rowMs,
        seg.segStart,
        'start',
        splitLeftWith,
      )
      const right = Math.max(
        left + MIN_BOX_W,
        chordBoxEdgeX(layout, seg.rowMs, seg.segEnd, 'end', splitRightWith),
      )

      out.push({
        id: `${seg.span.variant}-${seg.span.id}-s${seg.systemIndex}`,
        left,
        top,
        width: Math.max(MIN_BOX_W, right - left),
        label: seg.span.label,
        variant: seg.span.variant,
        row: seg.row,
        markStyle: 'span',
        systemIndex: seg.systemIndex,
      })
    }
  }
  return resolveChordMarkVerticalOverlaps(out, boxH)
}

/** Tiny breathing room so stacked chords don't kiss the system above. */
const CHORD_CLEARANCE_PAD_PX = 4

export type SheetChordClearanceMeasure = {
  startTick: number
  endTick: number
  x: number
  width: number
  noteStartX: number
  noteEndX: number
  systemIndex: number
}

/**
 * Unit-space chord clearances for engraving places (before Y/page assignment).
 */
export function estimateUnitChordClearancesForPlaces(
  project: TagRollProject,
  places: readonly {
    mi: number
    x: number
    width: number
    systemIndex: number
  }[],
  opts: {
    measureTicks: number
    lengthTicks: number
    sizeScale: number
    detectSegments?: readonly SheetChordDetectSegment[]
    forceInclude?: boolean
  },
): number[] {
  if (!places.length) return []
  const mLen = Math.max(1, opts.measureTicks)
  const measures = places.map((pl) => {
    const startTick = pl.mi * mLen
    const endTick = Math.min(opts.lengthTicks, (pl.mi + 1) * mLen)
    return {
      startTick,
      endTick,
      x: pl.x,
      width: pl.width,
      noteStartX: pl.x,
      noteEndX: pl.x + pl.width,
      systemIndex: pl.systemIndex,
    }
  })
  const spans = collectSheetChordMarkSpans(
    project,
    opts.detectSegments,
    opts.forceInclude ? { forceInclude: true } : undefined,
  )
  const screen = sheetChordMarkLayoutOpts(project)
  const s = Math.max(1e-6, opts.sizeScale)
  return estimateSheetChordSystemClearances(measures, spans, {
    boxHeight: screen.boxHeight / s,
    gapAboveStaff: screen.gapAboveStaff / s,
    markStyle: screen.markStyle,
    fontSize: screen.fontSize / s,
  })
}

/**
 * Extra px above each system's staff top needed for chord marks (incl. stacks).
 * Measure geometry and returned values share one coordinate space (unit or screen).
 */
export function estimateSheetChordSystemClearances(
  measures: readonly SheetChordClearanceMeasure[],
  spans: readonly SheetChordMarkSpan[],
  opts?: {
    boxHeight?: number
    gapAboveStaff?: number
    markStyle?: SheetChordMarkStyle
    fontSize?: number
  },
): number[] {
  if (!measures.length) return []
  const maxSi = Math.max(...measures.map((m) => m.systemIndex))
  const clearances = Array.from({ length: maxSi + 1 }, () => 0)
  if (!spans.length) return clearances

  const stubMeasures = measures.map((m, i) => ({
    measureIndex: i,
    startTick: m.startTick,
    endTick: m.endTick,
    x: m.x,
    y: 0,
    width: m.width,
    systemIndex: m.systemIndex,
    noteStartX: m.noteStartX,
    noteEndX: m.noteEndX,
  }))
  const tickToX = (tick: number): number => {
    const m =
      stubMeasures.find((x) => tick >= x.startTick && tick < x.endTick) ??
      stubMeasures[stubMeasures.length - 1]!
    const span = Math.max(1, m.endTick - m.startTick)
    const u = Math.max(0, Math.min(1, (tick - m.startTick) / span))
    return m.noteStartX + u * (m.noteEndX - m.noteStartX)
  }
  const layout = {
    width: 1,
    height: 1,
    contentOriginX: 0,
    contentOriginY: 0,
    systemBodyHeight: 1,
    sizeScale: 1,
    marginsPx: { left: 0, right: 0, top: 0, bottom: 0 },
    measures: stubMeasures,
    pages: [],
    tickToX,
    tickToPoint: (t: number) => ({ x: tickToX(t), y: 0 }),
    pointToTick: () => 0,
  } satisfies VexScoreLayoutResult

  const boxes = buildSheetChordMarkBoxes(layout, spans, opts)
  for (const box of boxes) {
    const need = Math.max(0, Math.ceil(-box.top + CHORD_CLEARANCE_PAD_PX))
    const si = box.systemIndex
    if (si >= 0 && si < clearances.length) {
      clearances[si] = Math.max(clearances[si]!, need)
    }
  }
  return clearances
}

/**
 * When chord marks collide in X/Y, stack later marks upward (away from the
 * staff) by whole line steps so both labels stay readable.
 *
 * Only compares marks on the same system. Span marks that only share an edge
 * do not stack; boxed / text marks use a small X slack.
 */
export function resolveChordMarkVerticalOverlaps(
  boxes: readonly SheetChordMarkBox[],
  boxH: number,
): SheetChordMarkBox[] {
  if (boxes.length < 2) return [...boxes]
  const h = Math.max(8, boxH)
  const lineStep = h + Math.max(2, Math.round(h * 0.12))

  const gapXFor = (a: SheetChordMarkBox, b: SheetChordMarkBox): number => {
    if (a.markStyle === 'span' && b.markStyle === 'span') return 0
    return 2
  }

  const overlaps = (a: SheetChordMarkBox, b: SheetChordMarkBox): boolean => {
    if (a.systemIndex !== b.systemIndex) return false
    const gapX = gapXFor(a, b)
    return (
      a.left < b.left + b.width + gapX &&
      b.left < a.left + a.width + gapX &&
      a.top < b.top + h &&
      b.top < a.top + h
    )
  }

  // Left-to-right within each system: keep earlier onsets; bump collisions up.
  const ordered = [...boxes].sort(
    (a, b) =>
      a.systemIndex - b.systemIndex ||
      a.left - b.left ||
      a.top - b.top ||
      a.id.localeCompare(b.id),
  )
  const placed: SheetChordMarkBox[] = []

  for (const raw of ordered) {
    const box = { ...raw }
    const baseTop = raw.top
    let level = 0
    for (;;) {
      box.top = baseTop - level * lineStep
      if (!placed.some((p) => overlaps(box, p))) break
      level++
      if (level > 10) break
    }
    placed.push(box)
  }
  return placed
}

function chordMarkFillStroke(variant: SheetChordMarkVariant): {
  fill: string
  stroke: string
  strokeDasharray?: string
  text: string
} {
  if (variant === 'sketch') {
    return { fill: '#e8f1f8', stroke: '#5a8fb8', text: '#143d5c' }
  }
  return { fill: '#f7f2e8', stroke: '#8a7a5a', strokeDasharray: '3 2', text: '#4a4030' }
}

/**
 * Draw chord mark boxes into an engraved sheet SVG (export / print).
 * Idempotent: replaces any prior `data-sheet-chord-marks` group.
 * Backgrounds are painted first, then all labels on top so text is never
 * covered by a later span rect.
 */
export function appendSheetChordMarksToSvg(
  svg: SVGSVGElement,
  boxes: readonly SheetChordMarkBox[],
  opts?: { boxHeight?: number; fontSize?: number },
): void {
  svg.querySelector('[data-sheet-chord-marks]')?.remove()
  if (!boxes.length) return

  const boxH = opts?.boxHeight ?? 18
  const fontSize = opts?.fontSize ?? Math.max(9, Math.round(boxH * 0.62))
  const root = document.createElementNS(SVG_NS, 'g')
  root.setAttribute('data-sheet-chord-marks', '1')
  root.setAttribute('class', 'sheet-chord-marks')

  const bgLayer = document.createElementNS(SVG_NS, 'g')
  bgLayer.setAttribute('data-chord-bg', '1')
  const textLayer = document.createElementNS(SVG_NS, 'g')
  textLayer.setAttribute('data-chord-text', '1')

  for (const box of boxes) {
    const colors = chordMarkFillStroke(box.variant)
    const style = box.markStyle ?? 'span'

    const rectH =
      style === 'boxed'
        ? Math.max(fontSize + 8, Math.round(boxH * 0.9))
        : boxH
    const rectTop =
      style === 'boxed' ? box.top + (boxH - rectH) / 2 : box.top
    const textInsetX =
      style === 'boxed' ? Math.max(4, Math.round(fontSize * 0.35)) : 2

    if (style !== 'off') {
      const rect = document.createElementNS(SVG_NS, 'rect')
      rect.setAttribute('data-chord-id', box.id)
      rect.setAttribute('x', String(box.left))
      rect.setAttribute('y', String(rectTop))
      rect.setAttribute('width', String(box.width))
      rect.setAttribute('height', String(rectH))
      rect.setAttribute('rx', style === 'boxed' ? '2' : '3')
      rect.setAttribute('ry', style === 'boxed' ? '2' : '3')
      if (style === 'boxed') {
        // Lead-sheet convention: hollow box, solid black border.
        rect.setAttribute('fill', 'none')
        rect.setAttribute('stroke', '#000000')
        rect.setAttribute('stroke-width', '1.25')
      } else {
        rect.setAttribute('fill', colors.fill)
        rect.setAttribute('stroke', colors.stroke)
        rect.setAttribute('stroke-width', '1')
        if (colors.strokeDasharray) {
          rect.setAttribute('stroke-dasharray', colors.strokeDasharray)
        }
      }
      bgLayer.appendChild(rect)
    }

    const text = document.createElementNS(SVG_NS, 'text')
    text.setAttribute('data-chord-id', box.id)
    // Boxed / off: left-align at onset; span: center in the duration band.
    if (style === 'span') {
      text.setAttribute('x', String(box.left + box.width / 2))
      text.setAttribute('text-anchor', 'middle')
    } else {
      text.setAttribute('x', String(box.left + textInsetX))
      text.setAttribute('text-anchor', 'start')
    }
    text.setAttribute('y', String(rectTop + rectH * 0.72))
    text.setAttribute('font-family', 'Academico, Georgia, "Times New Roman", serif')
    text.setAttribute('font-size', String(fontSize))
    text.setAttribute('font-weight', style === 'boxed' ? '700' : '500')
    text.setAttribute('fill', style === 'boxed' ? '#000000' : colors.text)
    text.textContent = box.label
    textLayer.appendChild(text)
  }

  root.appendChild(bgLayer)
  root.appendChild(textLayer)
  svg.appendChild(root)
}

/**
 * Collect + layout + paint chord marks onto a rendered sheet SVG.
 * Layout geometry is screen px; SVG viewBox is unit engraving space — divide by
 * sizeScale so marks sit on the staves (HTML overlays keep screen boxes).
 */
export function paintSheetChordMarks(
  svg: SVGSVGElement,
  layout: VexScoreLayoutResult,
  project: TagRollProject,
  detectSegments?: readonly SheetChordDetectSegment[],
  opts?: CollectSheetChordMarkOpts,
): SheetChordMarkBox[] {
  const layOpts = sheetChordMarkLayoutOpts(project)
  const spans = collectSheetChordMarkSpans(project, detectSegments, opts)
  const boxes = buildSheetChordMarkBoxes(layout, spans, layOpts)
  const s = Math.max(1e-6, layout.sizeScale || 1)
  const unitBoxes = boxes.map((b) => ({
    ...b,
    left: b.left / s,
    top: b.top / s,
    width: b.width / s,
  }))
  appendSheetChordMarksToSvg(svg, unitBoxes, {
    boxHeight: layOpts.boxHeight / s,
    fontSize: layOpts.fontSize / s,
  })
  return boxes
}
