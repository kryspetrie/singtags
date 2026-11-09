/** Sheet layout, engraving, and page-format actions for Tag Studio. */

import { lazyFn, type StoreDeps } from './deps'

import type {
  TagRollSheetLayout,
  TagRollSheetMeasureSizing,
  TagRollSheetMusicFont,
  TagRollSheetStaveGap,
  TagRollSheetTextFont,
} from '../../lib/tagRoll/types'

import {
  TAG_ROLL_DEFAULT_VIEW,
  TAG_ROLL_SHEET_PAGE_VIEW_ZOOM_MAX,
  TAG_ROLL_SHEET_PAGE_VIEW_ZOOM_MIN,
  TAG_ROLL_SHEET_ZOOM_MAX,
  TAG_ROLL_SHEET_ZOOM_MIN,
} from '../../lib/tagRoll/types'

import {
  clampSheetFormat,
  clampSheetMeasureScale,
  clampSheetNoteSpacing,
  defaultSheetFormat,
  SHEET_BEAT_STRETCH_MAX,
  SHEET_BEAT_STRETCH_MIN,
  SHEET_LYRIC_SIZE_MAX,
  SHEET_LYRIC_SIZE_MIN,
  SHEET_LYRIC_LINE_OFFSET_MAX,
  SHEET_LYRIC_LINE_OFFSET_MIN,
  SHEET_STAVE_GAP_FINE_MAX,
  SHEET_STAVE_GAP_FINE_MIN,
  SHEET_SYSTEM_GAP_MAX,
  SHEET_SYSTEM_GAP_MIN,
  SHEET_TOP_MARGIN_MAX,
  SHEET_TOP_MARGIN_MIN,
  SHEET_BOTTOM_MARGIN_MAX,
  SHEET_BOTTOM_MARGIN_MIN,
  SHEET_CLEF_GUTTER_MAX,
  SHEET_CLEF_GUTTER_MIN,
  SHEET_MIN_BAR_MAX,
  SHEET_MIN_BAR_MIN,
  SHEET_PADDING_MAX,
  SHEET_PADDING_MIN,
  SHEET_TIME_FACTOR_MAX,
  SHEET_TIME_FACTOR_MIN,
  SHEET_STAFF_LINE_MAX,
  SHEET_STAFF_LINE_MIN,
  SHEET_STEM_LENGTH_MAX,
  SHEET_STEM_LENGTH_MIN,
  SHEET_MARGIN_IN_MIN,
  SHEET_MARGIN_IN_MAX,
  SHEET_ENGRAVING_SCALE_MIN,
  SHEET_ENGRAVING_SCALE_MAX,
  SHEET_SCORE_SCALE_MIN,
  SHEET_SCORE_SCALE_MAX,
} from '../../lib/tagRoll/sheetFormat'

import {
  clearSheetFormatCustomDefault,
  effectiveSheetFormatDefault,
  hasSheetFormatCustomDefault,
  saveSheetFormatCustomDefault,
  sheetFormatViewKey,
  snapshotSheetFormat,
} from '../../lib/tagRoll/sheetFormatDefaults'

import { normalizeSheetMusicFont, normalizeSheetTextFont } from '../../lib/tagRoll/sheetFonts'

import {
  clampSheetPageDpi,
  clampSheetPageInches,
  SHEET_PAGE_HEIGHT_IN_MAX,
  SHEET_PAGE_HEIGHT_IN_MIN,
  SHEET_PAGE_WIDTH_IN_MAX,
  SHEET_PAGE_WIDTH_IN_MIN,
} from '../../lib/tagRoll/sheetPage'

