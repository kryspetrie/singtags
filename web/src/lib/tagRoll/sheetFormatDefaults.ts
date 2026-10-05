/**
 * User-saved sheet Format defaults (one overlay per Continuous / Page view).
 * Custom values merge on top of {@link defaultSheetFormat}; no named profiles.
 */
import type { TagRollSheetLayout, TagRollViewPrefs } from './types'
import {
  clampSheetFormat,
  clampSheetMeasureScale,
  clampSheetNoteSpacing,
  defaultSheetFormat,
  SHEET_BEAT_STRETCH_MAX,
  SHEET_BEAT_STRETCH_MIN,
  SHEET_BOTTOM_MARGIN_MAX,
  SHEET_BOTTOM_MARGIN_MIN,
  SHEET_CLEF_GUTTER_MAX,
  SHEET_CLEF_GUTTER_MIN,
  SHEET_LYRIC_SIZE_MAX,
  SHEET_LYRIC_SIZE_MIN,
  SHEET_MARGIN_IN_MAX,
  SHEET_MARGIN_IN_MIN,
  SHEET_MIN_BAR_MAX,
  SHEET_MIN_BAR_MIN,
  SHEET_PADDING_MAX,
  SHEET_PADDING_MIN,
  SHEET_SCORE_SCALE_MAX,
  SHEET_SCORE_SCALE_MIN,
  SHEET_STAFF_LINE_MAX,
  SHEET_STAFF_LINE_MIN,
  SHEET_STAVE_GAP_FINE_MAX,
  SHEET_STAVE_GAP_FINE_MIN,
  SHEET_SYSTEM_GAP_MAX,
  SHEET_SYSTEM_GAP_MIN,
  SHEET_TIME_FACTOR_MAX,
  SHEET_TIME_FACTOR_MIN,
  SHEET_TOP_MARGIN_MAX,
  SHEET_TOP_MARGIN_MIN,
  type SheetFormatSnapshot,
} from './sheetFormat'
import { normalizeSheetMusicFont, normalizeSheetTextFont } from './sheetFonts'
import {
  clampSheetPageDpi,
  clampSheetPageInches,
  SHEET_PAGE_HEIGHT_IN_MAX,
  SHEET_PAGE_HEIGHT_IN_MIN,
  SHEET_PAGE_WIDTH_IN_MAX,
  SHEET_PAGE_WIDTH_IN_MIN,
} from './sheetPage'

export const SHEET_FORMAT_DEFAULTS_KEY = 'singtags.tagRoll.sheetFormatDefaults.v1'

export type SheetFormatViewKey = 'continuous' | 'page'

type StoredSheetFormatDefaults = {
  continuous?: Partial<SheetFormatSnapshot>
  page?: Partial<SheetFormatSnapshot>
}

export function sheetFormatViewKey(
  layout: TagRollSheetLayout | string | null | undefined,
): SheetFormatViewKey {
  return layout === 'page' ? 'page' : 'continuous'
}

