/**
 * Waveform layout — ONE time→x timeline for bars, playhead, loop band, and brackets.
 *
 * `gutterPad` is the track inset: t=0 / t=duration map to the gutter borders so the
 * waveform and playhead stay inside the track (never drawn in the cream gutters).
 *
 * Loop edge = inner edge of each bracket’s full graphic bounding box (grip + stem + L-arms):
 *   left bracket  → right edge of bbox
 *   right bracket → left edge of bbox
 * Stem/grip are centered; L-arms open toward the loop region and end on the loop edge.
 */

/** Vertical stem thickness (px). */
export const BRACKET_STEM_W = 5
/** Grip width; centered on the stem. */
export const BRACKET_GRIP_W = 14
/** Horizontal L-arm length from stem center toward the loop region. */
export const BRACKET_ARM = 14
/** L-stroke width — half of this extends past the arm tip into the bbox. */
export const BRACKET_LINE_W = 4

/**
 * Distance from stem/grip center to the loop-edge (inner bbox face).
 * Arms end at center±arm; stroke half-width finishes the bbox.
 */
export const BRACKET_INNER_EXTENT = BRACKET_ARM + BRACKET_LINE_W / 2

/** Distance from stem center outward (into gutter) to the outer bbox face. */
export const BRACKET_OUTER_EXTENT = BRACKET_GRIP_W / 2

/** Full bracket width along X. */
export const BRACKET_TOTAL_W = BRACKET_INNER_EXTENT + BRACKET_OUTER_EXTENT

/** Gutter must fit the outward half of the bracket at the track edge. */
export const MIN_GUTTER_PAD = Math.ceil(BRACKET_TOTAL_W) + 2

/** @deprecated use BRACKET_TOTAL_W / 2-ish helpers; kept for older tests */
export const BRACKET_OUTWARD = BRACKET_TOTAL_W

/** Minimum loop region length (seconds). */
export const MIN_LOOP_REGION_SEC = 0.5

/** Effective minimum gap for a given track length (short clips use full duration). */
export function minLoopGapSec(duration: number): number {
  if (duration <= 0) return MIN_LOOP_REGION_SEC
  return Math.min(MIN_LOOP_REGION_SEC, duration)
}

export function guttersForWidth(w: number): number {
  let gutterPad: number
  if (w < 420) gutterPad = 24
  else if (w < 720) gutterPad = 32
  else gutterPad = 42
  return Math.max(MIN_GUTTER_PAD, gutterPad)
}

export type WaveformLayout = {
  w: number
  h: number
  gutterPad: number
  trackInner: number
}

export function waveformLayout(w: number, h: number): WaveformLayout | null {
  if (w < 2 || h < 2) return null
  const gutterPad = guttersForWidth(w)
  return {
    w,
    h,
    gutterPad,
    trackInner: Math.max(1, w - gutterPad * 2),
  }
}

export function clampTime(t: number, duration: number): number {
  if (duration <= 0) return 0
  return Math.min(duration, Math.max(0, t))
}

/** Pixel X for a time — shared by bars, playhead, loop band, and bracket loop-edges. */
export function timeToX(
  t: number,
  duration: number,
  gutterPad: number,
  trackInner: number,
): number {
  if (duration <= 0) return gutterPad
  return gutterPad + (clampTime(t, duration) / duration) * trackInner
}

/** Time at pixel X on the waveform track. */
export function xToTime(
  x: number,
  duration: number,
  gutterPad: number,
  trackInner: number,
): number {
  if (duration <= 0) return 0
  return clampTime(((x - gutterPad) / trackInner) * duration, duration)
}

export function barCountFor(peaksLength: number, trackInner: number): number {
  if (peaksLength <= 0) return 0
  return Math.min(peaksLength, Math.max(40, Math.floor(trackInner / 2.5)))
}

/** At any time t, bar-center x and loop-edge x must match (regression guard). */
export function barCenterX(
  barIndex: number,
  barCount: number,
  gutterPad: number,
  trackInner: number,
): number {
  const mid = (barIndex + 0.5) / barCount
  return gutterPad + mid * trackInner
}

/** Stem/grip center X for a bracket whose inner bbox face is at loopEdgeX. */
export function bracketCenterX(loopEdgeX: number, side: 'left' | 'right'): number {
  return side === 'left'
    ? loopEdgeX - BRACKET_INNER_EXTENT
    : loopEdgeX + BRACKET_INNER_EXTENT
}

/** Visual hit-center X for a loop bracket (stem / grip center). */
export function bracketHitX(loopEdgeX: number, side: 'left' | 'right'): number {
  return bracketCenterX(loopEdgeX, side)
}

/** Convert a pointer X on a bracket into the loop-edge X that bracket owns. */
export function loopEdgeFromPointerX(pointerX: number, side: 'left' | 'right'): number {
  return side === 'left'
    ? pointerX + BRACKET_INNER_EXTENT
    : pointerX - BRACKET_INNER_EXTENT
}

/** Horizontal span of a bracket graphic for clip checks. */
export function bracketSpan(loopEdgeX: number, side: 'left' | 'right'): { left: number; right: number } {
  if (side === 'left') {
    return { left: loopEdgeX - BRACKET_TOTAL_W, right: loopEdgeX }
  }
  return { left: loopEdgeX, right: loopEdgeX + BRACKET_TOTAL_W }
}

/** True when both default bracket positions fit inside [0, w]. */
export function bracketsFitInWidth(w: number, gutterPad: number): boolean {
  const left = bracketSpan(gutterPad, 'left')
  const right = bracketSpan(w - gutterPad, 'right')
  return left.left >= 0 && right.right <= w
}

export function clampMarkA(t: number, markB: number, duration: number): number {
  if (duration <= 0) return 0
  const gap = minLoopGapSec(duration)
  return Math.min(clampTime(t, duration), Math.max(0, markB - gap))
}

export function clampMarkB(t: number, markA: number, duration: number): number {
  if (duration <= 0) return 0
  const gap = minLoopGapSec(duration)
  return Math.max(Math.min(duration, clampTime(t, duration)), Math.min(duration, markA + gap))
}
