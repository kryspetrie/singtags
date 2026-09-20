/**
 * Canvas painter for continuous horizontal sheet view.
 */
import { ticksToPx } from '../normalize'
import type { EngravedScore } from './engrave'
import type { NoteDurationType } from './durationMap'
import type { SheetClefKind, SheetScoreLayout } from './types'

export type DrawSheetOpts = {
  layout: SheetScoreLayout
  cssW: number
  cssH: number
  scrollX: number
  scrollY: number
  /** Pixels per quarter-note beat (same meaning as roll cellW). */
  pxPerBeat: number
  playheadTick: number
  lengthTicks: number
  /** Accent color for playhead. */
  accent?: string
  engraved?: EngravedScore | null
}

function staffLineYs(topY: number, lineGap: number): number[] {
  return [0, 1, 2, 3, 4].map((i) => topY + i * lineGap)
}

function drawClef(
  ctx: CanvasRenderingContext2D,
  clef: SheetClefKind,
  x: number,
  topY: number,
  lineGap: number,
  color: string,
): void {
  const midY = topY + lineGap * 2
  ctx.fillStyle = color
  ctx.strokeStyle = color
  ctx.lineWidth = 1.5
  ctx.font = `bold ${Math.round(lineGap * 3.2)}px Georgia, "Times New Roman", serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'

  if (clef === 'treble' || clef === 'treble8vb') {
    ctx.fillText('𝄞', x, midY + lineGap * 0.15)
    if (clef === 'treble8vb') {
      ctx.font = `600 ${Math.round(lineGap * 1.35)}px system-ui, sans-serif`
      ctx.fillText('8', x, topY + lineGap * 4 + lineGap * 1.1)
    }
  } else {
    ctx.fillText('𝄢', x, midY)
    if (clef === 'bass8va') {
      ctx.font = `600 ${Math.round(lineGap * 1.35)}px system-ui, sans-serif`
      ctx.fillText('8', x, topY - lineGap * 0.85)
    }
  }
}

function drawChoralBracket(
  ctx: CanvasRenderingContext2D,
  x: number,
  topY: number,
  bottomY: number,
  color: string,
): void {
  const w = 6
  ctx.strokeStyle = color
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(x + w, topY)
  ctx.lineTo(x, topY)
  ctx.lineTo(x, bottomY)
  ctx.lineTo(x + w, bottomY)
  ctx.stroke()
}

function drawNoteHead(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  filled: boolean,
  color: string,
  lineGap: number,
): void {
  const rx = lineGap * 0.55
  const ry = lineGap * 0.38
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(-0.4)
  ctx.beginPath()
  ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2)
  if (filled) {
    ctx.fillStyle = color
    ctx.fill()
  } else {
    ctx.strokeStyle = color
    ctx.lineWidth = 1.4
    ctx.stroke()
  }
  ctx.restore()
}

function drawAccidental(
  ctx: CanvasRenderingContext2D,
  kind: 'sharp' | 'flat' | 'natural',
  x: number,
  y: number,
  color: string,
  lineGap: number,
): void {
  ctx.fillStyle = color
  ctx.font = `${Math.round(lineGap * 1.8)}px Georgia, "Times New Roman", serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  const glyph = kind === 'sharp' ? '♯' : kind === 'flat' ? '♭' : '♮'
  ctx.fillText(glyph, x, y)
}

function drawDots(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  count: number,
  color: string,
  lineGap: number,
): void {
  ctx.fillStyle = color
  for (let i = 0; i < count; i++) {
    ctx.beginPath()
    ctx.arc(x + lineGap * 0.85 + i * lineGap * 0.45, y, lineGap * 0.12, 0, Math.PI * 2)
    ctx.fill()
  }
}

function drawFlags(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  up: boolean,
  count: number,
  color: string,
  lineGap: number,
): void {
  ctx.strokeStyle = color
  ctx.lineWidth = 1.35
  ctx.lineCap = 'round'
  for (let i = 0; i < count; i++) {
    const tipY = up ? y + i * lineGap * 0.7 : y - i * lineGap * 0.7
    ctx.beginPath()
    if (up) {
      ctx.moveTo(x, tipY)
      ctx.bezierCurveTo(
        x + lineGap * 1.1,
        tipY + lineGap * 0.15,
        x + lineGap * 1.2,
        tipY + lineGap * 1.1,
        x + lineGap * 0.35,
        tipY + lineGap * 1.35,
      )
    } else {
      ctx.moveTo(x, tipY)
      ctx.bezierCurveTo(
        x + lineGap * 1.1,
        tipY - lineGap * 0.15,
        x + lineGap * 1.2,
        tipY - lineGap * 1.1,
        x + lineGap * 0.35,
        tipY - lineGap * 1.35,
      )
    }
    ctx.stroke()
  }
}

