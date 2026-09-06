/**
 * @vitest-environment happy-dom
 */
import { createPinia, setActivePinia } from 'pinia'
import { describe, expect, it, beforeEach } from 'vitest'
import {
  armTagReturnScroll,
  clearTagReturnOrigin,
  peekTagReturnScrollY,
} from '../lib/tagReturn'
import { usePreferencesStore } from '../stores/preferences'
import { browseScrollIntent, router } from './index'

describe('router', () => {
  beforeEach(() => {
    clearTagReturnOrigin()
    localStorage.clear()
    setActivePinia(createPinia())
  })

  it('registers primary routes', () => {
    const names = router.getRoutes().map((r) => r.name)
    expect(names).toEqual(
      expect.arrayContaining([
        'home',
        'tag',
        'recent',
        'favorites',
        'pitch-pipe',
        'queue',
        'tx',
        'rx',
        'labs',
        'labs-pitch-pipe-sound',
        'roulette',
        'library',
        'library-doc',
      ]),
    )
  })

  it('redirects unknown paths to Browse', async () => {
    await router.push('/this-route-does-not-exist')
    expect(router.currentRoute.value.name).toBe('home')
    expect(router.currentRoute.value.path).toBe('/')
  })

  it('redirects nested unknown paths to Browse', async () => {
    await router.push('/library/missing/extra/segments')
    expect(router.currentRoute.value.name).toBe('home')
    expect(router.currentRoute.value.path).toBe('/')
  })

  it('redirects /labs/roulette to /roulette', async () => {
    await router.push('/labs/roulette')
    expect(router.currentRoute.value.name).toBe('roulette')
    expect(router.currentRoute.value.path).toBe('/roulette')
  })

  it('auto-enables Local Library when opening /library', async () => {
    const prefs = usePreferencesStore()
    expect(prefs.localLibraryEnabled).toBe(false)
    await router.push('/library')
    expect(router.currentRoute.value.name).toBe('library')
    expect(prefs.localLibraryEnabled).toBe(true)
  })

  it('scrollBehavior restores armed tag-return Y on Browse instead of top', async () => {
    const behavior = router.options.scrollBehavior
    expect(behavior).toBeTypeOf('function')
    armTagReturnScroll(360)
    const to = {
      name: 'home',
      path: '/',
      fullPath: '/',
      hash: '',
      query: {},
      params: {},
      matched: [],
      meta: {},
    }
    const from = {
      name: 'tag',
      path: '/tag/1',
      fullPath: '/tag/1',
      hash: '',
      query: {},
      params: { id: '1' },
      matched: [],
      meta: {},
    }
    // @ts-expect-error minimal route stubs for scrollBehavior
    const result = await behavior(to, from, null)
    expect(browseScrollIntent).toBe('restore')
    expect(result).toEqual({ left: 0, top: 360 })
    expect(peekTagReturnScrollY()).toBe(360)
  })

  it('scrollBehavior uses top for fresh Browse when no tag-return scroll', async () => {
    const behavior = router.options.scrollBehavior
    expect(behavior).toBeTypeOf('function')
    const to = {
      name: 'home',
      path: '/',
      fullPath: '/',
      hash: '',
      query: {},
      params: {},
      matched: [],
      meta: {},
    }
    const from = {
      name: 'favorites',
      path: '/favorites',
      fullPath: '/favorites',
      hash: '',
      query: {},
      params: {},
      matched: [],
      meta: {},
    }
    // @ts-expect-error minimal route stubs for scrollBehavior
    const result = await behavior(to, from, null)
    expect(browseScrollIntent).toBe('top')
    expect(result).toEqual({ top: 0 })
  })

  it('scrollBehavior keeps position on Browse query-only updates', async () => {
    const behavior = router.options.scrollBehavior
    expect(behavior).toBeTypeOf('function')
    const to = {
      name: 'home',
      path: '/',
      fullPath: '/?q=foo',
      hash: '',
      query: { q: 'foo' },
      params: {},
      matched: [],
      meta: {},
    }
    const from = {
      name: 'home',
      path: '/',
      fullPath: '/',
      hash: '',
      query: {},
      params: {},
      matched: [],
      meta: {},
    }
    // @ts-expect-error minimal route stubs for scrollBehavior
    const result = await behavior(to, from, null)
    expect(result).toBe(false)
  })
})