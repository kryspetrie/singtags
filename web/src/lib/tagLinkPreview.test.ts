import { describe, expect, it } from 'vitest'
import {
  tagDocumentTitle,
  tagLinkPreviewDescription,
  tagLinkPreviewTitle,
} from './tagLinkPreview'

describe('tagLinkPreview', () => {
  it('builds title and document title', () => {
    expect(tagLinkPreviewTitle('Smile', 1)).toBe('Smile')
    expect(tagLinkPreviewTitle(null, 1)).toBe('Tag 1')
    expect(tagDocumentTitle('Smile', 1)).toBe('Smile · SingTags')
  })

  it('builds a Discord-style description line', () => {
    expect(
      tagLinkPreviewDescription({
        arranger: 'Bobby Gray, Jr',
        key: 'G Major',
        year: 1986,
        type: 'Barbershop',
        collection: 'classic',
        classic: '13',
        sheet_preview: 'Folder/Smile Preview.webp',
      }),
    ).toBe('Arranged by Bobby Gray, Jr · G Major · 1986 · Classic #13 · Barbershop')
  })

  it('appends lyrics when no sheet image is available', () => {
    expect(
      tagLinkPreviewDescription({
        arranger: 'Ada',
        key: 'C',
        year: null,
        type: null,
        collection: null,
        classic: null,
        lyrics: 'Hello world from the tag',
      }),
    ).toBe('Arranged by Ada · C — Hello world from the tag')
  })
})
