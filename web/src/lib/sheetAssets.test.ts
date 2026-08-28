import { describe, expect, it } from 'vitest'
import { downloadableSheetAssets, originalSheetPaths, resolveSheetAssets, sheetFileLabel } from './sheetAssets'

describe('sheetAssets', () => {
  it('merges legacy sheet with sheets[] uniquely', () => {
    expect(
      originalSheetPaths({
        sheet: 'sheets/1/a.pdf',
        sheets: ['sheets/1/a.pdf', 'sheets/1/b.pdf', 'sheets/1/c.jpg'],
      }),
    ).toEqual(['sheets/1/a.pdf', 'sheets/1/b.pdf', 'sheets/1/c.jpg'])
  })

  it('builds image sets and pdf list for mixed uploads', () => {
    const assets = resolveSheetAssets({
      sheets: [
        'sheets/1/arr.pdf',
        'sheets/1/learning.pdf',
        'sheets/1/scan.jpg',
        'sheets/1/alt.png',
      ],
      sheet_pages: ['sheets/1/pages/page-01.webp', 'sheets/1/pages/page-02.webp'],
    })
    expect(assets.pdfs.map((p) => p.label)).toEqual(['arr.pdf', 'learning.pdf'])
    expect(assets.imageSets.map((s) => s.label)).toEqual([
      'Pages (2)',
      'scan.jpg',
      'alt.png',
    ])
    expect(assets.imageSets[0]!.paths).toHaveLength(2)
    expect(assets.canChooseFormat).toBe(true)
  })

  it('omits the primary sheet image when raster pages already cover it', () => {
    const assets = resolveSheetAssets({
      sheet: 'sheets/1/sheet.jpg',
      sheets: ['sheets/1/sheet.jpg'],
      sheet_pages: ['sheets/1/pages/page-01.webp'],
    })
    expect(assets.imageSets.map((s) => s.label)).toEqual(['Pages'])
    expect(assets.imageSets[0]!.paths).toEqual(['sheets/1/pages/page-01.webp'])
    expect(assets.canChooseFormat).toBe(false)
  })

  it('does not treat PDF raster pages as a separate image format', () => {
    const assets = resolveSheetAssets({
      sheet: 'sheets/1/sheet.pdf',
      sheets: ['sheets/1/sheet.pdf'],
      sheet_pages: ['sheets/1/pages/page-01.webp'],
    })
    expect(assets.imageSets.map((s) => s.label)).toEqual(['Pages'])
    expect(assets.pdfs).toHaveLength(1)
    expect(assets.canChooseFormat).toBe(false)
  })

  it('does not treat Sheet Preview.webp as a distinct image format beside pages', () => {
    const assets = resolveSheetAssets({
      sheet: 'sheets/1/sheet.pdf',
      sheets: [
        'sheets/1/sheet.pdf',
        'sheets/1/Song Title - Sheet Preview.webp',
      ],
      sheet_preview: 'sheets/1/preview.webp',
      sheet_pages: ['sheets/1/preview.webp'],
    })
    expect(assets.imageSets.map((s) => s.label)).toEqual(['Pages'])
    expect(assets.pdfs).toHaveLength(1)
    expect(assets.canChooseFormat).toBe(false)
  })

  it('keeps alternate images alongside pages from a primary PDF', () => {
    const assets = resolveSheetAssets({
      sheet: 'sheets/1/sheet.pdf',
      sheets: ['sheets/1/sheet.pdf', 'sheets/1/scan.jpg'],
      sheet_pages: ['sheets/1/pages/page-01.webp'],
    })
    expect(assets.imageSets.map((s) => s.label)).toEqual(['Pages', 'scan.jpg'])
    expect(assets.canChooseFormat).toBe(true)
  })

  it('omits mirror preview webp when sheet_pages already has preview.webp', () => {
    const assets = resolveSheetAssets({
      sheet: 'sheets/3995/Baby On Board (C Major) - Mason Eubank - Sheet.png',
      sheets: [
        'sheets/3995/Baby On Board (C Major) - Mason Eubank - Sheet.png',
        'sheets/3995/Baby On Board (C Major) - Mason Eubank - Sheet Preview.webp',
      ],
      sheet_preview: 'sheets/3995/preview.webp',
      sheet_pages: ['sheets/3995/preview.webp'],
    })
    expect(assets.imageSets.map((s) => s.label)).toEqual(['Pages'])
    expect(assets.imageSets[0]!.paths).toEqual(['sheets/3995/preview.webp'])
  })

  it('stacks original images when no raster pages', () => {
    const assets = resolveSheetAssets({
      sheets: ['sheets/1/p1.jpg', 'sheets/1/p2.jpg'],
    })
    expect(assets.pdfs).toEqual([])
    expect(assets.imageSets).toHaveLength(1)
    expect(assets.imageSets[0]!.paths).toEqual(['sheets/1/p1.jpg', 'sheets/1/p2.jpg'])
  })

  it('labels basenames', () => {
    expect(sheetFileLabel('sheets/9/Foo%20Bar.pdf')).toBe('Foo Bar.pdf')
  })

  it('downloadableSheetAssets prefers one Image and PDF label', () => {
    const assets = downloadableSheetAssets({
      sheet: 'sheets/137/A Good Old Fashioned Song and a Smile (A Major) - Sheet.jpg',
      sheets: [
        'sheets/137/A Good Old Fashioned Song and a Smile (A Major) - Sheet.jpg',
        'sheets/137/A Good Old Fashioned Song and a Smile (A Major) - Sheet Preview.webp',
      ],
      sheet_pages: ['sheets/137/preview.webp'],
    })
    expect(assets.map((a) => a.label)).toEqual(['Image'])
    expect(assets[0]!.path).toBe('sheets/137/preview.webp')
  })
})
