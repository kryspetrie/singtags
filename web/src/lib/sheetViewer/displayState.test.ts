/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it } from 'vitest'
import {
  isShowingPdf,
  pageDisplaySrc,
  pickActiveImageSet,
  pickActivePdf,
  sheetCanChooseImageSet,
  sheetCanChoosePdf,
  sheetHasImages,
  sheetHasPdf,
  sheetShowFormatToggle,
  sheetShowPickers,
} from './displayState'

describe('sheetViewer/displayState', () => {
  const imageSets = [{ id: 'pages', label: 'Pages', paths: ['a.webp'] }]
  const pdfs = [{ id: 'pdf', label: 'PDF', path: 'a.pdf' }]

  it('derives format and picker visibility', () => {
    expect(sheetHasImages(imageSets)).toBe(true)
    expect(sheetHasPdf(pdfs)).toBe(true)
    expect(sheetShowFormatToggle(true, true, true)).toBe(true)
    expect(sheetCanChooseImageSet('images', [...imageSets, imageSets[0]!])).toBe(true)
    expect(sheetCanChoosePdf('pdf', pdfs)).toBe(false)
    expect(sheetShowPickers(false, true, false)).toBe(true)
  })

  it('picks active assets', () => {
    expect(pickActiveImageSet(imageSets, 'missing')).toEqual(imageSets[0])
    expect(pickActivePdf(pdfs, 'pdf')).toEqual(pdfs[0])
    expect(isShowingPdf('pdf', true)).toBe(true)
  })

  it('pageDisplaySrc hides raw pages while FX is pending', () => {
    expect(pageDisplaySrc(true, ['blob:x'], 0, 'raw.webp')).toBe('blob:x')
    expect(pageDisplaySrc(true, null, 0, 'raw.webp')).toBe('')
    expect(pageDisplaySrc(false, null, 0, 'raw.webp')).toBe('raw.webp')
  })
})
