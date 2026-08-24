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

  it('pushes newest first and caps length', () => {
    const r = useRecentStore()
    for (let i = 1; i <= 15; i++) r.push(i)
    expect(r.list[0]).toBe(15)
    expect(r.list).toHaveLength(12)
    expect(r.list).not.toContain(1)
  })

  it('dedupes and persists across store instances', () => {
    const r = useRecentStore()
    r.push(5)
    r.push(6)
    r.push(5)
    expect(r.list).toEqual([5, 6])
    setActivePinia(createPinia())
    const r2 = useRecentStore()
    expect(r2.list).toEqual([5, 6])
    r2.clear()
    expect(r2.list).toEqual([])
  })

  it('tolerates corrupt storage', () => {
    localStorage.setItem('singtags.recent.v1', '{not-json')
    setActivePinia(createPinia())
    const r = useRecentStore()
    expect(r.list).toEqual([])
  })
})