export function createTagRollSheetFormatActions(deps: StoreDeps) {

  const current = deps.current
  const patchView = lazyFn(() => deps.patchView)

  function setSheetZoom(sheetZoom: number): void {
    const z = Math.max(
      TAG_ROLL_SHEET_ZOOM_MIN,
      Math.min(TAG_ROLL_SHEET_ZOOM_MAX, Math.round(sheetZoom)),
    )
    patchView({ sheetZoom: z })
  }

  function setSheetPageViewZoom(sheetPageViewZoom: number): void {
    const raw = Number(sheetPageViewZoom)
    const z = Math.max(
      TAG_ROLL_SHEET_PAGE_VIEW_ZOOM_MIN,
      Math.min(
        TAG_ROLL_SHEET_PAGE_VIEW_ZOOM_MAX,
        Number.isFinite(raw) ? raw : 1,
      ),
    )
    patchView({ sheetPageViewZoom: Math.round(z * 100) / 100 })
  }

  function nudgeSheetPageViewZoom(delta: number): void {
    const cur = Number(current.value?.view.sheetPageViewZoom)
    setSheetPageViewZoom((Number.isFinite(cur) ? cur : 1) + Number(delta))
  }

  function setSheetShowLyrics(on: boolean): void {
    patchView({ sheetShowLyrics: on })
  }

  function setSheetLayout(sheetLayout: TagRollSheetLayout): void {
    const p = current.value
    if (!p) return
    const next = sheetLayout === 'page' ? 'page' : 'continuous'
    const from = sheetFormatViewKey(p.view.sheetLayout)
    const to = sheetFormatViewKey(next)
    if (from === to) {
      patchView({ sheetLayout: next })
      return
    }
    // Keep Continuous and Page Format settings independent.
    const byLayout = {
      continuous: p.view.sheetFormatByLayout?.continuous,
      page: p.view.sheetFormatByLayout?.page,
      [from]: { ...snapshotSheetFormat(p.view) },
    }
    const stashed = byLayout[to]
    const incoming = stashed
      ? snapshotSheetFormat({
          ...defaultSheetFormat(),
          ...stashed,
        } as typeof p.view)
      : effectiveSheetFormatDefault(to)
    patchView({
      sheetLayout: next,
      sheetFormatByLayout: byLayout,
      ...incoming,
    })
  }

  function setSheetMeasureSizing(sheetMeasureSizing: TagRollSheetMeasureSizing): void {
    patchView({
      sheetMeasureSizing: sheetMeasureSizing === 'dynamic' ? 'dynamic' : 'equal',
    })
  }

  function setSheetNoteColors(on: boolean): void {
    patchView({ sheetNoteColors: on })
  }

  function setSheetStaveGap(sheetStaveGap: TagRollSheetStaveGap): void {
    patchView({
      sheetStaveGap:
        sheetStaveGap === 'tight' || sheetStaveGap === 'wide' ? sheetStaveGap : 'normal',
    })
  }

  function setSheetMeasureScale(sheetMeasureScale: number): void {
    patchView({
      sheetMeasureScale: clampSheetMeasureScale(
        sheetMeasureScale,
        TAG_ROLL_DEFAULT_VIEW.sheetMeasureScale,
      ),
    })
  }

  function setSheetNoteSpacing(sheetNoteSpacing: number): void {
    patchView({
      sheetNoteSpacing: clampSheetNoteSpacing(
        sheetNoteSpacing,
        TAG_ROLL_DEFAULT_VIEW.sheetNoteSpacing,
      ),
    })
  }

  function setSheetBeatStretch(sheetBeatStretch: number): void {
    patchView({
      sheetBeatStretch: clampSheetFormat(
        sheetBeatStretch,
        SHEET_BEAT_STRETCH_MIN,
        SHEET_BEAT_STRETCH_MAX,
        TAG_ROLL_DEFAULT_VIEW.sheetBeatStretch,
      ),
    })
  }

  function setSheetStaveGapFine(sheetStaveGapFine: number): void {
    patchView({
      sheetStaveGapFine: clampSheetFormat(
        sheetStaveGapFine,
        SHEET_STAVE_GAP_FINE_MIN,
        SHEET_STAVE_GAP_FINE_MAX,
        TAG_ROLL_DEFAULT_VIEW.sheetStaveGapFine,
      ),
    })
  }

  function setSheetSystemGap(sheetSystemGap: number): void {
    patchView({
      sheetSystemGap: clampSheetFormat(
        sheetSystemGap,
        SHEET_SYSTEM_GAP_MIN,
        SHEET_SYSTEM_GAP_MAX,
        TAG_ROLL_DEFAULT_VIEW.sheetSystemGap,
      ),
    })
  }

  function setSheetTopMargin(sheetTopMargin: number): void {
    patchView({
      sheetTopMargin: clampSheetFormat(
        sheetTopMargin,
        SHEET_TOP_MARGIN_MIN,
        SHEET_TOP_MARGIN_MAX,
        TAG_ROLL_DEFAULT_VIEW.sheetTopMargin,
      ),
    })
  }

  function setSheetLyricSize(sheetLyricSize: number): void {
    patchView({
      sheetLyricSize: Math.round(
        clampSheetFormat(
          sheetLyricSize,
          SHEET_LYRIC_SIZE_MIN,
          SHEET_LYRIC_SIZE_MAX,
          TAG_ROLL_DEFAULT_VIEW.sheetLyricSize,
        ),
      ),
    })
  }

  function setSheetLyricOffset(partId: string, offset: number): void {
    const p = current.value
    if (!p?.parts.some((part: any) => part.id === partId)) return
    const next = { ...(p.view.sheetLyricOffsets ?? {}) }
    const n = clampSheetFormat(offset, SHEET_LYRIC_LINE_OFFSET_MIN, SHEET_LYRIC_LINE_OFFSET_MAX, 0)
    if (n === 0) delete next[partId]
    else next[partId] = n
    patchView({ sheetLyricOffsets: next })
  }

  function resetSheetLyricOffsets(): void {
    patchView({ sheetLyricOffsets: {}, sheetLyricPartVisible: {} })
  }

  function setSheetPlaybackHighlight(on: boolean): void {
    patchView({ sheetPlaybackHighlight: on })
  }
  function setSheetShowSketchChords(on: boolean): void {
    patchView({ sheetShowSketchChords: on })
  }
  function setSheetShowDetectedChords(on: boolean): void {
    patchView({ sheetShowDetectedChords: on })
  }

  function setSheetChordMarkStyle(style: 'off' | 'span' | 'boxed'): void {
    const sheetChordMarkStyle =
      style === 'off' || style === 'span' || style === 'boxed' ? style : 'boxed'
    patchView({ sheetChordMarkStyle })
  }

  function setSheetChordLabelMode(mode: 'name' | 'roman' | 'both'): void {
    patchView({ sheetChordLabelMode: mode })
  }

  function setSheetShowEngravedHeader(on: boolean): void {
    patchView({ sheetShowEngravedHeader: on })
  }

  function resetSheetFormat(): void {
    const layout = sheetFormatViewKey(current.value?.view.sheetLayout)
    patchView(effectiveSheetFormatDefault(layout))
  }

  /** Persist current Format settings as the custom default for Continuous or Page. */
  function saveSheetFormatAsDefault(): void {
    const p = current.value
    if (!p) return
    const viewKey = sheetFormatViewKey(p.view.sheetLayout)
    saveSheetFormatCustomDefault(viewKey, snapshotSheetFormat(p.view))
  }

  /** Drop the custom overlay for the active layout; next reset uses system defaults. */
  function clearSheetFormatDefault(): void {
    const layout = sheetFormatViewKey(current.value?.view.sheetLayout)
    clearSheetFormatCustomDefault(layout)
  }

  function hasCustomSheetFormatDefault(): boolean {
    return hasSheetFormatCustomDefault(
      sheetFormatViewKey(current.value?.view.sheetLayout),
    )
  }

  /** Apply system defaults only (ignores any saved custom overlay). */
  function resetSheetFormatToSystem(): void {
    patchView(defaultSheetFormat())
  }

  function setSheetShowEngravedFooter(on: boolean): void {
    patchView({ sheetShowEngravedFooter: on })
  }

  function setSheetPadding(sheetPadding: number): void {
    patchView({
      sheetPadding: clampSheetFormat(
        sheetPadding,
        SHEET_PADDING_MIN,
        SHEET_PADDING_MAX,
        TAG_ROLL_DEFAULT_VIEW.sheetPadding,
      ),
    })
  }

  function setSheetMinBarWidth(sheetMinBarWidth: number): void {
    patchView({
      sheetMinBarWidth: clampSheetFormat(
        sheetMinBarWidth,
        SHEET_MIN_BAR_MIN,
        SHEET_MIN_BAR_MAX,
        TAG_ROLL_DEFAULT_VIEW.sheetMinBarWidth,
      ),
    })
  }

  function setSheetClefGutter(sheetClefGutter: number): void {
    patchView({
      sheetClefGutter: clampSheetFormat(
        sheetClefGutter,
        SHEET_CLEF_GUTTER_MIN,
        SHEET_CLEF_GUTTER_MAX,
        TAG_ROLL_DEFAULT_VIEW.sheetClefGutter,
      ),
    })
  }

  function setSheetTimeFactor(sheetTimeFactor: number): void {
    patchView({
      sheetTimeFactor: clampSheetFormat(
        sheetTimeFactor,
        SHEET_TIME_FACTOR_MIN,
        SHEET_TIME_FACTOR_MAX,
        TAG_ROLL_DEFAULT_VIEW.sheetTimeFactor,
      ),
    })
  }

  function setSheetBottomMargin(sheetBottomMargin: number): void {
    patchView({
      sheetBottomMargin: clampSheetFormat(
        sheetBottomMargin,
        SHEET_BOTTOM_MARGIN_MIN,
        SHEET_BOTTOM_MARGIN_MAX,
        TAG_ROLL_DEFAULT_VIEW.sheetBottomMargin,
      ),
    })
  }

  function setSheetMarginLeftIn(sheetMarginLeftIn: number): void {
    patchView({
      sheetMarginLeftIn: clampSheetPageInches(
        sheetMarginLeftIn,
        SHEET_MARGIN_IN_MIN,
        SHEET_MARGIN_IN_MAX,
        TAG_ROLL_DEFAULT_VIEW.sheetMarginLeftIn,
      ),
    })
  }

  function setSheetMarginRightIn(sheetMarginRightIn: number): void {
    patchView({
      sheetMarginRightIn: clampSheetPageInches(
        sheetMarginRightIn,
        SHEET_MARGIN_IN_MIN,
        SHEET_MARGIN_IN_MAX,
        TAG_ROLL_DEFAULT_VIEW.sheetMarginRightIn,
      ),
    })
  }

  function setSheetMarginTopIn(sheetMarginTopIn: number): void {
    patchView({
      sheetMarginTopIn: clampSheetPageInches(
        sheetMarginTopIn,
        SHEET_MARGIN_IN_MIN,
        SHEET_MARGIN_IN_MAX,
        TAG_ROLL_DEFAULT_VIEW.sheetMarginTopIn,
      ),
    })
  }

  function setSheetMarginBottomIn(sheetMarginBottomIn: number): void {
    patchView({
      sheetMarginBottomIn: clampSheetPageInches(
        sheetMarginBottomIn,
        SHEET_MARGIN_IN_MIN,
        SHEET_MARGIN_IN_MAX,
        TAG_ROLL_DEFAULT_VIEW.sheetMarginBottomIn,
      ),
    })
  }

  /** Set all four page/strip margins to the same inch value. */
  function setSheetMarginsUniformIn(inches: number): void {
    const v = clampSheetPageInches(
      inches,
      SHEET_MARGIN_IN_MIN,
      SHEET_MARGIN_IN_MAX,
      TAG_ROLL_DEFAULT_VIEW.sheetMarginLeftIn,
    )
    patchView({
      sheetMarginLeftIn: v,
      sheetMarginRightIn: v,
      sheetMarginTopIn: v,
      sheetMarginBottomIn: v,
    })
  }

  function setSheetEngravingScale(sheetEngravingScale: number): void {
    // Size is proportional: keep Score + Notation scales locked together.
    const v = clampSheetFormat(
      sheetEngravingScale,
      SHEET_ENGRAVING_SCALE_MIN,
      SHEET_ENGRAVING_SCALE_MAX,
      TAG_ROLL_DEFAULT_VIEW.sheetEngravingScale,
    )
    patchView({ sheetEngravingScale: v, sheetScoreScale: v })
  }

  function setSheetScoreScale(sheetScoreScale: number): void {
    const v = clampSheetFormat(
      sheetScoreScale,
      SHEET_SCORE_SCALE_MIN,
      SHEET_SCORE_SCALE_MAX,
      TAG_ROLL_DEFAULT_VIEW.sheetScoreScale,
    )
    patchView({ sheetScoreScale: v, sheetEngravingScale: v })
  }

  function setSheetMusicFont(sheetMusicFont: TagRollSheetMusicFont | string): void {
    patchView({ sheetMusicFont: normalizeSheetMusicFont(sheetMusicFont) })
  }

  function setSheetTextFont(sheetTextFont: TagRollSheetTextFont | string): void {
    patchView({ sheetTextFont: normalizeSheetTextFont(sheetTextFont) })
  }

  function setSheetStaffLineWeight(sheetStaffLineWeight: number): void {
    patchView({
      sheetStaffLineWeight: clampSheetFormat(
        sheetStaffLineWeight,
        SHEET_STAFF_LINE_MIN,
        SHEET_STAFF_LINE_MAX,
        TAG_ROLL_DEFAULT_VIEW.sheetStaffLineWeight,
      ),
    })
  }

  function setSheetStemLength(sheetStemLength: number): void {
    patchView({
      sheetStemLength: clampSheetFormat(
        sheetStemLength, SHEET_STEM_LENGTH_MIN, SHEET_STEM_LENGTH_MAX,
        TAG_ROLL_DEFAULT_VIEW.sheetStemLength,
      ),
    })
  }
  function setSheetPartNames(on: boolean): void {
    patchView({ sheetPartNames: on })
  }

  function setSheetPageWidthIn(sheetPageWidthIn: number): void {
    patchView({
      sheetPageWidthIn: clampSheetPageInches(
        sheetPageWidthIn,
        SHEET_PAGE_WIDTH_IN_MIN,
        SHEET_PAGE_WIDTH_IN_MAX,
        TAG_ROLL_DEFAULT_VIEW.sheetPageWidthIn,
      ),
    })
  }

  function setSheetPageHeightIn(sheetPageHeightIn: number): void {
    patchView({
      sheetPageHeightIn: clampSheetPageInches(
        sheetPageHeightIn,
        SHEET_PAGE_HEIGHT_IN_MIN,
        SHEET_PAGE_HEIGHT_IN_MAX,
        TAG_ROLL_DEFAULT_VIEW.sheetPageHeightIn,
      ),
    })
  }

  function setSheetPageDpi(sheetPageDpi: number): void {
    patchView({
      sheetPageDpi: clampSheetPageDpi(sheetPageDpi, TAG_ROLL_DEFAULT_VIEW.sheetPageDpi),
    })
  }

  function setSheetPagePreset(preset: 'letter' | 'a4'): void {
    if (preset === 'a4') {
      patchView({ sheetPageWidthIn: 8.27, sheetPageHeightIn: 11.69 })
    } else {
      patchView({ sheetPageWidthIn: 8.5, sheetPageHeightIn: 11 })
    }
  }

  const actions = {
    setSheetZoom,
    setSheetPageViewZoom,
    nudgeSheetPageViewZoom,
    setSheetShowLyrics,
    setSheetLayout,
    setSheetMeasureSizing,
    setSheetNoteColors,
    setSheetStaveGap,
    setSheetMeasureScale,
    setSheetNoteSpacing,
    setSheetBeatStretch,
    setSheetStaveGapFine,
    setSheetSystemGap,
    setSheetTopMargin,
    setSheetLyricSize,
    setSheetLyricOffset,
    resetSheetLyricOffsets,
    setSheetPlaybackHighlight,
    setSheetShowSketchChords,
    setSheetShowDetectedChords,
    setSheetChordMarkStyle,
    setSheetChordLabelMode,
    setSheetShowEngravedHeader,
    resetSheetFormat,
    saveSheetFormatAsDefault,
    clearSheetFormatDefault,
    hasCustomSheetFormatDefault,
    resetSheetFormatToSystem,
    setSheetShowEngravedFooter,
    setSheetPadding,
    setSheetMinBarWidth,
    setSheetClefGutter,
    setSheetTimeFactor,
    setSheetBottomMargin,
    setSheetMarginLeftIn,
    setSheetMarginRightIn,
    setSheetMarginTopIn,
    setSheetMarginBottomIn,
    setSheetMarginsUniformIn,
    setSheetEngravingScale,
    setSheetScoreScale,
    setSheetMusicFont,
    setSheetTextFont,
    setSheetStaffLineWeight,
    setSheetStemLength,
    setSheetPartNames,
    setSheetPageWidthIn,
    setSheetPageHeightIn,
    setSheetPageDpi,
    setSheetPagePreset,
  }
  Object.assign(deps, actions)

  function bindWatches(): void {}

  return { actions, bindWatches }

}
