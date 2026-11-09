/**
 * @vitest-environment happy-dom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  applyWaitingPwaUpdate,
  bindPwaAppUpdate,
  checkForAppUpdate,
  hardResetAppShell,
  isAppShellCacheName,
  isPwaAppUpdatePending,
  resetPwaAppUpdateForTests,
} from './pwaAppUpdate'
import { resetDeferredPwaUpdateForTests } from './deferredPwaUpdate'

describe('pwaAppUpdate', () => {
  beforeEach(() => {
    resetPwaAppUpdateForTests()
    resetDeferredPwaUpdateForTests()
  })

  afterEach(() => {
    resetPwaAppUpdateForTests()
    resetDeferredPwaUpdateForTests()
    vi.restoreAllMocks()
  })

  it('classifies shell vs media cache names', () => {
    expect(isAppShellCacheName('workbox-precache-v2-https://www.singtags.com/')).toBe(true)
    expect(isAppShellCacheName('workbox-runtime-http://localhost/')).toBe(true)
    expect(isAppShellCacheName('singtags-indexes')).toBe(false)
    expect(isAppShellCacheName('singtags-sheets-v1')).toBe(false)
    expect(isAppShellCacheName('singtags-audio-v1')).toBe(false)
  })

  it('marks needRefresh from onNeedRefresh and applies waiting update', async () => {
    const update = vi.fn(async () => {})
    const { onNeedRefresh } = bindPwaAppUpdate(update)
    expect(isPwaAppUpdatePending()).toBe(false)
    onNeedRefresh()
    expect(isPwaAppUpdatePending()).toBe(true)
    await applyWaitingPwaUpdate()
    expect(update).toHaveBeenCalledWith(true)
    expect(isPwaAppUpdatePending()).toBe(false)
  })

  it('checkForAppUpdate reports offline without touching SW', async () => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false })
    const result = await checkForAppUpdate()
    expect(result).toEqual({ status: 'offline' })
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true })
  })

  it('hardResetAppShell deletes only shell caches and unregisters', async () => {
    const deleted: string[] = []
    const unregistered: string[] = []
    vi.stubGlobal('caches', {
      keys: async () => ['workbox-precache-v2-x', 'singtags-sheets-v1', 'singtags-indexes'],
      delete: async (name: string) => {
        deleted.push(name)
        return true
      },
    })
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: {
        getRegistrations: async () => [
          {
            unregister: async () => {
              unregistered.push('a')
              return true
            },
          },
        ],
      },
    })
    const reload = vi.fn()
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { reload },
    })

    await hardResetAppShell()
    expect(deleted).toEqual(['workbox-precache-v2-x'])
    expect(unregistered).toEqual(['a'])
    expect(reload).toHaveBeenCalled()
  })
})