/** Capture format fields from the live project view (lyric offsets omitted — part-id specific). */
export function snapshotSheetFormat(view: TagRollViewPrefs): SheetFormatSnapshot {
  const base = defaultSheetFormat()
  return {
    sheetNoteColors: view.sheetNoteColors === true,
    sheetStaveGap:
      view.sheetStaveGap === 'tight' || view.sheetStaveGap === 'wide'
        ? view.sheetStaveGap
        : 'normal',
    sheetMeasureScale: clampSheetMeasureScale(view.sheetMeasureScale, base.sheetMeasureScale),
    sheetNoteSpacing: clampSheetNoteSpacing(view.sheetNoteSpacing, base.sheetNoteSpacing),
    sheetBeatStretch: clampSheetFormat(
      view.sheetBeatStretch,
      SHEET_BEAT_STRETCH_MIN,
      SHEET_BEAT_STRETCH_MAX,
      base.sheetBeatStretch,
    ),
    sheetStaveGapFine: clampSheetFormat(
      view.sheetStaveGapFine,
      SHEET_STAVE_GAP_FINE_MIN,
      SHEET_STAVE_GAP_FINE_MAX,
      base.sheetStaveGapFine,
    ),
    sheetSystemGap: clampSheetFormat(
      view.sheetSystemGap,
      SHEET_SYSTEM_GAP_MIN,
      SHEET_SYSTEM_GAP_MAX,
      base.sheetSystemGap,
    ),
    sheetTopMargin: clampSheetFormat(
      view.sheetTopMargin,
      SHEET_TOP_MARGIN_MIN,
      SHEET_TOP_MARGIN_MAX,
      base.sheetTopMargin,
    ),
    sheetLyricSize: Math.round(
      clampSheetFormat(
        view.sheetLyricSize,
        SHEET_LYRIC_SIZE_MIN,
        SHEET_LYRIC_SIZE_MAX,
        base.sheetLyricSize,
      ),
    ),
    sheetLyricOffsets: {},
    sheetPlaybackHighlight: view.sheetPlaybackHighlight !== false,
    sheetShowSketchChords: view.sheetShowSketchChords === true,
    sheetShowDetectedChords: view.sheetShowDetectedChords === true,
    sheetShowEngravedHeader: view.sheetShowEngravedHeader !== false,
    sheetShowEngravedFooter: view.sheetShowEngravedFooter !== false,
    sheetPadding: clampSheetFormat(
      view.sheetPadding,
      SHEET_PADDING_MIN,
      SHEET_PADDING_MAX,
      base.sheetPadding,
    ),
    sheetMinBarWidth: clampSheetFormat(
      view.sheetMinBarWidth,
      SHEET_MIN_BAR_MIN,
      SHEET_MIN_BAR_MAX,
      base.sheetMinBarWidth,
    ),
    sheetClefGutter: clampSheetFormat(
      view.sheetClefGutter,
      SHEET_CLEF_GUTTER_MIN,
      SHEET_CLEF_GUTTER_MAX,
      base.sheetClefGutter,
    ),
    sheetTimeFactor: clampSheetFormat(
      view.sheetTimeFactor,
      SHEET_TIME_FACTOR_MIN,
      SHEET_TIME_FACTOR_MAX,
      base.sheetTimeFactor,
    ),
    sheetBottomMargin: clampSheetFormat(
      view.sheetBottomMargin,
      SHEET_BOTTOM_MARGIN_MIN,
      SHEET_BOTTOM_MARGIN_MAX,
      base.sheetBottomMargin,
    ),
    sheetMusicFont: normalizeSheetMusicFont(view.sheetMusicFont),
    sheetTextFont: normalizeSheetTextFont(view.sheetTextFont),
    sheetStaffLineWeight: clampSheetFormat(
      view.sheetStaffLineWeight,
      SHEET_STAFF_LINE_MIN,
      SHEET_STAFF_LINE_MAX,
      base.sheetStaffLineWeight,
    ),
    sheetPartNames: view.sheetPartNames === true,
    sheetMeasureSizing: view.sheetMeasureSizing === 'dynamic' ? 'dynamic' : 'equal',
    sheetPageWidthIn: clampSheetPageInches(
      view.sheetPageWidthIn,
      SHEET_PAGE_WIDTH_IN_MIN,
      SHEET_PAGE_WIDTH_IN_MAX,
      base.sheetPageWidthIn,
    ),
    sheetPageHeightIn: clampSheetPageInches(
      view.sheetPageHeightIn,
      SHEET_PAGE_HEIGHT_IN_MIN,
      SHEET_PAGE_HEIGHT_IN_MAX,
      base.sheetPageHeightIn,
    ),
    sheetPageDpi: clampSheetPageDpi(view.sheetPageDpi, base.sheetPageDpi),
    sheetMarginLeftIn: clampSheetFormat(
      view.sheetMarginLeftIn,
      SHEET_MARGIN_IN_MIN,
      SHEET_MARGIN_IN_MAX,
      base.sheetMarginLeftIn,
    ),
    sheetMarginRightIn: clampSheetFormat(
      view.sheetMarginRightIn,
      SHEET_MARGIN_IN_MIN,
      SHEET_MARGIN_IN_MAX,
      base.sheetMarginRightIn,
    ),
    sheetMarginTopIn: clampSheetFormat(
      view.sheetMarginTopIn,
      SHEET_MARGIN_IN_MIN,
      SHEET_MARGIN_IN_MAX,
      base.sheetMarginTopIn,
    ),
    sheetMarginBottomIn: clampSheetFormat(
      view.sheetMarginBottomIn,
      SHEET_MARGIN_IN_MIN,
      SHEET_MARGIN_IN_MAX,
      base.sheetMarginBottomIn,
    ),
    ...(() => {
      const size = clampSheetFormat(
        view.sheetScoreScale,
        SHEET_SCORE_SCALE_MIN,
        SHEET_SCORE_SCALE_MAX,
        base.sheetScoreScale,
      )
      return { sheetScoreScale: size, sheetEngravingScale: size }
    })(),
  }
}

function readStore(): StoredSheetFormatDefaults {
  try {
    const raw = localStorage.getItem(SHEET_FORMAT_DEFAULTS_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    return parsed as StoredSheetFormatDefaults
  } catch {
    return {}
  }
}

function writeStore(next: StoredSheetFormatDefaults): void {
  try {
    const empty = !next.continuous && !next.page
    if (empty) localStorage.removeItem(SHEET_FORMAT_DEFAULTS_KEY)
    else localStorage.setItem(SHEET_FORMAT_DEFAULTS_KEY, JSON.stringify(next))
  } catch {
    /* private mode / quota */
  }
}

/** True when the user has saved a custom overlay for this view. */
export function hasSheetFormatCustomDefault(view: SheetFormatViewKey): boolean {
  const slot = readStore()[view]
  return !!slot && typeof slot === 'object' && Object.keys(slot).length > 0
}

/**
 * System defaults with the user's custom overlay for this view (if any).
 * Lyric offsets always reset to {} — they are per-project part ids.
 */
export function effectiveSheetFormatDefault(view: SheetFormatViewKey): SheetFormatSnapshot {
  const system = defaultSheetFormat()
  const overlay = readStore()[view]
  if (!overlay || typeof overlay !== 'object') {
    return { ...system, sheetLyricOffsets: {} }
  }
  // Re-validate via snapshot helpers by merging then clamping through snapshotSheetFormat shape.
  const merged = { ...system, ...overlay, sheetLyricOffsets: {} }
  return snapshotSheetFormat(merged as TagRollViewPrefs)
}

export function saveSheetFormatCustomDefault(
  view: SheetFormatViewKey,
  snap: SheetFormatSnapshot,
): void {
  const store = readStore()
  store[view] = { ...snap, sheetLyricOffsets: {} }
  writeStore(store)
}

export function clearSheetFormatCustomDefault(view: SheetFormatViewKey): void {
  const store = readStore()
  delete store[view]
  writeStore(store)
}
