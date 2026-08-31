/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import type { RouteLocationNormalized, Router } from 'vue-router'
import { useRecentStore } from '../stores/recent'
import {
  captureTagReturnOrigin,
  clearTagReturnOrigin,
  goTagBack,
  labelForListRoute,
  onTagReturnBeforeEach,
  peekTagReturnOrigin,
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
    params: {},
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
    captureTagReturnOrigin(listRoute({ name: 'favorites', path: '/favorites', fullPath: '/favorites?q=foo' }))
    expect(peekTagReturnOrigin()).toEqual({
      name: 'favorites',
      fullPath: '/favorites?q=foo',
      label: 'Favorites',
      scrollY: 420,
    })
    captureTagReturnOrigin(listRoute({ name: 'tag', path: '/tag/1', fullPath: '/tag/1' }))
    expect(peekTagReturnOrigin()?.fullPath).toBe('/favorites?q=foo')
  })

  it('onTagReturnBeforeEach only captures list → tag', () => {
    onTagReturnBeforeEach(
      listRoute({ name: 'tag', path: '/tag/9', fullPath: '/tag/9' }),
      listRoute({ name: 'home', path: '/', fullPath: '/?q=bar' }),
    )
    expect(peekTagReturnOrigin()?.label).toBe('Browse')
    expect(peekTagReturnOrigin()?.fullPath).toBe('/?q=bar')

    onTagReturnBeforeEach(
      listRoute({ name: 'tag', path: '/tag/10', fullPath: '/tag/10' }),
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

  it('tagBackLabel uses practice / origin / Browse default', () => {
    expect(tagBackLabel({ query: { set: 'practice' } })).toBe('← Practice set')
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

  it('goTagBack uses history.back when previous entry is not a tag', () => {
    const router = { back: vi.fn(), push: vi.fn() } as unknown as Router
    vi.stubGlobal('history', { state: { back: '/favorites', current: '/tag/1' } })
    setTagReturnOriginForTests({
      name: 'favorites',
      fullPath: '/favorites',
      label: 'Favorites',
      scrollY: 10,
    })
    goTagBack(router, { query: {} })
    expect(router.back).toHaveBeenCalled()
    expect(router.push).not.toHaveBeenCalled()
  })

  it('goTagBack skips a previous tag entry and pushes the list origin', async () => {
    const push = vi.fn(async () => undefined)
    const router = { back: vi.fn(), push } as unknown as Router
    vi.stubGlobal('history', { state: { back: '/tag/1', current: '/tag/2' } })
    setTagReturnOriginForTests({
      name: 'home',
      fullPath: '/?q=x',
      label: 'Browse',
      scrollY: 88,
    })
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
    goTagBack(router, { query: {} })
    expect(router.back).not.toHaveBeenCalled()
    expect(push).toHaveBeenCalledWith('/?q=x')
    await Promise.resolve()
    await new Promise((r) => requestAnimationFrame(() => r(undefined)))
    expect(scrollTo).toHaveBeenCalledWith({ top: 88, left: 0, behavior: 'auto' })
  })

  it('goTagBack sends practice set to favorites', () => {
    const router = { back: vi.fn(), push: vi.fn() } as unknown as Router
    goTagBack(router, { query: { set: 'practice' } })
    expect(router.push).toHaveBeenCalledWith('/favorites')
  })
})
