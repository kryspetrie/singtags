/**
 * Sheet path selection for offline cache vs on-screen display.
 * Prefers compact preview WebP for cache; full pages for display.
 */

import type { TagDetail, TagSummary } from '../types/tag'

/** Subset of tag fields needed to resolve sheet paths. */
type SheetPathDetail = Pick<TagDetail, 'sheet_preview' | 'sheet_pages' | 'sheet'>

/** Compact offline cache path(s): prefer dedicated preview over full page raster. */
export function sheetOfflinePaths(detail: SheetPathDetail): string[] {
  if (detail.sheet_preview) return [detail.sheet_preview]
  return detail.sheet_pages ?? []
}

/** On-screen raster pages; fall back to preview or legacy single sheet image. */
export function sheetDisplayPages(detail: SheetPathDetail): string[] {
  if (detail.sheet_pages?.length) return detail.sheet_pages
  if (detail.sheet_preview) return [detail.sheet_preview]
  if (detail.sheet && /\.(webp|png|jpe?g|gif)$/i.test(detail.sheet)) return [detail.sheet]
  return []
}

/** Raster pages for browse cards from a {@link TagSummary}. */
export function summarySheetPages(summary: TagSummary): string[] {
  if (summary.sheetPages?.length) return summary.sheetPages
  if (summary.sheetPreview) return [summary.sheetPreview]
  return []
}
