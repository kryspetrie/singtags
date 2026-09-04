/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import type { RouteLocationNormalized, Router } from 'vue-router'
import { useRecentStore } from '../stores/recent'
import {
  applyTagReturnScrollIfAny,
  armTagReturnScroll,
  captureTagReturnOrigin,
  clearTagReturnOrigin,
  consumeTagReturnScrollY,
  goTagBack,
  labelForListRoute,
  onTagReturnBeforeEach,
  peekTagReturnOrigin,
  peekTagReturnScrollY,
  setTagReturnOriginForTests,
  tagBackLabel,
} from './tagReturn'

function listRoute(
  partial: Partial<RouteLocationNormalized> & Pick<RouteLocationNormalized, 'path'>,
): RouteLocationNormalized {
  return {
    name: partial.name ?? 'home',
    path: partial.path,
    fullPath: partial.fullPath ?? partial.path,
    hash: '',
    query: {},
    params: partial.params ?? {},
    matched: partial.matched ?? [{ path: partial.path } as RouteLocationNormalized['matched'][0]],
    meta: {},
    redirectedFrom: undefined,
  } as RouteLocationNormalized
}

describe('tagReturn', () => {
  beforeEach(() => {
    clearTagReturnOrigin()
    vi.unstubAllGlobals()
    localStorage.clear()
    setActivePinia(createPinia())
  })

  it('labels list routes for the back button', () => {
    expect(labelForListRoute({ name: 'home', path: '/' })).toBe('Browse')
    expect(labelForListRoute({ name: 'favorites', path: '/favorites' })).toBe('Favorites')
    expect(labelForListRoute({ name: 'recent', path: '/recent' })).toBe('Recent')
    expect(labelForListRoute({ name: null, path: '/favorites' })).toBe('Favorites')
  })

  it('captures origin when entering a tag from a list, not tag→tag', () => {
    window.scrollTo(0, 420)
    Object.defineProperty(window, 'scrollY', { configurable: true, get: () => 420 })
    captureTagReturnOrigin(
      listRoute({ name: 'favorites', path: '/favorites', fullPath: '/favorites?q=foo' }),
      99,
    )
    expect(peekTagReturnOrigin()).toEqual({
      name: 'favorites',
      fullPath: '/favorites?q=foo',
      label: 'Favorites',
      scrollY: 420,
      tagId: 99,
    })
    captureTagReturnOrigin(listRoute({ name: 'tag', path: '/tag/1', fullPath: '/tag/1' }))
    expect(peekTagReturnOrigin()?.fullPath).toBe('/favorites?q=foo')
  })

  it('onTagReturnBeforeEach only captures list → tag', () => {
    onTagReturnBeforeEach(
      listRoute({ name: 'tag', path: '/tag/9', fullPath: '/tag/9', params: { id: '9' } }),
      listRoute({ name: 'home', path: '/', fullPath: '/?q=bar' }),
    )
    expect(peekTagReturnOrigin()?.label).toBe('Browse')
    expect(peekTagReturnOrigin()?.fullPath).toBe('/?q=bar')
    expect(peekTagReturnOrigin()?.tagId).toBe(9)

    onTagReturnBeforeEach(
      listRoute({ name: 'tag', path: '/tag/10', fullPath: '/tag/10', params: { id: '10' } }),
      listRoute({ name: 'tag', path: '/tag/9', fullPath: '/tag/9' }),
    )
    expect(peekTagReturnOrigin()?.fullPath).toBe('/?q=bar')
  })

  it('freezes Recent list order when leaving Recent for a tag', () => {
    const recent = useRecentStore()
    recent.recordOpen(1)
    recent.recordOpen(2)
    onTagReturnBeforeEach(
      listRoute({ name: 'tag', path: '/tag/1', fullPath: '/tag/1' }),
      listRoute({ name: 'recent', path: '/recent', fullPath: '/recent' }),
    )
    expect(peekTagReturnOrigin()?.label).toBe('Recent')
    expect(recent.frozenOrder).toEqual([2, 1])
    recent.recordOpen(1)
    expect(recent.displayRecords().map((e) => e.id)).toEqual([2, 1])

    onTagReturnBeforeEach(
      listRoute({ name: 'recent', path: '/recent', fullPath: '/recent' }),
      listRoute({ name: 'home', path: '/', fullPath: '/' }),
    )
    expect(recent.frozenOrder).toBeNull()
  })

  it('tagBackLabel uses origin / Browse default (practice mode disabled)', () => {
    expect(tagBackLabel({ query: { set: 'practice' } })).toBe('← Browse')
    expect(tagBackLabel({ query: {} })).toBe('← Browse')
    setTagReturnOriginForTests({
      name: 'favorites',
      fullPath: '/favorites',
      label: 'Favorites',
      scrollY: 0,
    })
    expect(tagBackLabel({ query: {} })).toBe('← Favorites')
    setTagReturnOriginForTests({
      name: 'recent',
      fullPath: '/recent',
      label: 'Recent',
      scrollY: 0,
    })
    expect(tagBackLabel({ query: {} })).toBe('← Recent')
  })

  it('goTagBack prefers captured list origin over history.back', () => {
    const push = vi.fn(async () => undefined)
    const router = { back: vi.fn(), push } as unknown as Router
    // Polluted stack: previous entry looks like a list, but origin is authoritative.
    vi.stubGlobal('history', { state: { back: '/favorites', current: '/tag/1' } })
    setTagReturnOriginForTests({
      name: 'home',
      fullPath: '/?q=foo',
      label: 'Browse',
      scrollY: 42,
    })
    goTagBack(router, { query: {} })
    expect(router.back).not.toHaveBeenCalled()
    expect(push).toHaveBeenCalledWith('/?q=foo')
    expect(peekTagReturnScrollY()).toBe(42)
  })

  it('goTagBack uses history.back when no origin was captured', () => {
    const router = { back: vi.fn(), push: vi.fn() } as unknown as Router
    vi.stubGlobal('history', { state: { back: '/favorites', current: '/tag/1' } })
    goTagBack(router, { query: {} })
    expect(router.back).toHaveBeenCalled()
    expect(router.push).not.toHaveBeenCalled()
    expect(peekTagReturnScrollY()).toBeNull()
  })

  it('goTagBack skips a previous tag entry and arms scroll for the list origin', () => {
    const push = vi.fn(async () => undefined)
    const router = { back: vi.fn(), push } as unknown as Router
    vi.stubGlobal('history', { state: { back: '/tag/1', current: '/tag/2' } })
    setTagReturnOriginForTests({
      name: 'home',
      fullPath: '/?q=x',
      label: 'Browse',
      scrollY: 88,
    })
    goTagBack(router, { query: {} })
    expect(router.back).not.toHaveBeenCalled()
    expect(push).toHaveBeenCalledWith('/?q=x')
    expect(peekTagReturnScrollY()).toBe(88)
  })

  it('goTagBack with leftover practice query uses list origin (practice mode dead)', () => {
    const push = vi.fn(async () => undefined)
    const router = { back: vi.fn(), push } as unknown as Router
    vi.stubGlobal('history', { state: { back: '/tag/1', current: '/tag/2' } })
    setTagReturnOriginForTests({
      name: 'favorites',
      fullPath: '/favorites',
      label: 'Favorites',
      scrollY: 0,
    })
    goTagBack(router, { query: { set: 'practice' } })
    expect(push).toHaveBeenCalledWith('/favorites')
    expect(peekTagReturnScrollY()).toBe(0)
  })

  it('goTagBack applies armed scroll when already on the list origin', () => {
    const push = vi.fn(async () => undefined)
    const replace = vi.fn(async () => undefined)
    const router = {
      back: vi.fn(),
      push,
      replace,
      currentRoute: { value: { path: '/', fullPath: '/', name: 'home' } },
    } as unknown as Router
    setTagReturnOriginForTests({
      name: 'home',
      fullPath: '/',
      label: 'Browse',
      scrollY: 640,
    })
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
    goTagBack(router, { query: {} })
    expect(push).not.toHaveBeenCalled()
    expect(replace).not.toHaveBeenCalled()
    expect(scrollTo).toHaveBeenCalledWith({ top: 640, left: 0, behavior: 'auto' })
    expect(peekTagReturnScrollY()).toBeNull()
  })

  it('goTagBack replaces when already on the list path but query differs', () => {
    const push = vi.fn(async () => undefined)
    const replace = vi.fn(async () => undefined)
    const router = {
      back: vi.fn(),
      push,
      replace,
      currentRoute: { value: { path: '/', fullPath: '/', name: 'home' } },
    } as unknown as Router
    setTagReturnOriginForTests({
      name: 'home',
      fullPath: '/?q=foo',
      label: 'Browse',
      scrollY: 120,
    })
    goTagBack(router, { query: {} })
    expect(push).not.toHaveBeenCalled()
    expect(replace).toHaveBeenCalledWith('/?q=foo')
    expect(peekTagReturnScrollY()).toBe(120)
  })

  it('applyTagReturnScrollIfAny consumes armed Y and scrolls', async () => {
    armTagReturnScroll(240)
    expect(peekTagReturnScrollY()).toBe(240)
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
    applyTagReturnScrollIfAny()
    expect(consumeTagReturnScrollY()).toBeNull()
    expect(scrollTo).toHaveBeenCalledWith({ top: 240, left: 0, behavior: 'auto' })
    await new Promise((r) => requestAnimationFrame(() => r(undefined)))
    await new Promise((r) => requestAnimationFrame(() => r(undefined)))
    await new Promise((r) => setTimeout(r, 60))
    expect(scrollTo.mock.calls.length).toBeGreaterThanOrEqual(2)
  })
})

