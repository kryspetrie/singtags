/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it } from 'vitest'
import { resolveImageSets, resolvePdfs } from './assets'

describe('sheetViewer/assets', () => {
  it('passes through imageSets when provided', () => {
    const sets = [{ id: 'a', label: 'A', paths: ['x.webp'] }]
    expect(resolveImageSets(sets, [])).toBe(sets)
  })

  it('synthesizes a pages set from legacy pages prop', () => {
    expect(resolveImageSets([], ['p1.webp', 'p2.webp'])).toEqual([
      { id: 'pages', label: 'Pages (2)', paths: ['p1.webp', 'p2.webp'] },
    ])
  })

  it('synthesizes a single-page label', () => {
    expect(resolveImageSets([], ['only.webp'])).toEqual([
      { id: 'pages', label: 'Pages', paths: ['only.webp'] },
    ])
  })

  it('passes through pdfs when provided', () => {
    const pdfs = [{ id: 'x', label: 'X', path: 'a.pdf' }]
    expect(resolvePdfs(pdfs, null)).toBe(pdfs)
  })

  it('synthesizes a pdf entry from legacy pdf prop', () => {
    expect(resolvePdfs([], 'sheet.pdf')).toEqual([
      { id: 'pdf', label: 'PDF', path: 'sheet.pdf' },
    ])
  })
})
