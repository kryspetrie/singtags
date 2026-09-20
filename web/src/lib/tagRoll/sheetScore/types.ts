/**
 * Continuous horizontal barbershop sheet layout (view-only).
 */
import type { TagRollClefFamily, TagRollPart } from '../types'

export type SheetStaffKind = 'upper' | 'lower' | 'solo'

/** Clef glyph drawn at the sticky left margin. */
export type SheetClefKind =
  | 'treble'
  | 'treble8vb' // TTBB upper: 8 below
  | 'bass'
  | 'bass8va' // SSAA lower: 8 above

export type SheetVoiceRole = 'tenor' | 'lead' | 'bari' | 'bass' | 'solo'

export type SheetVoiceSlot = {
  partId: string
  partName: string
  color: string
  /** Voice 1 = stems/beams up; voice 2 = down. */
  voice: 1 | 2
  role: SheetVoiceRole
}

export type SheetStaffSpec = {
  id: string
  kind: SheetStaffKind
  clef: SheetClefKind
  /** Labels shown in the sticky margin (upper/lower show both voices). */
  labels: string[]
  voices: SheetVoiceSlot[]
}

export type SheetStaffAssignment = {
  clefFamily: TagRollClefFamily
  staves: SheetStaffSpec[]
}

export type SheetStaffLayout = {
  id: string
  kind: SheetStaffKind
  clef: SheetClefKind
  labels: string[]
  voices: SheetVoiceSlot[]
  /** Y of the top staff line (content coords, below ruler). */
  topY: number
  /** Distance between adjacent staff lines. */
  lineGap: number
  /** Height from top line to bottom line (= 4 * lineGap). */
  height: number
  /** Reserved px below this staff for lyrics (0 if none). */
  lyricBand: number
}

export type SheetScoreLayout = {
  rulerH: number
  /** Sticky left column width (clefs + names). */
  marginLeft: number
  staves: SheetStaffLayout[]
  /** Total content height including padding below last staff. */
  contentHeight: number
  /** Barline tick positions (including 0 and end). */
  barTicks: number[]
  /** Lighter beat ticks (excluding barlines). */
  beatTicksList: number[]
  /** Y band above first staff for expression marks (content coords). */
  exprBandTop: number
  exprBandHeight: number
}

export const SHEET_LINE_GAP = 8
export const SHEET_STAFF_GAP = 40
export const SHEET_SOLO_GAP = 32
/** Vertical room below a staff for lyric text. */
export const SHEET_LYRIC_BAND = 22
export const SHEET_MARGIN_LEFT = 96
export const SHEET_RULER_H = 28
export const SHEET_TOP_PAD = 20
export const SHEET_BOTTOM_PAD = 24
/** Space above the top staff for fermata / rit / accel marks. */
export const SHEET_EXPR_BAND = 28
