/**
 * Keep Tag Roll playhead in the visible viewport via jump-scroll.
 */
import { ticksToPx } from './normalize'
import { TAG_ROLL_PPQ } from './types'

export type FollowPlayheadScrollOpts = {
  playheadTick: number
  scrollX: number
  cellW: number
  viewportW: number
  lengthTicks: number
  ppq?: number
  /** Inset from left/right edges before jumping (px). */
  marginPx?: number
}

/**
 * If the playhead is outside the visible band, return a new scrollX that
 * places it near the left margin (jump, not smooth). Null = no change.
 */
export function followPlayheadScrollX(opts: FollowPlayheadScrollOpts): number | null {
  const viewportW = Math.max(1, opts.viewportW)
  const margin = Math.max(8, Math.min(opts.marginPx ?? 48, viewportW * 0.25))
  const ppq = opts.ppq ?? TAG_ROLL_PPQ
  const phX = ticksToPx(Math.max(0, opts.playheadTick), opts.cellW, ppq) - opts.scrollX
  if (phX >= margin && phX <= viewportW - margin) return null

  const contentW = ticksToPx(Math.max(0, opts.lengthTicks), opts.cellW, ppq)
  const maxScroll = Math.max(0, contentW - viewportW)
  const target = ticksToPx(Math.max(0, opts.playheadTick), opts.cellW, ppq) - margin
  const next = Math.max(0, Math.min(maxScroll, target))
  return Math.abs(next - opts.scrollX) < 0.5 ? null : next
}
