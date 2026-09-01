/**
 * @vitest-environment happy-dom
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  acquireWakeLock,
  isWakeLockHeld,
  releaseWakeLock,
  requestWakeLock,
  resetWakeLockForTests,
  wakeLockHoldersForTests,
} from './wakeLock'

describe('wakeLock', () => {
  afterEach(async () => {
    resetWakeLockForTests()
    vi.unstubAllGlobals()
  })

  it('no-ops when Wake Lock API is missing', async () => {
    vi.stubGlobal('navigator', {})
    await expect(acquireWakeLock('sheet')).resolves.toBeUndefined()
    expect(isWakeLockHeld()).toBe(false)
  })

  it('requests and releases a screen wake lock for a holder', async () => {
    const release = vi.fn(async () => {
      sentinel.released = true
    })
    const sentinel = {
      released: false,
      release,
      addEventListener: vi.fn(),
    }
    const request = vi.fn(async () => sentinel)
    vi.stubGlobal('navigator', { wakeLock: { request } })
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'visible',
    })

    await acquireWakeLock('sheet')
    expect(request).toHaveBeenCalledWith('screen')
    expect(isWakeLockHeld()).toBe(true)
    expect(wakeLockHoldersForTests()).toEqual(['sheet'])

    await releaseWakeLock('sheet')
    expect(release).toHaveBeenCalled()
    expect(isWakeLockHeld()).toBe(false)
  })

  it('keeps the lock while another holder still wants it', async () => {
    const release = vi.fn(async () => {
      sentinel.released = true
    })
    const sentinel = {
      released: false,
      release,
      addEventListener: vi.fn(),
    }
    const request = vi.fn(async () => sentinel)
    vi.stubGlobal('navigator', { wakeLock: { request } })
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'visible',
    })

    await acquireWakeLock('sheet')
    await acquireWakeLock('audio')
    expect(request).toHaveBeenCalledTimes(1)

    await releaseWakeLock('audio')
    expect(release).not.toHaveBeenCalled()
    expect(isWakeLockHeld()).toBe(true)
    expect(wakeLockHoldersForTests()).toEqual(['sheet'])

    await releaseWakeLock('sheet')
    expect(release).toHaveBeenCalled()
    expect(isWakeLockHeld()).toBe(false)
  })

  it('legacy requestWakeLock acquires the audio holder', async () => {
    const release = vi.fn(async () => {})
    const sentinel = { released: false, release, addEventListener: vi.fn() }
    const request = vi.fn(async () => sentinel)
    vi.stubGlobal('navigator', { wakeLock: { request } })
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'visible',
    })
    await requestWakeLock()
    expect(wakeLockHoldersForTests()).toEqual(['audio'])
    await releaseWakeLock('audio')
  })

  it('re-acquires when the document becomes visible again', async () => {
    const release = vi.fn(async () => {})
    const makeSentinel = () => ({
      released: false,
      release,
      addEventListener: vi.fn(),
    })
    const request = vi.fn(async () => makeSentinel())
    vi.stubGlobal('navigator', { wakeLock: { request } })
    let visibility: DocumentVisibilityState = 'visible'
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => visibility,
    })

    await acquireWakeLock('sheet')
    expect(request).toHaveBeenCalledTimes(1)

    visibility = 'hidden'
    document.dispatchEvent(new Event('visibilitychange'))
    visibility = 'visible'
    document.dispatchEvent(new Event('visibilitychange'))
    await vi.waitFor(() => {
      expect(request).toHaveBeenCalledTimes(2)
    })
  })
})
