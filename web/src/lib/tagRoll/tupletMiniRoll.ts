/**
 * Geometry + hit-tests for the tuplet draft mini-roll (slot columns × MIDI rows).
 */
import { TAG_ROLL_MIDI_MAX, TAG_ROLL_MIDI_MIN } from './types'
import { midiToY, yToMidi } from './normalize'

export const TUPLET_MINI_GUTTER_W = 36
export const TUPLET_MINI_HEADER_H = 22
export const TUPLET_MINI_CELL_H = 14

export type TupletMiniLayout = {
  midiMin: number
  midiMax: number
  cellH: number
  gutterW: number
  headerH: number
  slotCount: number
  width: number
  height: number
  /** Content height of pitch plane (excluding header). */
  bodyH: number
  slotW: number
}

export function tupletMiniMidiRange(midis: readonly (number | null | undefined)[]): {
  midiMin: number
  midiMax: number
} {
  let lo = TAG_ROLL_MIDI_MIN
  let hi = TAG_ROLL_MIDI_MAX
  // Prefer full tag-roll range for look parity; still expand if out of range.
  for (const m of midis) {
    if (m == null) continue
    lo = Math.min(lo, m)
    hi = Math.max(hi, m)
  }
  return {
    midiMin: Math.max(24, Math.min(lo, TAG_ROLL_MIDI_MIN)),
    midiMax: Math.min(96, Math.max(hi, TAG_ROLL_MIDI_MAX)),
  }
}

export function buildTupletMiniLayout(opts: {
  slotCount: number
  width: number
  midiMin?: number
  midiMax?: number
  cellH?: number
}): TupletMiniLayout {
  const slotCount = Math.max(1, Math.round(opts.slotCount))
  const midiMin = opts.midiMin ?? TAG_ROLL_MIDI_MIN
  const midiMax = opts.midiMax ?? TAG_ROLL_MIDI_MAX
  const cellH = opts.cellH ?? TUPLET_MINI_CELL_H
  const gutterW = TUPLET_MINI_GUTTER_W
  const headerH = TUPLET_MINI_HEADER_H
  const bodyH = (midiMax - midiMin + 1) * cellH
  const width = Math.max(gutterW + 40, opts.width)
  const slotW = Math.max(8, (width - gutterW) / slotCount)
  return {
    midiMin,
    midiMax,
    cellH,
    gutterW,
    headerH,
    slotCount,
    width,
    height: headerH + bodyH,
    bodyH,
    slotW,
  }
}

export function slotIndexAtX(layout: TupletMiniLayout, x: number): number | null {
  if (x < layout.gutterW) return null
  const i = Math.floor((x - layout.gutterW) / layout.slotW)
  if (i < 0 || i >= layout.slotCount) return null
  return i
}

export function midiAtY(layout: TupletMiniLayout, y: number, scrollY: number): number | null {
  const bodyY = y - layout.headerH + scrollY
  if (bodyY < 0 || bodyY >= layout.bodyH) return null
  const midi = yToMidi(bodyY, layout.cellH, layout.midiMax)
  if (midi < layout.midiMin || midi > layout.midiMax) return null
  return midi
}

export function slotRect(
  layout: TupletMiniLayout,
  slotIndex: number,
  midi: number,
  scrollY: number,
): { x: number; y: number; w: number; h: number } {
  const x = layout.gutterW + slotIndex * layout.slotW
  const y = layout.headerH + midiToY(midi, layout.cellH, layout.midiMax) - scrollY
  return { x, y, w: layout.slotW, h: layout.cellH }
}

/** ScrollY so `midi` is roughly centered in the visible body. */
export function scrollYToCenterMidi(
  layout: TupletMiniLayout,
  midi: number,
  viewportBodyH: number,
): number {
  const midY = midiToY(midi, layout.cellH, layout.midiMax) + layout.cellH / 2
  const maxScroll = Math.max(0, layout.bodyH - viewportBodyH)
  return Math.max(0, Math.min(maxScroll, midY - viewportBodyH / 2))
}

/**
 * Move a sounding slot to another column. Swaps midis/lyrics when the target
 * already has a pitch (keeps column count stable).
 */
export function moveSlotBetweenColumns<T extends { midi: number | null; lyric?: string }>(
  slots: readonly T[],
  from: number,
  to: number,
): T[] {
  if (from === to || from < 0 || to < 0 || from >= slots.length || to >= slots.length) {
    return slots.slice() as T[]
  }
  const next = slots.slice() as T[]
  const a = next[from]!
  const b = next[to]!
  next[from] = b
  next[to] = a
  return next
}
