import { normalizeSheetPianoHeightPx, normalizeSheetPianoKeyScale } from '../../audio/pitchPlayer'
import {
  SHEET_FS_PAGE_MODE_KEY,
  SHEET_PIANO_HEIGHT_KEY,
  SHEET_PIANO_KEY_SCALE_KEY,
  SHEET_PIANO_KEY_SCALE_KEY_V1,
} from './keys'
import type { SheetFsPageMode } from './types'

/** Normalize / load fullscreen sheet page mode from localStorage. */
export function normalizeSheetFsPageMode(raw: unknown): SheetFsPageMode {
  return raw === 'scroll' ? 'scroll' : 'paging'
}

export function loadSheetFsPageMode(): SheetFsPageMode {
  try {
    return normalizeSheetFsPageMode(localStorage.getItem(SHEET_FS_PAGE_MODE_KEY))
  } catch {
    return 'paging'
  }
}

export function loadSheetPianoKeyScale(): number {
  try {
    // Drop poisoned v1 values (unset → Number(null)===0 → clamped to 25%).
    localStorage.removeItem(SHEET_PIANO_KEY_SCALE_KEY_V1)
    return normalizeSheetPianoKeyScale(localStorage.getItem(SHEET_PIANO_KEY_SCALE_KEY))
  } catch {
    return normalizeSheetPianoKeyScale(null)
  }
}

export function loadSheetPianoHeightPx(): number {
  try {
    return normalizeSheetPianoHeightPx(localStorage.getItem(SHEET_PIANO_HEIGHT_KEY))
  } catch {
    return normalizeSheetPianoHeightPx(null)
  }
}
