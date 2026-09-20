/**
 * @vitest-environment happy-dom
 */
import { beforeEach, describe, expect, it } from 'vitest'
import {
  loadSheetFsPageMode,
  loadSheetPianoHeightPx,
  loadSheetPianoKeyScale,
  normalizeSheetFsPageMode,
} from './sheet'
import {
  SHEET_FS_PAGE_MODE_KEY,
  SHEET_PIANO_HEIGHT_KEY,
  SHEET_PIANO_KEY_SCALE_KEY,
  SHEET_PIANO_KEY_SCALE_KEY_V1,
} from './keys'

describe('sheet preferences', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('normalizes fullscreen page mode', () => {
    expect(normalizeSheetFsPageMode('scroll')).toBe('scroll')
    expect(normalizeSheetFsPageMode('paging')).toBe('paging')
    expect(normalizeSheetFsPageMode('other')).toBe('paging')
    expect(normalizeSheetFsPageMode(null)).toBe('paging')
  })

  it('loads sheet page mode from localStorage', () => {
    localStorage.setItem(SHEET_FS_PAGE_MODE_KEY, 'scroll')
    expect(loadSheetFsPageMode()).toBe('scroll')
  })

  it('loads piano key scale and drops poisoned v1 key', () => {
    localStorage.setItem(SHEET_PIANO_KEY_SCALE_KEY_V1, '25')
    localStorage.setItem(SHEET_PIANO_KEY_SCALE_KEY, '125')
    expect(loadSheetPianoKeyScale()).toBe(125)
    expect(localStorage.getItem(SHEET_PIANO_KEY_SCALE_KEY_V1)).toBeNull()
  })

  it('loads piano height with normalization', () => {
    localStorage.setItem(SHEET_PIANO_HEIGHT_KEY, '180')
    expect(loadSheetPianoHeightPx()).toBe(180)
  })
})
