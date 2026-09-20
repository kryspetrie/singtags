import type { SheetFitMode } from '../sheetZoomPan'
import type { SheetFsPageMode } from '../../stores/preferences'

/**
 * True when ✕ only leaves fullscreen onto the hosting details page
 * (catalog tag or library entry) — no Tag Page / Song Page menu needed.
 */
export function exitStaysOnDetailsPage(label: string): boolean {
  const n = label.trim().toLowerCase()
  return !n || n === 'tag page' || n === 'lib page'
}

export function showDetailsPageButton(exitOriginLabel: string): boolean {
  return !exitStaysOnDetailsPage(exitOriginLabel || '')
}

export function showPlayControl(
  singControls: boolean,
  playReady: boolean,
  playing: boolean,
  baking: boolean,
): boolean {
  return !!(singControls && (playReady || playing || baking))
}

export function fmtTime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return '0:00'
  const s = Math.floor(sec)
  const m = Math.floor(s / 60)
  const r = s % 60
  return `${m}:${r.toString().padStart(2, '0')}`
}

export function fitButtonLabel(fitMode: SheetFitMode): string {
  return fitMode === 'width' ? 'Fit width' : 'Fit all'
}

export function fitButtonTitle(
  fitMode: SheetFitMode,
  fitCycleDisabled: boolean,
): string {
  if (fitCycleDisabled) {
    return fitMode === 'width'
      ? 'Fit width — fit all looks the same for this page'
      : 'Fit all — fit width looks the same for this page'
  }
  return fitMode === 'width'
    ? 'Fit mode: width — tap for fit all'
    : 'Fit mode: all — tap for fit width'
}

export function pageModeButtonLabel(sheetFsPageMode: SheetFsPageMode): string {
  return sheetFsPageMode === 'scroll' ? 'Scroll' : 'Paging'
}

export function pageModeButtonTitle(sheetFsPageMode: SheetFsPageMode): string {
  return sheetFsPageMode === 'scroll'
    ? 'Page mode: continuous scroll — tap for one page at a time'
    : 'Page mode: paging — tap for continuous scroll'
}
