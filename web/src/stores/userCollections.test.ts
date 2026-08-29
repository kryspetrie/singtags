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
})
