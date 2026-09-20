/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it } from 'vitest'
import { imagePreviewUrls, shouldAutoUpgradePdf, usingPrefetchedPages } from './upgrades'

describe('sheetViewer/upgrades', () => {
  const sets = [
    { id: 'pages', label: 'Pages', paths: ['a.webp', 'b.webp'] },
    { id: 'alt', label: 'Alt', paths: ['c.webp'] },
  ]

  it('shouldAutoUpgradePdf is true for a single image set when PDF exists', () => {
    expect(shouldAutoUpgradePdf(true, [sets[0]!], sets[0]!)).toBe(true)
  })

  it('shouldAutoUpgradePdf is false for alternate scans', () => {
    expect(shouldAutoUpgradePdf(true, sets, sets[1]!)).toBe(false)
  })

  it('shouldAutoUpgradePdf is true for primary pages set among many', () => {
    expect(shouldAutoUpgradePdf(true, sets, sets[0]!)).toBe(true)
  })

  it('imagePreviewUrls uses prefetched pages for the default set', () => {
    const active = sets[0]!
    const prefetch = ['blob:1', 'blob:2']
    expect(imagePreviewUrls(active, '/lib/', prefetch, 'pages')).toEqual(prefetch)
  })

  it('imagePreviewUrls falls back to resolved paths', () => {
    const active = sets[1]!
    expect(imagePreviewUrls(active, '/library/', ['blob:1'], 'pages')).toEqual([
      '/library/c.webp',
    ])
  })

  it('usingPrefetchedPages matches prefetch length and default set id', () => {
    expect(usingPrefetchedPages(sets[0]!, ['a', 'b'], 'pages', 2)).toBe(true)
    expect(usingPrefetchedPages(sets[1]!, ['a', 'b'], 'pages', 2)).toBe(false)
  })
})
