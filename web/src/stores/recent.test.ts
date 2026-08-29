/**
 * @vitest-environment happy-dom
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useRecentStore } from './recent'

describe('recent store', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  it('records browse opens with counts and timestamps', () => {
    const r = useRecentStore()
    r.markBrowseNavigation(5)
    expect(r.consumeBrowseNavigation(5)).toBe(true)
    r.recordOpen(5)
    r.markBrowseNavigation(5)
    expect(r.consumeBrowseNavigation(5)).toBe(true)
    r.recordOpen(5)
    expect(r.entries.find((e) => e.id === 5)?.opens).toBe(2)
    expect(r.sortedRecords('opens')[0]?.id).toBe(5)
  })

  it('counts opens marked from Recent the same as Browse', () => {
    const r = useRecentStore()
    r.markBrowseNavigation(7)
    expect(r.consumeBrowseNavigation(7)).toBe(true)
    r.recordOpen(7)
    r.markBrowseNavigation(7)
    expect(r.consumeBrowseNavigation(7)).toBe(true)
    r.recordOpen(7)
    expect(r.entries.find((e) => e.id === 7)?.opens).toBe(2)
  })

  it('does not count next/prev navigation without browse mark', () => {
    const r = useRecentStore()
    expect(r.consumeBrowseNavigation(9)).toBe(false)
    expect(r.count).toBe(0)
  })

  it('caps length and sorts by recent', () => {
    const r = useRecentStore()
    for (let i = 1; i <= 260; i++) {
      r.recordOpen(i)
    }
    expect(r.entries).toHaveLength(250)
    expect(r.sortedRecords('recent')[0]?.id).toBe(260)
  })

  it('dedupes and persists across store instances', () => {
    const r = useRecentStore()
    r.recordOpen(5)
    r.recordOpen(6)
    r.recordOpen(5)
    expect(r.sortedRecords('recent').map((e) => e.id)).toEqual([5, 6])
    setActivePinia(createPinia())
    const r2 = useRecentStore()
    expect(r2.sortedRecords('recent').map((e) => e.id)).toEqual([5, 6])
    r2.clear()
    expect(r2.entries).toEqual([])
  })

  it('removes a single entry', () => {
    const r = useRecentStore()
    r.recordOpen(5)
    r.recordOpen(6)
    r.remove(5)
    expect(r.sortedRecords('recent').map((e) => e.id)).toEqual([6])
    setActivePinia(createPinia())
    expect(useRecentStore().sortedRecords('recent').map((e) => e.id)).toEqual([6])
  })

  it('migrates legacy id list', () => {
    localStorage.setItem('singtags.recent.v1', JSON.stringify([3, 1, 2]))
    setActivePinia(createPinia())
    const r = useRecentStore()
    expect(r.sortedRecords('recent').map((e) => e.id)).toEqual([3, 1, 2])
    expect(r.entries.every((e) => e.opens === 1)).toBe(true)
  })

  it('tolerates corrupt storage', () => {
    localStorage.setItem('singtags.recent.v2', '{not-json')
    setActivePinia(createPinia())
    const r = useRecentStore()
    expect(r.entries).toEqual([])
  })
})
