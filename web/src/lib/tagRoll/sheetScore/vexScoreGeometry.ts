/**
 * After VexFlow draws, map musical ticks onto engraved coordinates.
 */
import type { Stave } from 'vexflow'
import type { PlacedTickable } from './sheetVoiceNotes'
import type { VexScoreLayoutResult, VexScoreMeasureGeom, VexScorePageGeom } from './renderVexScore'

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

export function finishVexScoreGeometry(input: {
  measures: VexScoreMeasureGeom[]
  pages: VexScorePageGeom[]
  topStaves: Stave[]
  placedByMeasure: PlacedTickable[][]
  sizeScale: number
  totalWidth: number
  totalHeight: number
  pageMode: boolean
  headerBandPx: number
  scoreTopPad: number
  leftPad: number
  rightPad: number
  topPad: number
  bottomPad: number
  systemBodyHeight: number
  chordClearance: number[]
  lengthTicks: number
  systemCount: number
}): VexScoreLayoutResult {
  const {
    measures, pages, topStaves, placedByMeasure, sizeScale, totalWidth, totalHeight,
    pageMode, headerBandPx, scoreTopPad, leftPad, rightPad, topPad, bottomPad,
    systemBodyHeight, chordClearance, lengthTicks, systemCount,
  } = input
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
    chordClearanceBySystem: chordClearance.map((c) => sx(c)),
    tickToX,
    tickToPoint,
    pointToTick,
  }
}
