/**
 * @vitest-environment happy-dom
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  isSessionBusy,
  onSessionBusyChange,
  resetSessionBusyForTests,
  sessionBusyReasons,
  setSessionBusy,
} from './sessionActivity'
import {
  armDeferredPwaUpdate,
  canApplyPwaUpdateNow,
  isDeferredPwaUpdatePending,
  PWA_RELOAD_SCROLL_KEY,
  resetDeferredPwaUpdateForTests,
  restoreScrollAfterPwaReload,
  saveScrollForPwaReload,
} from './deferredPwaUpdate'

describe('sessionActivity', () => {
  afterEach(() => {
    resetSessionBusyForTests()
  })

  it('tracks named busy reasons', () => {
    expect(isSessionBusy()).toBe(false)
    setSessionBusy('audio', true)
    expect(isSessionBusy()).toBe(true)
    expect(sessionBusyReasons()).toEqual(['audio'])
    setSessionBusy('audio', false)
    expect(isSessionBusy()).toBe(false)
  })

  it('notifies listeners on change', () => {
    const fn = vi.fn()
    const off = onSessionBusyChange(fn)
    setSessionBusy('fs', true)
    expect(fn).toHaveBeenCalledTimes(1)
    setSessionBusy('fs', true) // idempotent
    expect(fn).toHaveBeenCalledTimes(1)
    setSessionBusy('fs', false)
    expect(fn).toHaveBeenCalledTimes(2)
    off()
  })
})

describe('deferredPwaUpdate', () => {
  afterEach(() => {
    resetSessionBusyForTests()
    resetDeferredPwaUpdateForTests()
    sessionStorage.clear()
    vi.useRealTimers()
  })

  it('defers update while busy, then applies when idle', async () => {
    vi.useFakeTimers()
    const update = vi.fn(async () => {})
    setSessionBusy('audio', true)
    armDeferredPwaUpdate(update)
    expect(isDeferredPwaUpdatePending()).toBe(true)
    expect(update).not.toHaveBeenCalled()

    setSessionBusy('audio', false)
    await vi.runOnlyPendingTimersAsync()
    expect(update).toHaveBeenCalledTimes(1)
    expect(sessionStorage.getItem(PWA_RELOAD_SCROLL_KEY)).toBeTruthy()
  })

  it('canApplyPwaUpdateNow respects busy + fullscreen query', () => {
    expect(canApplyPwaUpdateNow()).toBe(true)
    setSessionBusy('x', true)
    expect(canApplyPwaUpdateNow()).toBe(false)
    setSessionBusy('x', false)
    const prev = window.location.search
    // happy-dom: mutate search via history
    window.history.replaceState({}, '', '/tag/1?fullscreen=1')
    expect(canApplyPwaUpdateNow()).toBe(false)
    window.history.replaceState({}, '', prev || '/')
    expect(canApplyPwaUpdateNow()).toBe(true)
  })

  it('restores scroll for the same path', () => {
    window.history.replaceState({}, '', '/?q=1')
    sessionStorage.setItem(
      PWA_RELOAD_SCROLL_KEY,
      JSON.stringify({ path: '/?q=1', scrollY: 320, at: Date.now() }),
    )
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
    restoreScrollAfterPwaReload()
    expect(scrollTo).toHaveBeenCalledWith(0, 320)
    expect(sessionStorage.getItem(PWA_RELOAD_SCROLL_KEY)).toBeNull()
    scrollTo.mockRestore()
  })

  it('saveScrollForPwaReload writes snapshot', () => {
    window.history.replaceState({}, '', '/browse')
    Object.defineProperty(window, 'scrollY', { configurable: true, get: () => 88 })
    saveScrollForPwaReload()
    const raw = sessionStorage.getItem(PWA_RELOAD_SCROLL_KEY)
    expect(raw).toBeTruthy()
    expect(JSON.parse(raw!).scrollY).toBe(88)
  })
})
