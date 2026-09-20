/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it } from 'vitest'
import {
  cacheKeyForPdf,
  canRasterizePdfUrl,
  pdfRasterIdentity,
  resolveSheetSrc,
} from './urls'

describe('sheetViewer/urls', () => {
  it('resolveSheetSrc leaves absolute and blob URLs alone', () => {
    expect(resolveSheetSrc('/x')).toBe('/x')
    expect(resolveSheetSrc('blob:abc')).toBe('blob:abc')
    expect(resolveSheetSrc('https://cdn/a')).toBe('https://cdn/a')
    expect(resolveSheetSrc('data:text/plain,hi')).toBe('data:text/plain,hi')
  })

  it('resolveSheetSrc prefixes relative paths with baseUrl', () => {
    expect(resolveSheetSrc('p.webp', '/library/')).toBe('/library/p.webp')
    expect(resolveSheetSrc('p.webp', '/library')).toBe('/library/p.webp')
  })

  it('resolveSheetSrc uses mediaUrl for bare paths', () => {
    expect(resolveSheetSrc('sheets/1/p.webp')).toBe('/library/sheets/1/p.webp')
  })

  it('canRasterizePdfUrl allows remote PDFs when online', () => {
    expect(canRasterizePdfUrl('https://x/a.pdf', false)).toBe(true)
  })

  it('canRasterizePdfUrl blocks remote PDFs when offline', () => {
    expect(canRasterizePdfUrl('https://x/a.pdf', true)).toBe(false)
    expect(canRasterizePdfUrl('blob:local', true)).toBe(true)
    expect(canRasterizePdfUrl('data:application/pdf,x', true)).toBe(true)
  })

  it('pdfRasterIdentity prefers cacheKey', () => {
    expect(
      pdfRasterIdentity({ id: 'p', label: 'P', path: 'blob:x', cacheKey: ' stable ' }, 'blob:x'),
    ).toBe('stable')
    expect(pdfRasterIdentity({ id: 'p', label: 'P', path: 'blob:x' }, 'blob:x')).toBe('blob:x')
  })

  it('cacheKeyForPdf includes crop flag', () => {
    const pdf = { id: 'p', label: 'P', path: 's.pdf' }
    const a = cacheKeyForPdf(pdf, 'https://x/s.pdf', false)
    const b = cacheKeyForPdf(pdf, 'https://x/s.pdf', true)
    expect(a).not.toBe(b)
  })
})
