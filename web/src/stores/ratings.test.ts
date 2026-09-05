/**
 * @vitest-environment happy-dom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { MY_RATINGS_KEY, useRatingsStore } from './ratings'

describe('ratings store', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  it('persists ratings locally and skips re-publish when unchanged', async () => {
    const fetchImpl = vi.fn(async () => new Response('ok', { status: 200 }))
    vi.stubGlobal('fetch', fetchImpl)

    const store = useRatingsStore()
    const first = await store.setRating(42, 5)
    expect(first.published).toBe(true)
    expect(store.starsFor(42)).toBe(5)
    expect(JSON.parse(localStorage.getItem(MY_RATINGS_KEY)!)).toMatchObject({
      '42': { stars: 5, publishedStars: 5 },
    })
    expect(fetchImpl).toHaveBeenCalledTimes(1)

    const second = await store.setRating(42, 5)
    expect(second.published).toBe(true)
    expect(fetchImpl).toHaveBeenCalledTimes(1)

    vi.unstubAllGlobals()
  })

  it('keeps local rating when publish fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('nope', { status: 200 })),
    )
    const store = useRatingsStore()
    const result = await store.setRating(7, 3)
    expect(result.published).toBe(false)
    expect(result.error).toBe('nope')
    expect(store.starsFor(7)).toBe(3)
    expect(store.get(7)?.publishedStars).toBeNull()
    vi.unstubAllGlobals()
  })

  it('clearRating removes only local state', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('ok', { status: 200 })))
    const store = useRatingsStore()
    await store.setRating(9, 2)
    store.clearRating(9)
    expect(store.has(9)).toBe(false)
    expect(localStorage.getItem(MY_RATINGS_KEY)).toBe('{}')
    vi.unstubAllGlobals()
  })
})
