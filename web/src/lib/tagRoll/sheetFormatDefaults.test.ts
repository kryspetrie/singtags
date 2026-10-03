/**
 * @vitest-environment happy-dom
 */
import { afterEach, describe, expect, it } from 'vitest'
import { defaultSheetFormat } from './sheetFormat'
import {
  clearSheetFormatCustomDefault,
  effectiveSheetFormatDefault,
  hasSheetFormatCustomDefault,
  saveSheetFormatCustomDefault,
  SHEET_FORMAT_DEFAULTS_KEY,
  sheetFormatViewKey,
  snapshotSheetFormat,
} from './sheetFormatDefaults'
import { TAG_ROLL_DEFAULT_VIEW } from './types'

describe('sheetFormatDefaults', () => {
  afterEach(() => {
    localStorage.removeItem(SHEET_FORMAT_DEFAULTS_KEY)
  })

  it('maps layout to continuous / page keys', () => {
    expect(sheetFormatViewKey('page')).toBe('page')
    expect(sheetFormatViewKey('continuous')).toBe('continuous')
    expect(sheetFormatViewKey('equal')).toBe('continuous')
  })

  it('overlays a custom continuous default on the system default', () => {
    expect(hasSheetFormatCustomDefault('continuous')).toBe(false)
    const snap = {
      ...defaultSheetFormat(),
      sheetMeasureScale: 1.4,
      sheetEngravingScale: 1.1,
      sheetLyricOffsets: { x: 2 },
    }
    saveSheetFormatCustomDefault('continuous', snap)
    expect(hasSheetFormatCustomDefault('continuous')).toBe(true)
    expect(hasSheetFormatCustomDefault('page')).toBe(false)

    const eff = effectiveSheetFormatDefault('continuous')
    expect(eff.sheetMeasureScale).toBe(1.4)
    expect(eff.sheetEngravingScale).toBe(1.1)
    expect(eff.sheetLyricOffsets).toEqual({})
    expect(eff.sheetLyricSize).toBe(defaultSheetFormat().sheetLyricSize)

    // Page view still uses system until saved separately.
    expect(effectiveSheetFormatDefault('page').sheetMeasureScale).toBe(
      defaultSheetFormat().sheetMeasureScale,
    )
  })

  it('clears a saved default back to system', () => {
    saveSheetFormatCustomDefault('page', {
      ...defaultSheetFormat(),
      sheetScoreScale: 1.2,
    })
    clearSheetFormatCustomDefault('page')
    expect(hasSheetFormatCustomDefault('page')).toBe(false)
    expect(effectiveSheetFormatDefault('page').sheetScoreScale).toBe(
      defaultSheetFormat().sheetScoreScale,
    )
  })

  it('snapshots live view prefs without lyric offsets', () => {
    const snap = snapshotSheetFormat({
      ...TAG_ROLL_DEFAULT_VIEW,
      sheetMeasureScale: 1.35,
      sheetLyricOffsets: { a: 3 },
      sheetPartNames: true,
    })
    expect(snap.sheetMeasureScale).toBe(1.35)
    expect(snap.sheetPartNames).toBe(true)
    expect(snap.sheetLyricOffsets).toEqual({})
  })
})
