/**
 * Straight horizontal lyric lanes for TTBB sheet:
 * voice 1 above its staff, voice 2 below — fixed Y (no pitch jumps).
 * Also hosts legacy Annotation textLine helpers for non-straight mode.
 */
import type { StaveNote } from 'vexflow'
import type { TagRollViewPrefs } from '../types'
import { noteheadPoint, type OverlayPlaced } from './sheetScoreOverlays'
import {
  parseLyricSyllable,
  type ParsedLyricSyllable,
} from './sheetLyricSyllabic'

export type LyricLanePlaced = OverlayPlaced & {
  lyric?: string
  voice?: 1 | 2
  partId?: string
}

/** Push lyric lines below stems / noteheads (VexFlow textLine units). */
const LYRIC_TEXT_LINE_V1 = 2
const LYRIC_TEXT_LINE_V2 = 3

/** Engraved lyric fill — lighter than noteheads so syllables don't shout. */
export const SHEET_LYRIC_FILL = '#6e6963'
/** Opaque backdrop so lyrics stay readable over staff lines. */
export const SHEET_LYRIC_BACKDROP_FILL = '#ffffff'

/** Approximate advance for a lyric syllable (backdrop width). */
export function estimateLyricBackdropWidthPx(text: string, fontPx: number): number {
  const fs = Math.max(8, fontPx)
  let units = 0
  for (const ch of text) {
    if (ch === ' ' || ch === '-' || ch === '–') units += 0.35
    else if ("'’il.,;:".includes(ch)) units += 0.4
    else if (ch === 'm' || ch === 'w' || ch === 'M' || ch === 'W') units += 0.95
    else units += 0.62
  }
  return Math.max(fs * 0.75, Math.round(units * fs + fs * 0.45))
}

/** White box behind a lyric at (x,y); side matches dominant-baseline. */
export function lyricBackdropBox(
  x: number,
  y: number,
  text: string,
  fontPx: number,
  side: 'above' | 'below',
): { x: number; y: number; width: number; height: number } {
  const fs = Math.max(8, fontPx)
  const width = estimateLyricBackdropWidthPx(text, fs)
  const height = Math.round(fs * 1.2)
  const top =
    side === 'above'
      ? y - height + Math.round(fs * 0.18) // alphabetic baseline near box bottom
      : y - Math.round(fs * 0.12) // hanging: top of glyphs near y
  return { x: x - width / 2, y: top, width, height }
}

/** Paint notes/beams above lyric backdrops (flat VexFlow SVG children). */
export function raiseSheetNoteLayers(svg: SVGSVGElement): void {
  const nodes = svg.querySelectorAll(
    [
      ':scope > g.vf-stavenote',
      ':scope > g.vf-beam',
      ':scope > g.vf-stavetie',
      ':scope > g[class*="stavenote"]',
      ':scope > g[class*="beam"]',
      ':scope > g[class*="stavetie"]',
    ].join(', '),
  )
  for (const n of nodes) svg.appendChild(n)
}

/** Base lyric textLine for stem-up (v1) / stem-down (v2), plus user nudge. */
export function lyricTextLineForVoice(voice: 1 | 2, offset = 0): number {
  const base = voice === 1 ? LYRIC_TEXT_LINE_V1 : LYRIC_TEXT_LINE_V2
  return Math.max(0, Math.round((base + offset) * 10) / 10)
}

/** Default staff-line gap used when callers omit `linePx`. */
const DEFAULT_LINE_PX = 10

/**
 * Fallback clearance from staff edge past typical stem tips (~3.5 spaces)
 * into the white space above/below. Used for spacing estimates and when
 * stem extents are unavailable after draw.
 */
export function lyricLaneClearancePx(
  fontPx: number,
  linePx = DEFAULT_LINE_PX,
  stemLength = 1,
): number {
  const font = Math.max(9, fontPx)
  const stemScale = Math.max(0.4, stemLength)
  const stemPastStaff = Math.round(Math.max(8, linePx) * 3.5 * stemScale)
  const pad = Math.round(font * 0.25)
  return stemPastStaff + pad
}

