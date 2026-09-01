import { describe, expect, it } from 'vitest'
import {
  collectionLabel,
  collectionNumberBadge,
  collectionSearchTokens,
  collectionSortKey,
  mergeBrowseCollectionOptions,
  filterTagsByCollectionOptions,
  userCollectionFilterId,
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

describe('user collection browse helpers', () => {
  it('orders catalog by sortRank then custom in given order', () => {
    const opts = mergeBrowseCollectionOptions(
      ['easytags', 'classic', '100'],
      [
        { id: 'u2', name: 'Zebra' },
        { id: 'u1', name: 'Contest set' },
      ],
    )
    expect(opts.map((o) => o.label)).toEqual([
      'Classic',
      '100 Days: 100 Tags',
      'Easy Tags',
      'Zebra',
      'Contest set',
    ])
    expect(opts.filter((o) => o.custom).every((o) => o.id.startsWith('user:'))).toBe(true)
  })

  it('filters by catalog id or user membership (OR)', () => {
    const tags = [
      { id: 1, collection: 'classic' },
      { id: 2, collection: null },
      { id: 3, collection: '100' },
    ] as any
    const user = [{ id: 'u1', tagIds: [2, 3] }]
    const hit = filterTagsByCollectionOptions(
      tags,
      ['classic', userCollectionFilterId('u1')],
      user,
    )
    expect(hit.map((t: any) => t.id).sort()).toEqual([1, 2, 3])
  })
})
