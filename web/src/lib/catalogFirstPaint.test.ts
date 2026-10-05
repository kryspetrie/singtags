import { describe, expect, it, vi, afterEach } from 'vitest'
import {
  browseUrlLooksDefault,
  clearCatalogFirstPaint,
  CATALOG_FIRST_PAINT_KEY,
  loadCatalogFirstPaint,
  saveCatalogFirstPaint,
} from './catalogFirstPaint'
import type { TagSummary } from '../types/tag'

function tag(id: number, title: string, collection: string | null = 'Classic'): TagSummary {
  return {
    id,
    title,
    arranger: null,
    key: null,
    rating: null,
    type: null,
    collection,
    hasSheet: false,
    audioParts: [],
    sheet: null,
  }
}

describe('catalogFirstPaint', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    clearCatalogFirstPaint()
  })

  it('saves a collection-sorted viewport slice and total count', () => {
    const store = new Map<string, string>()
    const storage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => store.set(k, v),
      removeItem: (k: string) => store.delete(k),
    }
    vi.stubGlobal('localStorage', storage)
    vi.stubGlobal('sessionStorage', storage)

    const tags = [
      ...Array.from({ length: 60 }, (_, i) => tag(i + 1, `C${i + 1}`, 'Classic')),
      ...Array.from({ length: 60 }, (_, i) => tag(i + 101, `D${i + 1}`, '100')),
    ]
    saveCatalogFirstPaint(tags)
    const fp = loadCatalogFirstPaint()
    expect(fp?.totalCount).toBe(120)
    expect(fp?.tags.length).toBe(96)
    expect(fp?.jumpKeys?.length).toBeGreaterThanOrEqual(2)
    expect(fp?.jumpKeys).toEqual(expect.arrayContaining(['Classic']))
    expect(store.has(CATALOG_FIRST_PAINT_KEY)).toBe(true)
  })

  it('browseUrlLooksDefault ignores empty search and rejects active filters', () => {
    expect(browseUrlLooksDefault('')).toBe(true)
    expect(browseUrlLooksDefault('?')).toBe(true)
    expect(browseUrlLooksDefault('?q=hello')).toBe(false)
    expect(browseUrlLooksDefault('?col=Classic')).toBe(false)
    expect(browseUrlLooksDefault('?ft=1')).toBe(false)
    expect(browseUrlLooksDefault('?rev=1')).toBe(false)
    expect(browseUrlLooksDefault('?at=1204')).toBe(false)
    expect(browseUrlLooksDefault('?scroll=800')).toBe(false)
    expect(browseUrlLooksDefault('?sy=800')).toBe(false)
    expect(browseUrlLooksDefault('?sec=Classic')).toBe(false)
  })
})
