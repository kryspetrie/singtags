/**
 * User-facing labels for melody note weight (Approach Two PMN/SMN).
 * Keep `pmn` / `smn` ids in data; never show those acronyms in primary UI.
 */
import type { MelodyRole } from './types'

/** Short chip / lane mark. */
export function melodyRoleShortLabel(role: MelodyRole): string {
  if (role === 'pmn') return 'Strong'
  if (role === 'smn') return 'Passing'
  return '?'
}

/** Button / detail label. */
export function melodyRoleLongLabel(role: MelodyRole): string {
  if (role === 'pmn') return 'Strong — home tone'
  if (role === 'smn') return 'Passing — connective'
  return 'Unlabeled'
}

/** Coach-lane one/two-letter mark (legacy; prefer border chrome on roll). */
export function melodyRoleLaneMark(role: MelodyRole): string {
  if (role === 'pmn') return 'St'
  if (role === 'smn') return 'Pa'
  return ''
}

/** Strong = green; Passing = yellow. */
export function melodyRoleBorderColor(role: 'pmn' | 'smn'): string {
  return role === 'pmn' ? 'rgba(28, 130, 78, 1)' : 'rgba(230, 175, 20, 1)'
}

/** Melody / Lead cue. */
export const MELODY_PART_BORDER_COLOR = 'rgba(140, 16, 28, 1)'

/** Left-edge stripe widths (all piano-roll notes use this chrome). */
export const MELODY_ROLE_STRIPE_WIDTH = 4
export const MELODY_PART_STRIPE_WIDTH = 3

/** @deprecated Alias — prefer MELODY_ROLE_STRIPE_WIDTH. */
export const MELODY_ROLE_BORDER_WIDTH = MELODY_ROLE_STRIPE_WIDTH
/** @deprecated Alias — prefer MELODY_PART_STRIPE_WIDTH. */
export const MELODY_PART_BORDER_WIDTH = MELODY_PART_STRIPE_WIDTH
export const MELODY_ROLE_RING_GAP = 2

type BorderPaintCtx = Pick<CanvasRenderingContext2D, 'fillStyle' | 'fillRect'>

/**
 * Filled rectangular frame whose *inner* edge sits `pad` px outside the note box,
 * with `thickness` extending further outward (Coach lane / legacy).
 */
export function paintOutsetBorderFrame(
  ctx: BorderPaintCtx,
  x: number,
  y: number,
  w: number,
  h: number,
  pad: number,
  thickness: number,
  color: string,
): void {
  const t = Math.max(1, Math.round(thickness))
  if (w <= 0 || h <= 0 || t < 1) return
  const ix = x - pad
  const iy = y - pad
  const iw = w + pad * 2
  const ih = h + pad * 2
  const ox = ix - t
  const oy = iy - t
  const ow = iw + t * 2
  const oh = ih + t * 2
  ctx.fillStyle = color
  ctx.fillRect(ox, oy, ow, t)
  ctx.fillRect(ox, oy + oh - t, ow, t)
  ctx.fillRect(ox, oy, t, oh)
  ctx.fillRect(ox + ow - t, oy, t, oh)
}

/** @deprecated Prefer paintOutsetBorderFrame / left stripes. */
export function paintInsetBorderFrame(
  ctx: BorderPaintCtx,
  x: number,
  y: number,
  w: number,
  h: number,
  inset: number,
  thickness: number,
  color: string,
): void {
  const t = Math.max(1, Math.min(thickness, Math.floor(Math.min(w, h) / 2) - inset))
  if (t < 1 || w < inset * 2 + t * 2 || h < inset * 2 + t * 2) return
  const left = x + inset
  const top = y + inset
  const right = x + w - inset
  const bottom = y + h - inset
  const fw = right - left
  const fh = bottom - top
  ctx.fillStyle = color
  ctx.fillRect(left, top, fw, t)
  ctx.fillRect(left, bottom - t, fw, t)
  ctx.fillRect(left, top, t, fh)
  ctx.fillRect(right - t, top, t, fh)
}

/**
 * Role + melody chrome for a piano-roll note: left-edge stripes inside the box
 * (melody red outermost, Strong/Passing beside it). Same for every note.
 */
export function paintMelodyRoleBorders(
  ctx: BorderPaintCtx,
  opts: {
    x: number
    y: number
    w: number
    h: number
    role?: 'pmn' | 'smn' | null
    showMelody: boolean
    /** Ignored — left stripes are always used. */
    compact?: boolean
  },
): void {
  const { x, y, w, h, showMelody } = opts
  const role = opts.role === 'pmn' || opts.role === 'smn' ? opts.role : null
  if (!showMelody && !role) return

  const maxW = Math.max(2, Math.floor(w * 0.35))
  let cursor = x + 1
  const stripeH = Math.max(1, h - 2)
  if (showMelody) {
    const tw = Math.min(MELODY_PART_STRIPE_WIDTH, maxW)
    ctx.fillStyle = MELODY_PART_BORDER_COLOR
    ctx.fillRect(cursor, y + 1, tw, stripeH)
    cursor += tw
  }
  if (role) {
    const tw = Math.min(MELODY_ROLE_STRIPE_WIDTH, Math.max(2, maxW - (cursor - x)))
    ctx.fillStyle = melodyRoleBorderColor(role)
    ctx.fillRect(cursor, y + 1, tw, stripeH)
  }
}
