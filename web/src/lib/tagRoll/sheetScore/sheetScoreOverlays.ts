/**
 * Post-draw SVG overlays for the VexFlow sheet (handoffs, crossover Xs).
 */
import type { StaveNote } from 'vexflow'
import type { resolveMelodyPasses } from '../melodyPass'

/** Display-scale the VexFlow SVG so glyphs track stave geometry (viewBox zoom). */
export function applySvgSizeScale(
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

export type OverlayPlaced = {
  tick: number
  note: StaveNote
  preferAnchor: boolean
  sourceNoteId?: string
}

export function noteheadPoint(note: StaveNote): { x: number; y: number } | null {
  try {
    const ys = note.getYs()
    const y = ys[0]
    const x = note.getAbsoluteX()
    if (!Number.isFinite(x) || y == null || !Number.isFinite(y)) return null
    return { x, y }
  } catch {
    return null
  }
}

/** Dashed line from the last melody note to the note where another part takes the tune. */
export function drawMelodyHandoffLines(
  host: HTMLElement,
  placed: readonly OverlayPlaced[],
  passes: ReturnType<typeof resolveMelodyPasses>,
): void {
  const svg = host.querySelector('svg')
  if (!svg || !passes.length) return
  const byNote = new Map<string, OverlayPlaced>()
  for (const p of placed) {
    if (!p.sourceNoteId || byNote.has(p.sourceNoteId)) continue
    byNote.set(p.sourceNoteId, p)
  }
  const ns = 'http://www.w3.org/2000/svg'
  for (const pass of passes) {
    const from = byNote.get(pass.from.id)
    const to = byNote.get(pass.to.id)
    if (!from || !to) continue
    const a = noteheadPoint(from.note)
    const b = noteheadPoint(to.note)
    if (!a || !b) continue
    // A handoff on the next system or page would slash across the gap.
    if (Math.abs(a.y - b.y) > 280) continue
    const line = document.createElementNS(ns, 'line')
    line.setAttribute('x1', String(a.x))
    line.setAttribute('y1', String(a.y))
    line.setAttribute('x2', String(b.x))
    line.setAttribute('y2', String(b.y))
    line.setAttribute('stroke', '#1d6a9f')
    line.setAttribute('stroke-width', '1.4')
    line.setAttribute('stroke-dasharray', '5 4')
    line.setAttribute('stroke-linecap', 'round')
    line.setAttribute('fill', 'none')
    svg.appendChild(line)
  }
}

function staffTopY(note: StaveNote): number | null {
  try {
    const stave = note.getStave()
    if (!stave) return null
    const y = stave.getYForLine(0)
    return Number.isFinite(y) ? y : null
  } catch {
    return null
  }
}

/** Multiplication sign (U+00D7), not alphabetic X. */
const CROSSOVER_MARK = '\u00D7'

function appendCrossoverMark(svg: SVGSVGElement, cx: number, cy: number): void {
  const ns = 'http://www.w3.org/2000/svg'
  const text = document.createElementNS(ns, 'text')
  text.setAttribute('class', 'sheet-crossover-x')
  text.setAttribute('data-sheet-crossover', '1')
  text.setAttribute('x', String(cx))
  text.setAttribute('y', String(cy))
  text.setAttribute('text-anchor', 'middle')
  text.setAttribute('dominant-baseline', 'central')
  text.setAttribute('fill', '#111')
  text.setAttribute('font-size', '14')
  text.setAttribute('font-family', 'serif')
  text.textContent = CROSSOVER_MARK
  svg.appendChild(text)
}

/**
 * Draw a × above the staff over each same-staff crossover note
 * (lead above tenor, or bass above bari).
 */
export function drawCrossoverMarks(
  host: HTMLElement,
  placed: readonly OverlayPlaced[],
  crossoverNoteIds: ReadonlySet<string>,
): void {
  const svg = host.querySelector('svg')
  if (!svg || !crossoverNoteIds.size) return
  const seen = new Set<string>()
  for (const p of placed) {
    const id = p.sourceNoteId
    if (!id || !crossoverNoteIds.has(id) || seen.has(id)) continue
    seen.add(id)
    const head = noteheadPoint(p.note)
    if (!head) continue
    const top = staffTopY(p.note)
    const above = top == null ? head.y : Math.min(head.y, top)
    appendCrossoverMark(svg, head.x, above - 10)
  }
}