function drawRest(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  type: NoteDurationType,
  dots: number,
  color: string,
  lineGap: number,
): void {
  ctx.fillStyle = color
  ctx.strokeStyle = color
  if (type === 'whole' || type === 'half') {
    const w = lineGap * 1.1
    const h = lineGap * 0.35
    const yy = type === 'whole' ? y - h : y
    ctx.fillRect(x - w / 2, yy, w, h)
  } else if (type === 'quarter') {
    ctx.font = `${Math.round(lineGap * 2.2)}px Georgia, serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('𝄽', x, y)
  } else {
    ctx.lineWidth = 1.4
    ctx.beginPath()
    ctx.moveTo(x, y - lineGap)
    ctx.lineTo(x, y + lineGap * 0.6)
    ctx.stroke()
    const hooks = type === 'eighth' ? 1 : type === 'sixteenth' ? 2 : 3
    for (let i = 0; i < hooks; i++) {
      const hy = y - lineGap + i * lineGap * 0.55
      ctx.beginPath()
      ctx.arc(x + lineGap * 0.35, hy + lineGap * 0.25, lineGap * 0.28, -0.2, Math.PI * 0.9)
      ctx.stroke()
    }
  }
  drawDots(ctx, x + lineGap * 0.2, y, dots, color, lineGap)
}

function drawFermata(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  color: string,
): void {
  ctx.strokeStyle = color
  ctx.fillStyle = color
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.arc(x, y + 2, 9, Math.PI + 0.15, -0.15)
  ctx.stroke()
  ctx.beginPath()
  ctx.arc(x, y + 5, 2.2, 0, Math.PI * 2)
  ctx.fill()
}

function drawRamp(
  ctx: CanvasRenderingContext2D,
  x0: number,
  x1: number,
  y: number,
  kind: 'rit' | 'accel',
  color: string,
): void {
  const left = Math.min(x0, x1)
  const right = Math.max(x0, x1)
  ctx.strokeStyle = color
  ctx.fillStyle = color
  ctx.lineWidth = 1.25
  ctx.setLineDash([5, 4])
  ctx.beginPath()
  ctx.moveTo(left, y)
  ctx.lineTo(right, y)
  ctx.stroke()
  ctx.setLineDash([])
  // End brackets
  ctx.beginPath()
  ctx.moveTo(left, y - 5)
  ctx.lineTo(left, y + 5)
  ctx.moveTo(right, y - 5)
  ctx.lineTo(right, y + 5)
  ctx.stroke()
  ctx.font = '600 11px system-ui, sans-serif'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'bottom'
  ctx.fillText(kind === 'rit' ? 'rit.' : 'accel.', left + 4, y - 3)
}

function drawEngraving(
  ctx: CanvasRenderingContext2D,
  engraved: EngravedScore,
  originX: number,
  originY: number,
  lineGap: number,
  viewLeft: number,
  viewRight: number,
): void {
  const sx = (x: number) => originX + x
  const sy = (y: number) => originY + y
  const inView = (x: number) => x >= viewLeft - 40 && x <= viewRight + 40

  for (const ramp of engraved.ramps) {
    const x0 = sx(ramp.x0)
    const x1 = sx(ramp.x1)
    if (Math.max(x0, x1) < viewLeft - 20 || Math.min(x0, x1) > viewRight + 20) continue
    drawRamp(ctx, x0, x1, sy(ramp.y), ramp.kind, '#5a554c')
  }

  for (const f of engraved.fermatas) {
    const x = sx(f.x)
    if (!inView(x)) continue
    drawFermata(ctx, x, sy(f.y), '#1a1a1a')
  }

  // Ledger lines
  for (const h of engraved.heads) {
    const x = sx(h.x)
    if (!inView(x)) continue
    ctx.strokeStyle = h.color
    ctx.lineWidth = 1.1
    for (const ly of h.ledgerYs) {
      const y = sy(ly)
      ctx.beginPath()
      ctx.moveTo(x - lineGap * 0.85, y + 0.5)
      ctx.lineTo(x + lineGap * 0.85, y + 0.5)
      ctx.stroke()
    }
  }

  for (const t of engraved.ties) {
    const x0 = sx(t.x0)
    const x1 = sx(t.x1)
    if (x1 < viewLeft - 20 || x0 > viewRight + 20) continue
    const y = sy(t.y)
    const midX = (x0 + x1) / 2
    const bulge = Math.min(14, Math.abs(x1 - x0) * 0.2 + 4) * (t.up ? -1 : 1)
    ctx.strokeStyle = t.color
    ctx.lineWidth = 1.35
    ctx.beginPath()
    ctx.moveTo(x0, y)
    ctx.quadraticCurveTo(midX, y + bulge, x1, y)
    ctx.stroke()
  }

  for (const s of engraved.stems) {
    const x = sx(s.x)
    if (!inView(x)) continue
    ctx.strokeStyle = s.color
    ctx.lineWidth = 1.35
    ctx.beginPath()
    ctx.moveTo(x + 0.5, sy(s.y0))
    ctx.lineTo(x + 0.5, sy(s.y1))
    ctx.stroke()
  }

  for (const b of engraved.beams) {
    const x0 = sx(b.x0)
    const x1 = sx(b.x1)
    if (x1 < viewLeft - 20 || x0 > viewRight + 20) continue
    const y0 = sy(b.y0)
    const y1 = sy(b.y1)
    const thick = Math.max(2.2, lineGap * 0.32)
    ctx.strokeStyle = b.color
    ctx.lineWidth = thick
    ctx.lineCap = 'butt'
    ctx.beginPath()
    ctx.moveTo(x0, y0)
    ctx.lineTo(x1, y1)
    ctx.stroke()
  }

  for (const f of engraved.flags) {
    const x = sx(f.x)
    if (!inView(x)) continue
    drawFlags(ctx, x, sy(f.y), f.up, f.count, f.color, lineGap)
  }

  for (const h of engraved.heads) {
    const x = sx(h.x)
    if (!inView(x)) continue
    if (h.accidental) {
      drawAccidental(ctx, h.accidental, x - lineGap * 1.15, sy(h.y), h.color, lineGap)
    }
    drawNoteHead(ctx, x, sy(h.y), h.filled, h.color, lineGap)
    drawDots(ctx, x, sy(h.y), h.dots, h.color, lineGap)
  }

  for (const r of engraved.rests) {
    const x = sx(r.x)
    if (!inView(x)) continue
    drawRest(ctx, x, sy(r.y), r.type, r.dots, '#444', lineGap)
  }

  for (const ly of engraved.lyrics) {
    const x = sx(ly.x)
    if (!inView(x)) continue
    ctx.fillStyle = '#222'
    ctx.font = '600 12px "Segoe UI", system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(ly.text, x, sy(ly.y))
  }
}

/** Paint the continuous horizontal sheet. */
export function drawSheetScore(
  ctx: CanvasRenderingContext2D,
  opts: DrawSheetOpts,
): void {
  const {
    layout,
    cssW,
    cssH,
    scrollX,
    scrollY,
    pxPerBeat,
    playheadTick,
    lengthTicks,
  } = opts
  const accent = opts.accent ?? '#c45c26'
  const ink = '#1a1a1a'
  const muted = '#8a8680'
  const paper = '#f7f4ee'
  const { marginLeft, rulerH } = layout
  const lineGap = layout.staves[0]?.lineGap ?? 8

  ctx.save()
  ctx.fillStyle = paper
  ctx.fillRect(0, 0, cssW, cssH)

  // Ruler background
  ctx.fillStyle = '#efebe3'
  ctx.fillRect(0, 0, cssW, rulerH)
  ctx.strokeStyle = '#d4cfc4'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(0, rulerH + 0.5)
  ctx.lineTo(cssW, rulerH + 0.5)
  ctx.stroke()

  const contentOriginY = rulerH - scrollY
  const musicLeft = marginLeft

  const xAtTick = (tick: number) =>
    musicLeft + ticksToPx(tick, pxPerBeat) - scrollX

  // --- Scrolling music region (clipped right of sticky margin) ---
  ctx.save()
  ctx.beginPath()
  ctx.rect(musicLeft, 0, Math.max(0, cssW - musicLeft), cssH)
  ctx.clip()

  // Beat lines
  ctx.strokeStyle = 'rgba(0,0,0,0.06)'
  ctx.lineWidth = 1
  for (const t of layout.beatTicksList) {
    const x = xAtTick(t)
    if (x < musicLeft - 1 || x > cssW + 1) continue
    ctx.beginPath()
    ctx.moveTo(x + 0.5, rulerH)
    ctx.lineTo(x + 0.5, cssH)
    ctx.stroke()
  }

  // Staff lines + per-staff barlines
  for (const staff of layout.staves) {
    const top = contentOriginY + staff.topY
    const ys = staffLineYs(top, staff.lineGap)
    ctx.strokeStyle = ink
    ctx.lineWidth = 1.15
    for (const ly of ys) {
      if (ly < rulerH - 2 || ly > cssH + 2) continue
      ctx.beginPath()
      ctx.moveTo(musicLeft, ly + 0.5)
      ctx.lineTo(cssW, ly + 0.5)
      ctx.stroke()
    }

    const staffBottom = ys[4]!
    for (const t of layout.barTicks) {
      const x = xAtTick(t)
      if (x < musicLeft - 1 || x > cssW + 1) continue
      ctx.strokeStyle = ink
      ctx.lineWidth = t === 0 || t === lengthTicks ? 1.75 : 1.25
      ctx.beginPath()
      ctx.moveTo(x + 0.5, ys[0]!)
      ctx.lineTo(x + 0.5, staffBottom)
      ctx.stroke()
    }
  }

  // Notes / rests / beams
  if (opts.engraved) {
    drawEngraving(
      ctx,
      opts.engraved,
      musicLeft - scrollX,
      contentOriginY,
      lineGap,
      musicLeft,
      cssW,
    )
  }

  // Measure numbers in ruler
  ctx.fillStyle = muted
  ctx.font = '600 11px system-ui, sans-serif'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  for (let i = 0; i < layout.barTicks.length - 1; i++) {
    const t = layout.barTicks[i]!
    const x = xAtTick(t)
    if (x < musicLeft - 8 || x > cssW) continue
    ctx.fillText(String(i + 1), x + 4, rulerH / 2)
  }

  // Playhead through music
  const phX = xAtTick(playheadTick)
  if (phX >= musicLeft - 2 && phX <= cssW + 2) {
    ctx.strokeStyle = accent
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(phX + 0.5, 0)
    ctx.lineTo(phX + 0.5, cssH)
    ctx.stroke()
  }
  ctx.restore()

  // --- Sticky left margin (clefs, names, bracket) ---
  ctx.fillStyle = paper
  ctx.fillRect(0, rulerH, marginLeft, cssH - rulerH)
  ctx.strokeStyle = '#d4cfc4'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(marginLeft + 0.5, rulerH)
  ctx.lineTo(marginLeft + 0.5, cssH)
  ctx.stroke()

  const upper = layout.staves.find((s) => s.kind === 'upper')
  const lower = layout.staves.find((s) => s.kind === 'lower')
  if (upper && lower) {
    const top = contentOriginY + upper.topY
    const bottom = contentOriginY + lower.topY + lower.height
    drawChoralBracket(ctx, 6, top, bottom, ink)
  }

  for (const staff of layout.staves) {
    const top = contentOriginY + staff.topY
    const ys = staffLineYs(top, staff.lineGap)
    ctx.strokeStyle = ink
    ctx.lineWidth = 1.15
    for (const ly of ys) {
      ctx.beginPath()
      ctx.moveTo(28, ly + 0.5)
      ctx.lineTo(marginLeft, ly + 0.5)
      ctx.stroke()
    }
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(28.5, ys[0]!)
    ctx.lineTo(28.5, ys[4]!)
    ctx.stroke()

    drawClef(ctx, staff.clef, 52, top, staff.lineGap, ink)

    ctx.fillStyle = muted
    ctx.font = '600 10px system-ui, sans-serif'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'top'
    const labelX = 8
    let labelY = top - 14
    if (staff.kind === 'solo') labelY = top - 12
    for (const label of staff.labels) {
      ctx.fillText(label, labelX, labelY)
      labelY += 11
    }
  }

  // Playhead triangle in ruler
  if (phX >= -4 && phX <= cssW + 4) {
    ctx.fillStyle = accent
    ctx.beginPath()
    ctx.moveTo(phX, rulerH)
    ctx.lineTo(phX - 6, 4)
    ctx.lineTo(phX + 6, 4)
    ctx.closePath()
    ctx.fill()
  }

  ctx.restore()
}
