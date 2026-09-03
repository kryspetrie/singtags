/**
 * @vitest-environment happy-dom
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useUserCollectionsStore } from './userCollections'

describe('userCollections store', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  it('creates, renames, and deletes collections', () => {
    const store = useUserCollectionsStore()
    const col = store.create('  Warm-ups  ', [1, 2, 2])
    expect(col).toBeTruthy()
    expect(col!.name).toBe('Warm-ups')
    expect(col!.tagIds).toEqual([1, 2])
    expect(store.count).toBe(1)

    expect(store.rename(col!.id, 'Contest set')).toBe(true)
    expect(store.byId(col!.id)?.name).toBe('Contest set')

    expect(store.remove(col!.id)).toBe(true)
    expect(store.count).toBe(0)
  })

  it('adds and removes tags; prunes to starred', () => {
    const store = useUserCollectionsStore()
    const col = store.create('Set', [10])!
    store.addTags(col.id, [20, 30])
    expect(store.byId(col.id)?.tagIds).toEqual([10, 20, 30])
    store.removeTags(col.id, [20])
    expect(store.byId(col.id)?.tagIds).toEqual([10, 30])
    store.pruneToStarred([30, 99])
    expect(store.byId(col.id)?.tagIds).toEqual([30])
  })

  it('deletes a collection when its last tag is removed', () => {
    const store = useUserCollectionsStore()
    const solo = store.create('Solo', [42])!
    const shared = store.create('Shared', [1, 2])!
    store.removeTags(solo.id, [42])
    expect(store.byId(solo.id)).toBeUndefined()
    expect(store.count).toBe(1)
    store.removeTags(shared.id, [1, 2])
    expect(store.byId(shared.id)).toBeUndefined()
    expect(store.count).toBe(0)
  })

  it('deletes empty collections during pruneToStarred', () => {
    const store = useUserCollectionsStore()
    const col = store.create('Set', [10, 20])!
    store.pruneToStarred([99])
    expect(store.byId(col.id)).toBeUndefined()
    expect(store.count).toBe(0)
  })

  it('does not wipe collections when prune keep-set is empty unless allowEmpty', () => {
    const store = useUserCollectionsStore()
    const col = store.create('Set', [10, 20])!
    store.pruneToStarred([])
    expect(store.byId(col.id)?.tagIds).toEqual([10, 20])
    store.pruneToStarred([], { allowEmpty: true })
    expect(store.byId(col.id)).toBeUndefined()
  })

  it('reports orphan tag ids missing from favorites', () => {
    const store = useUserCollectionsStore()
    store.create('A', [1, 2])
    store.create('B', [2, 3])
    expect(store.orphanTagIds([1, 9]).sort()).toEqual([2, 3])
    expect(store.orphanTagIds([1, 2, 3])).toEqual([])
  })

  it('persists to localStorage', () => {
    const store = useUserCollectionsStore()
    const col = store.create('Saved', [5])!
    setActivePinia(createPinia())
    const again = useUserCollectionsStore()
    expect(again.byId(col.id)?.name).toBe('Saved')
    expect(again.byId(col.id)?.tagIds).toEqual([5])
  })

  it('rejects empty names', () => {
    const store = useUserCollectionsStore()
    expect(store.create('   ')).toBeNull()
    expect(store.validateName('   ')).toBe('Enter a collection name')
  })

  it('rejects duplicate names (case-insensitive)', () => {
    const store = useUserCollectionsStore()
    store.create('Contest set', [1])!
    expect(store.create('contest set')).toBeNull()
    expect(store.create('  CONTEST   SET  ')).toBeNull()
    expect(store.validateName('Contest Set')).toBe('A collection with that name already exists')

    const second = store.create('Warm-ups', [2])!
    expect(store.rename(second.id, 'contest set')).toBe(false)
    expect(store.rename(second.id, 'warm-ups')).toBe(true)
  })

  it('setTagOrder and reorderTag only affect that collection', () => {
    const store = useUserCollectionsStore()
    const col = store.create('Set', [1, 2, 3])!
    const other = store.create('Other', [10, 20])!
    expect(store.setTagOrder(col.id, [3, 1, 2])).toBe(true)
    expect(store.byId(col.id)?.tagIds).toEqual([3, 1, 2])
    expect(store.byId(other.id)?.tagIds).toEqual([10, 20])
    expect(store.reorderTag(col.id, 3, 2)).toBe(true)
    expect(store.byId(col.id)?.tagIds).toEqual([1, 2, 3])
  })

  it('setOrder and moveCollection reorder the collection list', () => {
    const store = useUserCollectionsStore()
    const a = store.create('A', [])!
    const b = store.create('B', [])!
    const c = store.create('C', [])!
    expect(store.collections.map((x) => x.id)).toEqual([a.id, b.id, c.id])
    expect(store.setOrder([c.id, a.id, b.id])).toBe(true)
    expect(store.collections.map((x) => x.id)).toEqual([c.id, a.id, b.id])
    expect(store.moveCollection(c.id, 2)).toBe(true)
    expect(store.collections.map((x) => x.id)).toEqual([a.id, b.id, c.id])
  })
})
