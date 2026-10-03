/**
 * Shared clamps and defaults for Tag Studio sheet engraving prefs.
 */
import type { TagRollViewPrefs } from './types'
import { TAG_ROLL_DEFAULT_VIEW } from './types'

/** Global measure / note-density multipliers. */
export const SHEET_MEASURE_SCALE_MIN = 0.35
export const SHEET_MEASURE_SCALE_MAX = 2.5

/** Equal-layout beat proportion (time → horizontal space). */
export const SHEET_BEAT_STRETCH_MIN = 0.65
export const SHEET_BEAT_STRETCH_MAX = 2.2

/** Fine-tune / primary control for space between grand-staff clefs. */
export const SHEET_STAVE_GAP_FINE_MIN = 0.4
export const SHEET_STAVE_GAP_FINE_MAX = 2.8

/** Vertical gap between wrapped systems (page layout). */
export const SHEET_SYSTEM_GAP_MIN = 0.35
export const SHEET_SYSTEM_GAP_MAX = 3

/** Page / strip margins in inches. */
export const SHEET_MARGIN_IN_MIN = 0.1
export const SHEET_MARGIN_IN_MAX = 2.5

/** Music notation scale (staff line spacing / glyphs). */
export const SHEET_ENGRAVING_SCALE_MIN = 0.55
export const SHEET_ENGRAVING_SCALE_MAX = 1.85

/** Overall score content scale (inside margins). */
export const SHEET_SCORE_SCALE_MIN = 0.55
export const SHEET_SCORE_SCALE_MAX = 1.85

/** Room above staves for tempo / fermata overlay. */
export const SHEET_TOP_MARGIN_MIN = 0.45
export const SHEET_TOP_MARGIN_MAX = 1.75

export const SHEET_LYRIC_SIZE_MIN = 9
export const SHEET_LYRIC_SIZE_MAX = 17

/** Per-part lyric line nudge (VexFlow textLine units). */
export const SHEET_LYRIC_LINE_OFFSET_MIN = -3
export const SHEET_LYRIC_LINE_OFFSET_MAX = 8

/** Horizontal page margins (left + right pad). */
export const SHEET_PADDING_MIN = 0.35
export const SHEET_PADDING_MAX = 2

/** Minimum measure body width floor. */
export const SHEET_MIN_BAR_MIN = 0.45
export const SHEET_MIN_BAR_MAX = 1.85

/** Clef / key / time gutter on system starts. */
export const SHEET_CLEF_GUTTER_MIN = 0.55
export const SHEET_CLEF_GUTTER_MAX = 1.65

/** Equal layout: time → width curve (× SHEET_MEASURE_WIDTH_FACTOR). */
export const SHEET_TIME_FACTOR_MIN = 0.55
export const SHEET_TIME_FACTOR_MAX = 2.25

/** Space below the bottom staff in each system. */
export const SHEET_BOTTOM_MARGIN_MIN = 0.45
export const SHEET_BOTTOM_MARGIN_MAX = 1.85

/** Staff line thickness (× default 1px). */
export const SHEET_STAFF_LINE_MIN = 0.55
export const SHEET_STAFF_LINE_MAX = 2.6

export function clampSheetFormat(
  n: unknown,
  min: number,
  max: number,
  fallback: number,
): number {
  const v = typeof n === 'number' ? n : Number(n)
  if (!Number.isFinite(v)) return fallback
  return Math.round(Math.max(min, Math.min(max, v)) * 100) / 100
}

export function clampSheetMeasureScale(n: unknown, fallback = 1): number {
  return clampSheetFormat(n, SHEET_MEASURE_SCALE_MIN, SHEET_MEASURE_SCALE_MAX, fallback)
}

export function clampSheetNoteSpacing(n: unknown, fallback = 1): number {
  return clampSheetFormat(n, SHEET_MEASURE_SCALE_MIN, SHEET_MEASURE_SCALE_MAX, fallback)
}

export type SheetFormatSnapshot = Pick<
  TagRollViewPrefs,
  | 'sheetNoteColors'
  | 'sheetStaveGap'
  | 'sheetMeasureScale'
  | 'sheetNoteSpacing'
  | 'sheetBeatStretch'
  | 'sheetStaveGapFine'
  | 'sheetSystemGap'
  | 'sheetTopMargin'
  | 'sheetLyricSize'
  | 'sheetLyricOffsets'
  | 'sheetPlaybackHighlight'
  | 'sheetShowEngravedHeader'
  | 'sheetShowEngravedFooter'
  | 'sheetPadding'
  | 'sheetMinBarWidth'
  | 'sheetClefGutter'
  | 'sheetTimeFactor'
  | 'sheetBottomMargin'
  | 'sheetMusicFont'
  | 'sheetTextFont'
  | 'sheetStaffLineWeight'
  | 'sheetPartNames'
  | 'sheetMeasureSizing'
  | 'sheetPageWidthIn'
  | 'sheetPageHeightIn'
  | 'sheetPageDpi'
  | 'sheetMarginLeftIn'
  | 'sheetMarginRightIn'
  | 'sheetMarginTopIn'
  | 'sheetMarginBottomIn'
  | 'sheetEngravingScale'
  | 'sheetScoreScale'
>

export function defaultSheetFormat(): SheetFormatSnapshot {
  const v = TAG_ROLL_DEFAULT_VIEW
  return {
    sheetNoteColors: v.sheetNoteColors,
    sheetStaveGap: v.sheetStaveGap,
    sheetMeasureScale: v.sheetMeasureScale,
    sheetNoteSpacing: v.sheetNoteSpacing,
    sheetBeatStretch: v.sheetBeatStretch,
    sheetStaveGapFine: v.sheetStaveGapFine,
    sheetSystemGap: v.sheetSystemGap,
    sheetTopMargin: v.sheetTopMargin,
    sheetLyricSize: v.sheetLyricSize,
    sheetLyricOffsets: { ...v.sheetLyricOffsets },
    sheetPlaybackHighlight: v.sheetPlaybackHighlight,
    sheetShowEngravedHeader: v.sheetShowEngravedHeader,
    sheetShowEngravedFooter: v.sheetShowEngravedFooter,
    sheetPadding: v.sheetPadding,
    sheetMinBarWidth: v.sheetMinBarWidth,
    sheetClefGutter: v.sheetClefGutter,
    sheetTimeFactor: v.sheetTimeFactor,
    sheetBottomMargin: v.sheetBottomMargin,
    sheetMusicFont: v.sheetMusicFont,
    sheetTextFont: v.sheetTextFont,
    sheetStaffLineWeight: v.sheetStaffLineWeight,
    sheetPartNames: v.sheetPartNames,
    sheetMeasureSizing: v.sheetMeasureSizing,
    sheetPageWidthIn: v.sheetPageWidthIn,
    sheetPageHeightIn: v.sheetPageHeightIn,
    sheetPageDpi: v.sheetPageDpi,
    sheetMarginLeftIn: v.sheetMarginLeftIn,
    sheetMarginRightIn: v.sheetMarginRightIn,
    sheetMarginBottomIn: v.sheetMarginBottomIn,
    sheetMarginTopIn: v.sheetMarginTopIn,
    sheetEngravingScale: v.sheetEngravingScale,
    sheetScoreScale: v.sheetScoreScale,
  }
}
