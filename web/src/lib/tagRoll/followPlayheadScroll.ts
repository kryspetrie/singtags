/**
 * Keep Tag Roll / sheet playhead in the visible viewport via jump-scroll.
 */
import { ticksToPx } from './normalize'
import { TAG_ROLL_PPQ } from './types'

export type FollowPlayheadContentScrollOpts = {
  /** Playhead X in content coordinates (not viewport-relative). */
  playheadContentX: number
  scrollX: number
  viewportW: number
  /** Full scrollable content width (px). */
  contentW: number
  /** Inset from left/right edges before jumping (px). */
  marginPx?: number
  /**
   * Where to place the playhead in the viewport after a jump (0 = left, 1 = right).
   * Defaults to the left margin (playback-style: keep upcoming chart visible).
   * Transport seeks use ~0.35 so the cursor lands inset, not on the edge.
   */
  focusRatio?: number
}

export type FollowPlayheadScrollOpts = {
  playheadTick: number
  scrollX: number
  cellW: number
  viewportW: number
  lengthTicks: number
  ppq?: number
  marginPx?: number
  focusRatio?: number
}

/**
 * If the playhead is outside the visible band, return a new scrollX that
 * places it at the focus inset (jump, not smooth). Null = no change.
 */
export function followPlayheadContentScrollX(
  opts: FollowPlayheadContentScrollOpts,
): number | null {
  const viewportW = Math.max(1, opts.viewportW)
  const margin = Math.max(8, Math.min(opts.marginPx ?? 48, viewportW * 0.25))
  const phX = opts.playheadContentX - opts.scrollX
  if (phX >= margin && phX <= viewportW - margin) return null

  const maxScroll = Math.max(0, opts.contentW - viewportW)
  const focus =
    opts.focusRatio != null
      ? Math.max(margin, Math.min(viewportW - margin, opts.focusRatio * viewportW))
      : margin
  const target = opts.playheadContentX - focus
  const next = Math.max(0, Math.min(maxScroll, target))
  return Math.abs(next - opts.scrollX) < 0.5 ? null : next
}

/**
 * Piano-roll helper: map ticks → content X, then jump-scroll if needed.
 */
export function followPlayheadScrollX(opts: FollowPlayheadScrollOpts): number | null {
  const ppq = opts.ppq ?? TAG_ROLL_PPQ
  return followPlayheadContentScrollX({
    playheadContentX: ticksToPx(Math.max(0, opts.playheadTick), opts.cellW, ppq),
    scrollX: opts.scrollX,
    viewportW: opts.viewportW,
    contentW: ticksToPx(Math.max(0, opts.lengthTicks), opts.cellW, ppq),
    marginPx: opts.marginPx,
    focusRatio: opts.focusRatio,
  })
}
