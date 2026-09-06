/**
 * @vitest-environment happy-dom
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { ROULETTE_PREFS_KEY, ROULETTE_SESSION_KEY, useRouletteStore } from './roulette'
import type { TagSummary } from '../types/tag'

function tag(id: number, collection = 'classic'): TagSummary {
  return {
    id,
    title: `Title ${id}`,
    arranger: 'Arr',
    key: null,
    rating: 4,
    downloads: id * 10,
    type: null,
    collection,
    classic: id,
    year: 2000 + (id % 20),
    hasSheet: true,
    audioParts: [],
    sheet: null,
  }
}

describe('roulette store', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  it('loads seed modes and deals from active mode', () => {
    const store = useRouletteStore()
    expect(store.modes.map((m) => m.id)).toEqual([
      'full-library-rating',
      'classic-equal',
      'collections-heavy',
    ])
    store.setActiveModeId('full-library-rating')
    expect(store.activeMode.slices[0]!.curve).toBe('leftSkew')
    const catalog = [
      ...Array.from({ length: 15 }, (_, i) => tag(100 + i, 'classic')),
      ...Array.from({ length: 15 }, (_, i) => tag(200 + i, '100')),
      ...Array.from({ length: 10 }, (_, i) => tag(300 + i, 'easytags')),
      ...Array.from({ length: 15 }, (_, i) => tag(400 + i, 'other')),
    ]
    store.dealBatch(catalog, () => 0.25)
    expect(store.items.length).toBe(10)
    expect(JSON.parse(localStorage.getItem(ROULETTE_SESSION_KEY)!).items).toHaveLength(10)
  })

  it('marks sung and reset clears sung', () => {
    const store = useRouletteStore()
    store.addMode()
    store.setBatchSize(3)
    store.dealBatch([tag(1), tag(2), tag(3), tag(4)], () => 0)
    const id = store.items[0]!.id
    store.markSung(id)
    expect(store.isSung(id)).toBe(true)
    store.resetBatch()
    expect(store.sungIds).toEqual([])
    expect(store.items).toHaveLength(3)
  })

  it('persists mode slice edits', () => {
    const store = useRouletteStore()
    store.addMode()
    store.setSlices([
      { weightPct: 70, pool: 'classic', score: 'uniform', curve: 'equal' },
      { weightPct: 30, pool: 'other', score: 'year', curve: 'bell' },
    ])
    const id = store.activeModeId
    const saved = JSON.parse(localStorage.getItem(ROULETTE_PREFS_KEY)!)
    expect(saved.modes.find((m: { id: string }) => m.id === id).slices).toHaveLength(2)
    setActivePinia(createPinia())
    const again = useRouletteStore()
    again.setActiveModeId(id)
    expect(again.activeMode.slices).toHaveLength(2)
  })

  it('creates a blank custom mode that can use multiple slices', () => {
    const store = useRouletteStore()
    store.addMode()
    expect(store.isBuiltinActive).toBe(false)
    expect(store.activeMode.label).toBe('New mode')
    store.setSlices([
      { weightPct: 50, pool: 'classic', score: 'uniform', curve: 'equal' },
      { weightPct: 50, pool: 'favorites', score: 'rating', curve: 'leftSkew' },
    ])
    expect(store.activeMode.slices).toHaveLength(2)
    expect(store.activeMode.slices[0]!.pool).toBe('classic')
  })

  it('refuses to delete built-in modes and only allows curve/score edits', () => {
    const store = useRouletteStore()
    store.setActiveModeId('full-library-rating')
    expect(store.isBuiltinActive).toBe(true)
    expect(store.deleteActiveMode()).toBe(false)
    expect(store.modes.some((m) => m.id === 'full-library-rating')).toBe(true)

    store.setSlices([
      { weightPct: 40, pool: 'other', score: 'downloads', curve: 'bell' },
      { weightPct: 60, pool: 'easytags', score: 'year', curve: 'rightSkew' },
    ])
    expect(store.activeMode.slices).toHaveLength(1)
    expect(store.activeMode.slices[0]).toMatchObject({
      pool: 'all',
      weightPct: 100,
      score: 'downloads',
      curve: 'bell',
    })
    expect(store.activeMode.label).toBe('All tags')

    store.renameActiveMode('Nope')
    expect(store.activeMode.label).toBe('All tags')
  })
})
