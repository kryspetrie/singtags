/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import { highResTransferAvailable, highResTransferAvailableFromSummary } from './loadTagForTransfer'
import type { TagDetail } from '../../types/tag'

describe('loadTagForTransfer', () => {
  it('highResTransferAvailable when a PDF upload exists', () => {
    const detail = {
      tag_id: 1,
      sheets: ['sheets/1/sheet.pdf'],
      sheet_pages: ['sheets/1/pages/page-01.webp'],
    } as TagDetail
    expect(highResTransferAvailable(detail)).toBe(true)
  })

  it('highResTransferAvailable is false for webp-only tags', () => {
    const detail = {
      tag_id: 2,
      sheet_pages: ['sheets/2/pages/page-01.webp'],
    } as TagDetail
    expect(highResTransferAvailable(detail)).toBe(false)
  })

  it('highResTransferAvailableFromSummary when catalog sheet is a PDF', () => {
    expect(
      highResTransferAvailableFromSummary({
        id: 3,
        title: 'PDF tag',
        sheet: 'sheets/3/sheet.pdf',
        hasSheet: true,
        audioParts: [],
      }),
    ).toBe(true)
  })
})
