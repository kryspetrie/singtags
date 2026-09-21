import { describe, expect, it, beforeEach } from 'vitest'
import { createEmptyArrangement } from '../../../domain/arranging/types'
import { createMemoryRepository, createLocalStorageRepository } from './localStorageRepository'
import {
  createIndexedDbRepository,
  LEGACY_MIGRATE_FLAG_KEY,
} from './indexedDbRepository'
import { putAllArrangingProjects } from '../../../offline/arrangingDb'
import 'fake-indexeddb/auto'

function memoryStorage(): Storage {
  const map = new Map<string, string>()
  return {
    get length() {
      return map.size
    },
    clear() {
      map.clear()
    },
    getItem(key: string) {
      return map.has(key) ? map.get(key)! : null
    },
    setItem(key: string, value: string) {
      map.set(key, String(value))
    },
    removeItem(key: string) {
      map.delete(key)
    },
    key(index: number) {
      return [...map.keys()][index] ?? null
    },
  }
}

describe('persistence adapters', () => {
  let storage: Storage

  beforeEach(async () => {
    storage = memoryStorage()
    ;(globalThis as { localStorage: Storage }).localStorage = storage
    await putAllArrangingProjects([])
  })

  it('memory repository round-trips', async () => {
    const repo = createMemoryRepository()
    const p = createEmptyArrangement('mem', { id: 'm1', now: 1 })
    await repo.saveAll([p])
    const loaded = await repo.loadAll()
    expect(loaded).toHaveLength(1)
    expect(loaded[0]!.title).toBe('mem')
  })

  it('localStorage repository round-trips', async () => {
    const repo = createLocalStorageRepository(storage)
    const p = createEmptyArrangement('ls', { id: 'l1', now: 1 })
    await repo.saveAll([p])
    const loaded = await repo.loadAll()
    expect(loaded).toHaveLength(1)
    expect(loaded[0]!.title).toBe('ls')
  })

  it('indexeddb repository migrates from empty to saved', async () => {
    const repo = createIndexedDbRepository()
    const p = createEmptyArrangement('idb', { id: 'i1', now: 2 })
    await repo.saveAll([p])
    const loaded = await repo.loadAll()
    expect(loaded.some((x) => x.id === 'i1')).toBe(true)
  })

  it('empty IDB after migrate does not re-import localStorage', async () => {
    storage.setItem(
      'arranging.projects.v1',
      JSON.stringify([createEmptyArrangement('legacy', { id: 'leg', now: 1 })]),
    )
    const repo = createIndexedDbRepository()
    const first = await repo.loadAll()
    expect(first.some((x) => x.id === 'leg')).toBe(true)
    expect(storage.getItem(LEGACY_MIGRATE_FLAG_KEY)).toBe('1')

    await repo.saveAll([])
    const second = await repo.loadAll()
    expect(second).toEqual([])
  })
})
