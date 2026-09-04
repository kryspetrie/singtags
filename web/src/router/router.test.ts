/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it, beforeEach } from 'vitest'
import {
  armTagReturnScroll,
  clearTagReturnOrigin,
  peekTagReturnScrollY,
} from '../lib/tagReturn'
import { browseScrollIntent, router } from './index'

describe('router', () => {
  beforeEach(() => {
    clearTagReturnOrigin()
  })

  it('registers primary routes', () => {
    const names = router.getRoutes().map((r) => r.name)
    expect(names).toEqual(expect.arrayContaining(['home', 'tag', 'recent', 'favorites', 'pitch-pipe', 'queue', 'tx', 'rx', 'labs', 'labs-pitch-pipe-sound', 'library', 'library-doc']))
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