/**
 * Vertical staff stack + horizontal bar/beat tick lists for the sheet view.
 */
import type { TagRollTimeSignature } from '../types'
import { TAG_ROLL_PPQ } from '../types'
import { beatTicks, measureTicks } from '../tempoMap'
import type { SheetStaffAssignment, SheetScoreLayout, SheetStaffLayout } from './types'
import {
  SHEET_BOTTOM_PAD,
  SHEET_EXPR_BAND,
  SHEET_LINE_GAP,
  SHEET_LYRIC_BAND,
  SHEET_MARGIN_LEFT,
  SHEET_RULER_H,
  SHEET_SOLO_GAP,
  SHEET_STAFF_GAP,
  SHEET_TOP_PAD,
} from './types'

function lyricBandFor(kind: SheetStaffLayout['kind']): number {
  // Lead lyrics under upper; solo parts may carry their own lyrics.
  return kind === 'upper' || kind === 'solo' ? SHEET_LYRIC_BAND : 0
}

export function layoutSheetScore(opts: {
  assignment: SheetStaffAssignment
  lengthTicks: number
  timeSignature: TagRollTimeSignature
  ppq?: number
  lineGap?: number
}): SheetScoreLayout {
  const ppq = opts.ppq ?? TAG_ROLL_PPQ
  const lineGap = opts.lineGap ?? SHEET_LINE_GAP
  const staffH = lineGap * 4
  const mLen = measureTicks(opts.timeSignature, ppq)
  const bLen = beatTicks(opts.timeSignature, ppq)
  const length = Math.max(mLen, opts.lengthTicks)

  const exprBandTop = SHEET_TOP_PAD
  const exprBandHeight = SHEET_EXPR_BAND
  const staves: SheetStaffLayout[] = []
  let y = exprBandTop + exprBandHeight
  for (let i = 0; i < opts.assignment.staves.length; i++) {
    const s = opts.assignment.staves[i]!
    if (i > 0) {
      const prev = opts.assignment.staves[i - 1]!
      const prevBand = lyricBandFor(prev.kind)
      y += prevBand
      y += prev.kind !== 'solo' && s.kind !== 'solo' ? SHEET_STAFF_GAP : SHEET_SOLO_GAP
    }
    const lyricBand = lyricBandFor(s.kind)
    staves.push({
      id: s.id,
      kind: s.kind,
      clef: s.clef,
      labels: s.labels,
      voices: s.voices,
      topY: y,
      lineGap,
      height: staffH,
      lyricBand,
    })
    y += staffH
  }
  if (staves.length) {
    y += staves[staves.length - 1]!.lyricBand
  }

  const barTicks: number[] = []
  for (let t = 0; t <= length; t += mLen) barTicks.push(t)
  if (barTicks[barTicks.length - 1] !== length) barTicks.push(length)

  const beatTicksList: number[] = []
  const barSet = new Set(barTicks)
  for (let t = bLen; t < length; t += bLen) {
    if (!barSet.has(t)) beatTicksList.push(t)
  }

  return {
    rulerH: SHEET_RULER_H,
    marginLeft: SHEET_MARGIN_LEFT,
    staves,
    contentHeight: y + SHEET_BOTTOM_PAD,
    barTicks,
    beatTicksList,
    exprBandTop,
    exprBandHeight,
  }
}
