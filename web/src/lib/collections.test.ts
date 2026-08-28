import { describe, expect, it } from 'vitest'
import {
  collectionLabel,
  collectionNumberBadge,
  collectionSearchTokens,
  collectionSortKey,
} from './collections'

describe('collections', () => {
  it('labels known collections', () => {
    expect(collectionLabel('classic')).toBe('Classic')
    expect(collectionLabel('100')).toBe('100 Days: 100 Tags')
    expect(collectionLabel('easytags')).toBe('Easy Tags')
  })

  it('badges booklet numbers by series', () => {
    expect(collectionNumberBadge('classic', 12)?.label).toBe('Classic #12')
    expect(collectionNumberBadge('100', 7)?.label).toBe('100 Days #7')
    expect(collectionNumberBadge('100', 7)?.kind).toBe('days100')
    expect(collectionNumberBadge('easytags', null)?.short).toBe('Easy Tags')
    expect(collectionNumberBadge('easytags', null)?.kind).toBe('easytags')
  })

  it('indexes c# only for Classic and p# for 100 Days', () => {
    expect(collectionSearchTokens('classic', 5)).toEqual(['5', 'c5', 'classic5'])
    expect(collectionSearchTokens('100', 5)).toEqual(['p5', '100days5'])
    expect(collectionSearchTokens('easytags', 5)).toEqual([])
  })

  it('sorts Classic before 100 Days, then by booklet #', () => {
    const a = collectionSortKey({ id: 2, collection: '100', classic: 1 })
    const b = collectionSortKey({ id: 1, collection: 'classic', classic: 9 })
    expect(b[0]).toBeLessThan(a[0])
    const c = collectionSortKey({ id: 3, collection: 'classic', classic: 1 })
    expect(c[1]).toBeLessThan(b[1])
  })
})
