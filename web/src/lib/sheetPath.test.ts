import { describe, expect, it } from 'vitest'
import { isImageSheetPath, isPdfPath } from './sheetPath'

describe('sheetPath', () => {
  it('detects pdf paths', () => {
    expect(isPdfPath('sheets/1/sheet.pdf')).toBe(true)
    expect(isPdfPath('sheets/1/sheet.PDF?x=1')).toBe(true)
    expect(isPdfPath('sheets/1/page.webp')).toBe(false)
    expect(isPdfPath(null)).toBe(false)
  })

  it('detects image sheet paths', () => {
    expect(isImageSheetPath('sheets/1/sheet.jpg')).toBe(true)
    expect(isImageSheetPath('blob:abc')).toBe(true)
    expect(isImageSheetPath('sheets/1/sheet.pdf')).toBe(false)
    expect(isImageSheetPath(undefined)).toBe(false)
  })
})
