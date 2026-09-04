import { describe, expect, it } from 'vitest'
import {
  allocateQuotas,
  curveWeight,
  dealFromMode,
  drawUniformUnique,
  favGroupPoolId,
  normalizeRouletteBatchSize,
  normalizeRouletteCurve,
  parseRouletteSlice,
  pickWheelWinner,
  renormSlicesTo100,
  rouletteCurveEffect,
  rouletteEligibleTags,
  seedRouletteModes,
  sliceEligible,
  weightsForSlice,
  type RouletteMode,
} from './rouletteDraw'
import type { TagSummary } from '../types/tag'

function tag(
  id: number,
  opts: Partial<TagSummary> & { title?: string } = {},
): TagSummary {
  return {
    id,
    title: opts.title ?? `T${id}`,
    arranger: null,
    key: null,
    rating: opts.rating ?? null,
    downloads: opts.downloads ?? null,
    type: null,
    collection: opts.collection ?? null,
    classic: opts.classic ?? null,
    year: opts.year ?? null,
    hasSheet: false,
    audioParts: [],
    sheet: null,
  }
}

describe('rouletteDraw', () => {
  it('filters invalid ids', () => {
    expect(rouletteEligibleTags([tag(1), tag(0), tag(-2)]).map((t) => t.id)).toEqual([1])
  })

  it('filters pools', () => {
    const pool = [
      tag(1, { collection: 'classic' }),
      tag(2, { collection: '100' }),
      tag(3, { collection: 'easytags' }),
      tag(4, { collection: 'misc' }),
      tag(5, { collection: null }),
    ]
    expect(sliceEligible(pool, 'classic').map((t) => t.id)).toEqual([1])
    expect(sliceEligible(pool, 'days100').map((t) => t.id)).toEqual([2])
    expect(sliceEligible(pool, 'easytags').map((t) => t.id)).toEqual([3])
    expect(sliceEligible(pool, 'other').map((t) => t.id).sort()).toEqual([4, 5])
    expect(sliceEligible(pool, 'all')).toHaveLength(5)
  })

  it('filters Favorites and Favorites groups', () => {
    const pool = [tag(1), tag(2), tag(3), tag(4)]
    expect(sliceEligible(pool, 'favorites')).toEqual([])
    expect(
      sliceEligible(pool, 'favorites', { favoriteIds: new Set([2, 4]) }).map((t) => t.id),
    ).toEqual([2, 4])
    expect(
      sliceEligible(pool, favGroupPoolId('g1'), {
        favoriteGroups: [{ id: 'g1', name: 'Ballads', tagIds: [1, 3] }],
      }).map((t) => t.id),
    ).toEqual([1, 3])
    expect(sliceEligible(pool, favGroupPoolId('missing'), { favoriteGroups: [] })).toEqual([])
  })

  it('dealFromMode can draw only from Favorites', () => {
    const catalog = [tag(1), tag(2), tag(3), tag(4), tag(5)]
    const mode: RouletteMode = {
      id: 'favs',
      label: 'Favs',
      batchSize: 3,
      batchOrder: 'random',
      slices: [{ weightPct: 100, pool: 'favorites', score: 'uniform', curve: 'equal' }],
    }
    const result = dealFromMode(catalog, mode, () => 0.2, {
      favoriteIds: new Set([2, 4, 5]),
    })
    expect(result.tags).toHaveLength(3)
    expect(result.tags.every((t) => [2, 4, 5].includes(t.id))).toBe(true)
  })

  it('allocates quotas that sum to n', () => {
    expect(allocateQuotas([50, 20, 10, 20], 10).reduce((a, b) => a + b, 0)).toBe(10)
    expect(allocateQuotas([1, 1, 1], 4).reduce((a, b) => a + b, 0)).toBe(4)
  })

  it('curve weights: leftSkew favors high, rightSkew favors low', () => {
    expect(curveWeight(1, 'leftSkew')).toBeGreaterThan(curveWeight(0, 'leftSkew'))
    expect(curveWeight(0, 'rightSkew')).toBeGreaterThan(curveWeight(1, 'rightSkew'))
    expect(curveWeight(0.5, 'bell')).toBeGreaterThan(curveWeight(0, 'bell'))
    expect(curveWeight(0.5, 'bell')).toBeGreaterThan(curveWeight(1, 'bell'))
  })

  it('leftSkew rating weights favor high ratings', () => {
    const tags = [tag(1, { rating: 2 }), tag(2, { rating: 5 })]
    const w = weightsForSlice(tags, 'rating', 'leftSkew')
    expect(w[1]!).toBeGreaterThan(w[0]!)
  })

  it('rightSkew download weights favor low downloads', () => {
    const tags = [tag(1, { downloads: 10 }), tag(2, { downloads: 10_000 })]
    const w = weightsForSlice(tags, 'downloads', 'rightSkew')
    expect(w[0]!).toBeGreaterThan(w[1]!)
  })

  it('curve effect copy follows Score by', () => {
    expect(rouletteCurveEffect('leftSkew', 'rating')).toBe('Higher rating')
    expect(rouletteCurveEffect('leftSkew', 'downloads')).toBe('More downloads')
    expect(rouletteCurveEffect('leftSkew', 'year')).toBe('More recent')
    expect(rouletteCurveEffect('rightSkew', 'rating')).toBe('Lower rating')
    expect(rouletteCurveEffect('rightSkew', 'downloads')).toBe('Fewer downloads')
    expect(rouletteCurveEffect('rightSkew', 'year')).toBe('Older')
    expect(rouletteCurveEffect('equal', 'rating')).toBe('Same odds')
  })

  it('migrates legacy reverseJ curve id to rightSkew', () => {
    expect(normalizeRouletteCurve('reverseJ')).toBe('rightSkew')
    expect(parseRouletteSlice({ weightPct: 100, pool: 'all', score: 'rating', curve: 'reverseJ' })).toMatchObject({
      curve: 'rightSkew',
    })
  })

  it('draws n unique tags with injected rng', () => {
    const pool = [1, 2, 3, 4, 5].map((id) => tag(id))
    const drawn = drawUniformUnique(pool, 3, () => 0)
    expect(drawn).toHaveLength(3)
    expect(new Set(drawn.map((t) => t.id)).size).toBe(3)
  })

  it('dealFromMode respects mixture uniqueness and batch size', () => {
    const catalog = [
      ...Array.from({ length: 20 }, (_, i) => tag(100 + i, { collection: 'classic' })),
      ...Array.from({ length: 20 }, (_, i) =>
        tag(200 + i, { collection: '100', downloads: 100 + i * 50 }),
      ),
      ...Array.from({ length: 10 }, (_, i) =>
        tag(300 + i, { collection: 'easytags', rating: 2 + (i % 3) }),
      ),
      ...Array.from({ length: 20 }, (_, i) =>
        tag(400 + i, { collection: 'other', year: 1990 + i }),
      ),
    ]
    const mode: RouletteMode = {
      id: 'mix',
      label: 'Mix',
      batchSize: 10,
      batchOrder: 'bySlice',
      slices: [
        { weightPct: 50, pool: 'classic', score: 'uniform', curve: 'equal' },
        { weightPct: 20, pool: 'days100', score: 'downloads', curve: 'rightSkew' },
        { weightPct: 10, pool: 'easytags', score: 'rating', curve: 'leftSkew' },
        { weightPct: 20, pool: 'other', score: 'year', curve: 'bell' },
      ],
    }
    const result = dealFromMode(catalog, mode, () => 0.3)
    expect(result.tags).toHaveLength(10)
    expect(new Set(result.tags.map((t) => t.id)).size).toBe(10)
    expect(result.sliceCounts.reduce((a, b) => a + b, 0)).toBeGreaterThan(0)
  })

  it('spills when a pool is short', () => {
    const catalog = [
      tag(1, { collection: 'easytags' }),
      tag(2, { collection: 'easytags' }),
      ...Array.from({ length: 30 }, (_, i) => tag(100 + i, { collection: 'classic' })),
    ]
    const mode: RouletteMode = {
      id: 'short',
      label: 'Short easy',
      batchSize: 10,
      batchOrder: 'random',
      slices: [
        { weightPct: 80, pool: 'easytags', score: 'uniform', curve: 'equal' },
        { weightPct: 20, pool: 'classic', score: 'uniform', curve: 'equal' },
      ],
    }
    const result = dealFromMode(catalog, mode, () => 0.2)
    expect(result.tags).toHaveLength(10)
    expect(result.status).toMatch(/short/i)
  })

  it('renorms weights to ~100', () => {
    const out = renormSlicesTo100([
      { weightPct: 50, pool: 'classic', score: 'uniform', curve: 'equal' },
      { weightPct: 50, pool: 'other', score: 'uniform', curve: 'equal' },
      { weightPct: 50, pool: 'all', score: 'uniform', curve: 'equal' },
    ])
    const sum = out.reduce((a, s) => a + s.weightPct, 0)
    expect(sum).toBeCloseTo(100, 0)
  })

  it('ships seed modes: full library rating + classic equal', () => {
    const seeds = seedRouletteModes()
    expect(seeds.map((m) => m.id)).toEqual(['full-library-rating', 'classic-equal'])
    expect(seeds.map((m) => m.label)).toEqual(['All tags', 'Classic tags'])
    expect(seeds[0]!.slices[0]).toMatchObject({
      pool: 'all',
      score: 'rating',
      curve: 'leftSkew',
    })
    expect(seeds[1]!.slices[0]).toMatchObject({
      pool: 'classic',
      score: 'uniform',
      curve: 'equal',
    })
  })

  it('normalizes batch sizes', () => {
    expect(normalizeRouletteBatchSize(3)).toBe(3)
    expect(normalizeRouletteBatchSize(99)).toBe(10)
  })

  it('pickWheelWinner skips used ids', () => {
    expect(pickWheelWinner([1, 2, 3], [1, 2, 3])).toBeNull()
    expect(pickWheelWinner([1, 2, 3], [1, 2], () => 0)).toBe(3)
  })
})

