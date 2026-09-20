/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it } from 'vitest'
import { syncSheetSelection } from './selection'

describe('sheetViewer/selection', () => {
  const imageSets = [{ id: 'pages', label: 'Pages', paths: ['a.webp'] }]
  const pdfs = [{ id: 'pdf', label: 'PDF', path: 'a.pdf' }]

  it('resets invalid ids to the first available asset', () => {
    expect(
      syncSheetSelection({
        imageSetId: 'missing',
        pdfId: 'missing',
        mode: 'images',
        resetMode: false,
        imageSets,
        pdfs,
      }),
    ).toEqual({ imageSetId: 'pages', pdfId: 'pdf', mode: 'images' })
  })

  it('resetMode prefers images when both formats exist', () => {
    expect(
      syncSheetSelection({
        imageSetId: 'pages',
        pdfId: 'pdf',
        mode: 'pdf',
        resetMode: true,
        imageSets,
        pdfs,
      }),
    ).toEqual({ imageSetId: 'pages', pdfId: 'pdf', mode: 'images' })
  })

  it('falls back to pdf when images disappear', () => {
    expect(
      syncSheetSelection({
        imageSetId: 'pages',
        pdfId: 'pdf',
        mode: 'images',
        resetMode: false,
        imageSets: [],
        pdfs,
      }),
    ).toEqual({ imageSetId: '', pdfId: 'pdf', mode: 'pdf' })
  })
})
