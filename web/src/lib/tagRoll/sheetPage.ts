/**
 * Letter / custom page geometry for Tag Studio page layout + print preview.
 * CSS uses 96px/in — matching browser print @page sizing.
 */

export const SHEET_PAGE_WIDTH_IN_MIN = 4
export const SHEET_PAGE_WIDTH_IN_MAX = 17
export const SHEET_PAGE_HEIGHT_IN_MIN = 4
export const SHEET_PAGE_HEIGHT_IN_MAX = 22
export const SHEET_PAGE_DPI_MIN = 72
export const SHEET_PAGE_DPI_MAX = 150

/** US Letter. */
export const SHEET_PAGE_LETTER = { widthIn: 8.5, heightIn: 11 } as const

/** ISO A4 in inches. */
export const SHEET_PAGE_A4 = { widthIn: 8.27, heightIn: 11.69 } as const

/** Gap between page frames on the continuous scroll canvas (screen only). */
export const SHEET_PAGE_GAP_PX = 28

export function clampSheetPageInches(
  n: unknown,
  min: number,
  max: number,
  fallback: number,
): number {
  const v = typeof n === 'number' ? n : Number(n)
  if (!Number.isFinite(v)) return fallback
  return Math.round(Math.max(min, Math.min(max, v)) * 100) / 100
}

export function clampSheetPageDpi(n: unknown, fallback = 96): number {
  const v = typeof n === 'number' ? n : Number(n)
  if (!Number.isFinite(v)) return fallback
  return Math.round(Math.max(SHEET_PAGE_DPI_MIN, Math.min(SHEET_PAGE_DPI_MAX, v)))
}

export function sheetPageWidthPx(widthIn: number, dpi: number): number {
  return Math.max(200, Math.round(widthIn * dpi))
}

export function sheetPageHeightPx(heightIn: number, dpi: number): number {
  return Math.max(200, Math.round(heightIn * dpi))
}

export function isLetterPage(widthIn: number, heightIn: number): boolean {
  return (
    Math.abs(widthIn - SHEET_PAGE_LETTER.widthIn) < 0.05 &&
    Math.abs(heightIn - SHEET_PAGE_LETTER.heightIn) < 0.05
  )
}

export function isA4Page(widthIn: number, heightIn: number): boolean {
  return (
    Math.abs(widthIn - SHEET_PAGE_A4.widthIn) < 0.05 &&
    Math.abs(heightIn - SHEET_PAGE_A4.heightIn) < 0.05
  )
}
