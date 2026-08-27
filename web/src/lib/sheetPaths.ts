import type { TagDetail, TagSummary } from '../types/tag'

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

export function summarySheetPages(summary: TagSummary): string[] {
  if (summary.sheetPages?.length) return summary.sheetPages
  if (summary.sheetPreview) return [summary.sheetPreview]
  return []
}
