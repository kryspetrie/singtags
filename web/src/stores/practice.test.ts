/**
 * @vitest-environment happy-dom
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { usePracticeStore } from './practice'

describe('practice store', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  it('syncs from starred keeping existing order', () => {
    const p = usePracticeStore()
    p.resetFromStarred([3, 1, 2])
    p.syncFromStarred([1, 2, 4])
    expect(p.order).toEqual([1, 2, 4])
  })

  it('moves items and reports neighbors', () => {
    const p = usePracticeStore()
    p.resetFromStarred([10, 20, 30])
    p.move(20, -1)
    expect(p.order).toEqual([20, 10, 30])
    expect(p.neighbors(10)).toEqual({ prev: 20, next: 30, index: 1, total: 3 })
  })

  it('reorders by index', () => {
    const p = usePracticeStore()
    p.resetFromStarred([10, 20, 30])
    p.reorder(30, 0)
    expect(p.order).toEqual([30, 10, 20])
  })

  it('remove drops ids; firstId handles empty', () => {
    const p = usePracticeStore()
    p.resetFromStarred([1, 2])
    p.remove(1)
    expect(p.order).toEqual([2])
    p.remove(2)
    expect(p.firstId()).toBeNull()
  })
})
