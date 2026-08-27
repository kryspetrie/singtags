import { describe, expect, it } from 'vitest'
import { sheetDisplayPages, sheetOfflinePaths } from './sheetPaths'
import type { TagDetail } from '../types/tag'

describe('sheetPaths', () => {
  const detail: TagDetail = {
    tag_id: 1,
    title: 'Test',
    arranger: null,
    key: null,
    sheet: 'sheets/1/sheet.pdf',
    sheet_preview: 'sheets/1/preview.webp',
    sheet_pages: ['sheets/1/preview.webp'],
    audio: {},
  }

  it('uses sheet_preview for offline cache', () => {
    expect(sheetOfflinePaths(detail)).toEqual(['sheets/1/preview.webp'])
  })

  it('prefers sheet_pages for display', () => {
    expect(sheetDisplayPages(detail)).toEqual(['sheets/1/preview.webp'])
  })

  it('falls back to sheet_preview when pages missing', () => {
    const d = { ...detail, sheet_pages: undefined }
    expect(sheetDisplayPages(d)).toEqual(['sheets/1/preview.webp'])
  })
})