/** Hairline gap between stem tip (or staff fallback) and lyric ink. */
export function lyricStemPadPx(fontPx: number): number {
  return Math.max(3, Math.round(Math.max(9, fontPx) * 0.28))
}

/** Per-part nudge in px (positive = further from staff). */
export function lyricLaneNudgePx(fontPx: number, offset: number): number {
  return offset * Math.max(3, fontPx * 0.4)
}

/**
 * How far above the staff top a straight above-lane lyric extends (unit px),
 * including clearance, user nudge, and approx glyph height.
 */
export function straightLyricAboveExtentPx(
  fontPx: number,
  offset = 0,
  stemLength = 1,
  linePx = DEFAULT_LINE_PX,
): number {
  const o = Math.max(0, offset)
  return (
    lyricLaneClearancePx(fontPx, linePx, stemLength) +
    lyricLaneNudgePx(fontPx, o) +
    Math.round(Math.max(9, fontPx) * 0.9)
  )
}

/** Global + per-part lyric visibility (missing part key = visible). */
export function isSheetLyricPartVisible(
  view: Pick<TagRollViewPrefs, 'sheetShowLyrics' | 'sheetLyricPartVisible'>,
  partId: string,
): boolean {
  if (view.sheetShowLyrics === false) return false
  return view.sheetLyricPartVisible?.[partId] !== false
}

/**
 * Max above-staff lyric extent for parts whose lane sits above the top staff.
 * Used to lift chord marks and top headroom when straight lyrics are on.
 */
export function maxStraightLyricAboveExtentPx(
  fontPx: number,
  offsets: Readonly<Record<string, number>>,
  abovePartIds: readonly string[],
  partVisible: (partId: string) => boolean,
  stemLength = 1,
  linePx = DEFAULT_LINE_PX,
): number {
  let max = 0
  let any = false
  for (const id of abovePartIds) {
    if (!partVisible(id)) continue
    any = true
    max = Math.max(
      max,
      straightLyricAboveExtentPx(fontPx, offsets[id] ?? 0, stemLength, linePx),
    )
  }
  return any ? max : 0
}

/**
 * Extra staff-spaces so lead (below upper) + bari (above lower) both clear
 * stems in the shared inter-staff white space.
 */
export function straightLyricStaveGapExtra(
  fontPx: number,
  linePx: number,
  stemLength = 1,
): number {
  const lp = Math.max(8, linePx)
  const oneLane =
    (lyricLaneClearancePx(fontPx, lp, stemLength) + Math.max(9, fontPx) * 0.85) / lp
  // Preset lyrics gaps already ~8.5–15; add only what stem-clear lanes still need.
  return Math.max(1.5, Math.round((oneLane * 2 + 0.6 - 9) * 10) / 10)
}

/** Top expression headroom + below-staff tail for lyric lanes. */
export function sheetLyricSystemPads(opts: {
  straightLyrics: boolean
  lyricFontPx: number
  lyricOffsets: Readonly<Record<string, number>>
  abovePartIds: readonly string[]
  lyricPartOn: (partId: string) => boolean
  topMargin?: number
  bottomMargin?: number
  stemLength?: number
  linePx?: number
}): { exprHeadroom: number; staffTailPad: number } {
  const font = opts.lyricFontPx
  const stem = opts.stemLength ?? 1
  const linePx = opts.linePx ?? DEFAULT_LINE_PX
  const topClear = opts.straightLyrics
    ? maxStraightLyricAboveExtentPx(
        font,
        opts.lyricOffsets,
        opts.abovePartIds,
        opts.lyricPartOn,
        stem,
        linePx,
      )
    : 0
  const belowClear = opts.straightLyrics
    ? lyricLaneClearancePx(font, linePx, stem) + Math.round(font * 0.9)
    : 0
  return {
    exprHeadroom: Math.round(8 * (opts.topMargin ?? 1)) + topClear,
    staffTailPad: Math.round(10 * (opts.bottomMargin ?? 1)) + belowClear,
  }
}

