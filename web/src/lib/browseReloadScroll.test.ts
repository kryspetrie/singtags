/**
 * @vitest-environment happy-dom
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  BROWSE_RELOAD_SCROLL_KEY,
  browsePathIgnoringScrollParams,
  browseReloadSnapIsSearchTop,
  consumeBrowseReloadScroll,
  isBrowseHomePath,
  saveBrowseReloadScroll,
} from './browseReloadScroll'

describe('browseReloadScroll', () => {
  afterEach(() => {
    sessionStorage.clear()
    vi.unstubAllGlobals()
    window.history.replaceState({}, '', '/')
  })

  it('detects Browse home under a Vite base path', () => {
    expect(isBrowseHomePath('/', '/')).toBe(true)
    expect(isBrowseHomePath('/singtags/', '/singtags/')).toBe(true)
    expect(isBrowseHomePath('/singtags', '/singtags/')).toBe(true)
    expect(isBrowseHomePath('/singtags/tag/12', '/singtags/')).toBe(false)
    expect(isBrowseHomePath('/favorites', '/')).toBe(false)
    expect(isBrowseHomePath('/tag/12', '/')).toBe(false)
  })

  it('saves scroll for Browse home only', () => {
    window.history.replaceState({}, '', '/')
    Object.defineProperty(window, 'scrollY', { configurable: true, get: () => 1440 })
    saveBrowseReloadScroll()
    const raw = sessionStorage.getItem(BROWSE_RELOAD_SCROLL_KEY)
    expect(JSON.parse(raw!).scrollY).toBe(1440)
  })

  it('does not save on tag routes', () => {
    window.history.replaceState({}, '', '/tag/12')
    saveBrowseReloadScroll(900)
    expect(sessionStorage.getItem(BROWSE_RELOAD_SCROLL_KEY)).toBeNull()
  })

  it('does not save on Favorites', () => {
    window.history.replaceState({}, '', '/favorites')
    saveBrowseReloadScroll(400)
    expect(sessionStorage.getItem(BROWSE_RELOAD_SCROLL_KEY)).toBeNull()
  })

  it('restores only on reload navigation', () => {
    window.history.replaceState({}, '', '/')
    sessionStorage.setItem(
      BROWSE_RELOAD_SCROLL_KEY,
      JSON.stringify({ path: '/', scrollY: 880, at: Date.now() }),
    )
    vi.stubGlobal('performance', {
      getEntriesByType: () => [{ type: 'navigate' }],
    })
    expect(consumeBrowseReloadScroll()).toBeNull()
    // Key still there after navigate miss — re-set for reload case
    sessionStorage.setItem(
      BROWSE_RELOAD_SCROLL_KEY,
      JSON.stringify({ path: '/', scrollY: 880, at: Date.now() }),
    )
    vi.stubGlobal('performance', {
      getEntriesByType: () => [{ type: 'reload' }],
    })
    expect(consumeBrowseReloadScroll()).toBe(880)
    expect(sessionStorage.getItem(BROWSE_RELOAD_SCROLL_KEY)).toBeNull()
  })

  it('ignores mismatched path on reload', () => {
    window.history.replaceState({}, '', '/')
    sessionStorage.setItem(
      BROWSE_RELOAD_SCROLL_KEY,
      JSON.stringify({ path: '/?q=old', scrollY: 500, at: Date.now() }),
    )
    vi.stubGlobal('performance', {
      getEntriesByType: () => [{ type: 'reload' }],
    })
    expect(consumeBrowseReloadScroll()).toBeNull()
  })

  it('treats near-zero scroll as search top', () => {
    window.history.replaceState({}, '', '/')
    sessionStorage.setItem(
      BROWSE_RELOAD_SCROLL_KEY,
      JSON.stringify({ path: '/', scrollY: 12, at: Date.now() }),
    )
    vi.stubGlobal('performance', {
      getEntriesByType: () => [{ type: 'reload' }],
    })
    expect(consumeBrowseReloadScroll()).toBe(0)
  })

  it('matches paths that only differ by at=', () => {
    expect(browsePathIgnoringScrollParams('/?at=1204')).toBe(
      browsePathIgnoringScrollParams('/'),
    )
    expect(browsePathIgnoringScrollParams('/?q=love&at=1')).toBe(
      browsePathIgnoringScrollParams('/?q=love'),
    )
  })

  it('honors a fresh search-top snap even when PTR reports navigate', () => {
    window.history.replaceState({}, '', '/?at=1204')
    sessionStorage.setItem(
      BROWSE_RELOAD_SCROLL_KEY,
      JSON.stringify({ path: '/?at=1204', scrollY: 4, at: Date.now() }),
    )
    vi.stubGlobal('performance', {
      getEntriesByType: () => [{ type: 'navigate' }],
    })
    expect(browseReloadSnapIsSearchTop()).toBe(true)
    expect(consumeBrowseReloadScroll()).toBe(0)
    expect(sessionStorage.getItem(BROWSE_RELOAD_SCROLL_KEY)).toBeNull()
  })

  it('does not honor mid-list snaps when navigation is not a reload', () => {
    window.history.replaceState({}, '', '/?at=1204')
    sessionStorage.setItem(
      BROWSE_RELOAD_SCROLL_KEY,
      JSON.stringify({ path: '/?at=1204', scrollY: 1800, at: Date.now() }),
    )
    vi.stubGlobal('performance', {
      getEntriesByType: () => [{ type: 'navigate' }],
    })
    expect(browseReloadSnapIsSearchTop()).toBe(false)
    expect(consumeBrowseReloadScroll()).toBeNull()
    expect(sessionStorage.getItem(BROWSE_RELOAD_SCROLL_KEY)).toBeTruthy()
  })
})
