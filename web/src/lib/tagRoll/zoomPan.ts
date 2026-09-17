/**
 * Angle-weighted multitouch resize for Tag Roll cellW / cellH.
 * Mostly-horizontal pinch → width; mostly-vertical → height; diagonal → both.
 */
export type TagRollZoomState = {
  cellW: number
  cellH: number
}

export function pointerDistance(
  a: { x: number; y: number },
  b: { x: number; y: number },
): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  return Math.hypot(dx, dy)
}

/** Angle of the segment in radians, 0 = horizontal, π/2 = vertical. */
export function pointerAngleAbs(
  a: { x: number; y: number },
  b: { x: number; y: number },
): number {
  const dx = Math.abs(b.x - a.x)
  const dy = Math.abs(b.y - a.y)
  if (dx < 1e-6 && dy < 1e-6) return Math.PI / 4
  return Math.atan2(dy, dx)
}

/**
 * Mix horizontal vs vertical scale from contact angle.
 * weightW = cos²(θ), weightH = sin²(θ).
 */
export function applyAngleZoom(opts: {
  start: TagRollZoomState
  startDist: number
  currentDist: number
  angleRad: number
  minW: number
  maxW: number
  minH: number
  maxH: number
}): TagRollZoomState {
  const { start, startDist, currentDist, angleRad, minW, maxW, minH, maxH } = opts
  if (!(startDist > 1)) return { ...start }
  const scale = currentDist / startDist
  const c = Math.cos(angleRad)
  const s = Math.sin(angleRad)
  const wW = c * c
  const wH = s * s
  const scaleW = 1 + (scale - 1) * wW
  const scaleH = 1 + (scale - 1) * wH
  return {
    cellW: clamp(Math.round(start.cellW * scaleW), minW, maxW),
    cellH: clamp(Math.round(start.cellH * scaleH), minH, maxH),
  }
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n))
}