/** Screen-px chord gap above staff, lifted for straight above-staff lyrics. */
export function sheetChordGapAboveStaffPx(
  view: Pick<
    TagRollViewPrefs,
    | 'sheetShowLyrics'
    | 'sheetStraightLyrics'
    | 'sheetLyricSize'
    | 'sheetLyricOffsets'
    | 'sheetLyricPartVisible'
    | 'sheetScoreScale'
    | 'sheetStemLength'
  >,
  abovePartIds: readonly string[],
): number {
  const s = Math.max(0.55, view.sheetScoreScale ?? 1)
  let gap = Math.round(8 * s)
  const straight =
    view.sheetShowLyrics !== false && view.sheetStraightLyrics !== false
  if (!straight || !abovePartIds.length) return gap
  const extent = maxStraightLyricAboveExtentPx(
    view.sheetLyricSize ?? 11,
    view.sheetLyricOffsets ?? {},
    abovePartIds,
    (id) => isSheetLyricPartVisible(view, id),
    view.sheetStemLength ?? 0.8,
  )
  if (extent > 0) gap = Math.max(gap, Math.round(extent * s) + Math.round(4 * s))
  return gap
}

/** Top-to-top stave spacing in staff-spaces (× stave.space px). */
const SPACE_BETWEEN_STAVES_TIGHT = 5
const SPACE_BETWEEN_STAVES = 6.5
const SPACE_BETWEEN_STAVES_WIDE = 9
/** Room for stem-cleared lyric lanes in the white space between staves. */
const SPACE_BETWEEN_STAVES_LYRICS_TIGHT = 10.5
const SPACE_BETWEEN_STAVES_LYRICS = 12.5
const SPACE_BETWEEN_STAVES_LYRICS_WIDE = 16.5

