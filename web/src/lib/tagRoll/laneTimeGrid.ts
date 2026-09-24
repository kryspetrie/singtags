/**
 * Shared measure/beat grid for Tag Studio bottom lanes (Mods, Coach, Declared, Detected).
 */
import { ticksToPx } from './normalize'
import { beatTicks, measureTicks } from './tempoMap'
import type { TagRollTimeSignature } from './types'

export type LaneTimeGridOpts = {
  scrollX: number
  cellW: number
  lengthTicks: number
  timeSignature: TagRollTimeSignature
  height: number
  width: number
  /** Measure line color (defaults to CSS --text via caller). */
  measureColor: string
  /** Beat line color (defaults to CSS --muted via caller). */
  beatColor: string
  measureAlpha?: number
  beatAlpha?: number
}

/** Paint vertical measure (strong) and beat (light) lines aligned to the piano roll. */
export function drawLaneTimeGrid(
  ctx: CanvasRenderingContext2D,
  opts: LaneTimeGridOpts,
): void {
  const mTicks = measureTicks(opts.timeSignature)
  const bTicks = beatTicks(opts.timeSignature)
  if (mTicks <= 0 || bTicks <= 0) return
  const ox = -opts.scrollX
  const cw = opts.cellW
  const measureAlpha = opts.measureAlpha ?? 0.55
  const beatAlpha = opts.beatAlpha ?? 0.28

  for (let t = 0; t <= opts.lengthTicks; t += bTicks) {
    const x = ox + ticksToPx(t, cw)
    if (x < -2 || x > opts.width + 2) continue
    const isMeasure = t % mTicks === 0
    if (isMeasure) {
      ctx.strokeStyle = opts.measureColor
      ctx.globalAlpha = measureAlpha
      ctx.lineWidth = 2
    } else {
      ctx.strokeStyle = opts.beatColor
      ctx.globalAlpha = beatAlpha
      ctx.lineWidth = 1
    }
    ctx.beginPath()
    ctx.moveTo(x + 0.5, 0)
    ctx.lineTo(x + 0.5, opts.height)
    ctx.stroke()
    ctx.globalAlpha = 1
  }
}