export function staveGapSpaces(
  gap: 'tight' | 'normal' | 'wide',
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

function staffEdgeYs(note: StaveNote): { top: number; bot: number } | null {
  try {
    const stave = note.getStave()
    if (!stave) return null
    const top = stave.getYForLine(0)
    const bot = stave.getYForLine(4)
    if (!Number.isFinite(top) || !Number.isFinite(bot)) return null
    return { top, bot }
  } catch {
    return null
  }
}

/** Notehead + stem tip bounds (VexFlow: topY = upper tip, baseY = lower tip). */
export function noteStemInkYs(note: StaveNote): { top: number; bot: number } | null {
  try {
    const ys = note.getYs().filter((y) => Number.isFinite(y))
    if (!ys.length) return null
    let top = Math.min(...ys)
    let bot = Math.max(...ys)
    try {
      if (typeof note.hasStem === 'function' && note.hasStem()) {
        const e = note.getStemExtents()
        if (Number.isFinite(e.topY)) top = Math.min(top, e.topY)
        if (Number.isFinite(e.baseY)) bot = Math.max(bot, e.baseY)
      }
    } catch {
      /* whole notes / rests — notehead only */
    }
    return { top, bot }
  } catch {
    return null
  }
}

/**
 * Straight-lane Y: in the white space above (v1 / stem-up) or below (v2 /
 * stem-down), past the furthest stem tip on that staff+voice.
 */
export function straightLyricLaneY(
  side: 'above' | 'below',
  staffEdge: number,
  stemExtreme: number | null,
  fontPx: number,
  linePx = DEFAULT_LINE_PX,
  nudgePx = 0,
  stemLength = 1,
): number {
  const clear = lyricLaneClearancePx(fontPx, linePx, stemLength)
  const pad = lyricStemPadPx(fontPx)
  if (side === 'above') {
    const fromStaff = staffEdge - clear
    const fromStem =
      stemExtreme != null && Number.isFinite(stemExtreme)
        ? stemExtreme - pad
        : fromStaff
    return Math.min(fromStaff, fromStem) - nudgePx
  }
  const fromStaff = staffEdge + clear
  const fromStem =
    stemExtreme != null && Number.isFinite(stemExtreme)
      ? stemExtreme + pad
      : fromStaff
  return Math.max(fromStaff, fromStem) + nudgePx
}

type LaneAgg = {
  staffTop: number
  staffBot: number
  voice: 1 | 2
  stemExtreme: number
}

/**
 * Draw one straight lyric line per voice: above (v1) / below (v2) its staff.
 * Call after VexFlow draw(), before SVG size scale.
 */
export function drawStraightLyricLanes(
  host: HTMLElement,
  placed: readonly LyricLanePlaced[],
  opts: {
    fontPx: number
    linePx?: number
    stemLength?: number
    /** Match sheet text font (e.g. Academico) — same as VexFlow annotations. */
    fontFamily?: string
    /** Per-part nudge in lyric-line units; positive moves further from the staff. */
    offsets?: Readonly<Record<string, number>>
    /** Return false to skip a part’s lyrics. */
    partVisible?: (partId: string) => boolean
  },
): void {
  const svg = host.querySelector('svg')
  if (!svg) return
  const fontPx = Math.max(9, Math.round(opts.fontPx))
  const linePx = opts.linePx ?? DEFAULT_LINE_PX
  const stemLength = opts.stemLength ?? 1
  const offsets = opts.offsets ?? {}
  const family = opts.fontFamily?.trim() || 'Academico'
  const visible = opts.partVisible ?? (() => true)
  const ns = 'http://www.w3.org/2000/svg'

  // Stem extremes per staff+voice so the whole lane clears every stem tip.
  const lanes = new Map<string, LaneAgg>()
  for (const p of placed) {
    if (p.voice !== 1 && p.voice !== 2) continue
    const edges = staffEdgeYs(p.note)
    const ink = noteStemInkYs(p.note)
    if (!edges) continue
    const key = `${edges.top}|${p.voice}`
    const cur = lanes.get(key)
    const extreme =
      p.voice === 1
        ? (ink?.top ?? edges.top)
        : (ink?.bot ?? edges.bot)
    if (!cur) {
      lanes.set(key, {
        staffTop: edges.top,
        staffBot: edges.bot,
        voice: p.voice,
        stemExtreme: extreme,
      })
    } else if (p.voice === 1) {
      cur.stemExtreme = Math.min(cur.stemExtreme, extreme)
    } else {
      cur.stemExtreme = Math.max(cur.stemExtreme, extreme)
    }
  }

  const layer = document.createElementNS(ns, 'g')
  layer.setAttribute('class', 'sheet-lyric-layer')
  layer.setAttribute('data-sheet-lyric-layer', '1')

  // Group by staff+voice+part for syllabic sequence + melisma extenders.
  type LyricHit = {
    placed: LyricLanePlaced
    x: number
    y: number
    side: 'above' | 'below'
    parsed: ParsedLyricSyllable | null
  }
  const sequences = new Map<string, LyricHit[]>()

  for (const p of placed) {
    if (p.voice !== 1 && p.voice !== 2) continue
    if (p.partId && !visible(p.partId)) continue
    const head = noteheadPoint(p.note)
    const edges = staffEdgeYs(p.note)
    if (!head || !edges) continue
    const lane = lanes.get(`${edges.top}|${p.voice}`)
    const side = p.voice === 1 ? 'above' : 'below'
    const nudge = lyricLaneNudgePx(fontPx, offsets[p.partId ?? ''] ?? 0)
    const y = straightLyricLaneY(
      side,
      side === 'above' ? edges.top : edges.bot,
      lane?.stemExtreme ?? null,
      fontPx,
      linePx,
      nudge,
      stemLength,
    )
    const key = `${edges.top}|${p.voice}|${p.partId ?? ''}`
    const list = sequences.get(key) ?? []
    list.push({ placed: p, x: head.x, y, side, parsed: null })
    sequences.set(key, list)
  }

  for (const hits of sequences.values()) {
    hits.sort((a, b) => a.placed.tick - b.placed.tick || a.x - b.x)
    let open = false
    for (const hit of hits) {
      hit.parsed = parseLyricSyllable(hit.placed.lyric, open)
      if (hit.parsed) {
        open =
          hit.parsed.syllabic === 'begin' ||
          hit.parsed.syllabic === 'middle' ||
          hit.parsed.extendAfter
        if (hit.parsed.syllabic === 'end' || hit.parsed.syllabic === 'single') {
          open = hit.parsed.extendAfter
        }
      }
    }

    for (let i = 0; i < hits.length; i++) {
      const hit = hits[i]!
      const parsed = hit.parsed
      if (!parsed) continue
      const text = parsed.text
      if (text) {
        const g = document.createElementNS(ns, 'g')
        g.setAttribute('class', 'sheet-lyric-syllable')
        const box = lyricBackdropBox(hit.x, hit.y, text, fontPx, hit.side)
        const rect = document.createElementNS(ns, 'rect')
        rect.setAttribute('class', 'sheet-lyric-backdrop')
        rect.setAttribute('x', String(box.x))
        rect.setAttribute('y', String(box.y))
        rect.setAttribute('width', String(box.width))
        rect.setAttribute('height', String(box.height))
        rect.setAttribute('rx', String(Math.max(1, Math.round(fontPx * 0.12))))
        rect.setAttribute('fill', SHEET_LYRIC_BACKDROP_FILL)
        rect.setAttribute('stroke', 'none')

        const el = document.createElementNS(ns, 'text')
        el.setAttribute('class', 'sheet-lyric-lane')
        el.setAttribute('data-sheet-lyric-lane', hit.side)
        el.setAttribute('data-sheet-lyric-syllabic', parsed.syllabic)
        el.setAttribute('x', String(hit.x))
        el.setAttribute('y', String(hit.y))
        el.setAttribute('text-anchor', 'middle')
        el.setAttribute(
          'dominant-baseline',
          hit.side === 'above' ? 'auto' : 'hanging',
        )
        el.setAttribute('fill', SHEET_LYRIC_FILL)
        el.setAttribute('font-size', String(fontPx))
        el.setAttribute('font-weight', '400')
        el.setAttribute('font-style', 'normal')
        el.setAttribute('font-family', `"${family}", Academico, serif`)
        // Regular face only — browser synthetic bold is why lyrics looked heavier
        // than vector PDF outlines of the same Academico OTF.
        el.style.fontFamily = `"${family}", Academico, serif`
        el.style.fontWeight = '400'
        el.style.fontStyle = 'normal'
        el.style.fontStretch = 'normal'
        el.style.fontSynthesis = 'none'
        el.style.setProperty('-webkit-font-smoothing', 'antialiased')
        el.style.setProperty('-moz-osx-font-smoothing', 'grayscale')
        el.style.setProperty('-webkit-text-stroke', '0')
        el.style.setProperty('paint-order', 'normal')
        el.textContent = text
        g.appendChild(rect)
        g.appendChild(el)
        layer.appendChild(g)
      }

      // Melisma / word-extension line to the next onset when this syllable continues.
      if (parsed.extendAfter && i + 1 < hits.length) {
        const next = hits[i + 1]!
        const fromX =
          text.length > 0
            ? hit.x + estimateLyricBackdropWidthPx(text, fontPx) / 2 + 1
            : hit.x
        const toX = next.x - (next.parsed?.text
          ? estimateLyricBackdropWidthPx(next.parsed.text, fontPx) / 2 + 1
          : 0)
        if (toX > fromX + 4) {
          const line = document.createElementNS(ns, 'line')
          line.setAttribute('class', 'sheet-lyric-extender')
          line.setAttribute('data-sheet-lyric-extender', hit.side)
          line.setAttribute('x1', String(fromX))
          line.setAttribute('x2', String(toX))
          line.setAttribute('y1', String(hit.y))
          line.setAttribute('y2', String(next.y))
          line.setAttribute('stroke', SHEET_LYRIC_FILL)
          line.setAttribute('stroke-width', String(Math.max(1, fontPx * 0.08)))
          line.setAttribute('fill', 'none')
          layer.appendChild(line)
        }
      }
    }
  }

  if (layer.childNodes.length) {
    svg.appendChild(layer)
    // Staff lines stay under lyrics; notes/beams paint above the white boxes.
    raiseSheetNoteLayers(svg)
  }
}
