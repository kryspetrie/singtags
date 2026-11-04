/**
 * @vitest-environment happy-dom
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { isSingTagsOffline } from './appOffline'

describe('isSingTagsOffline', () => {
  beforeEach(() => {
    localStorage.clear()
    Object.defineProperty(navigator, 'onLine', {
      configurable: true,
      get: () => true,
    })
  })

  afterEach(() => {
    localStorage.clear()
  })

  it('is false when online and manual offline is off', () => {
    expect(isSingTagsOffline()).toBe(false)
  })

  it('is true when Settings manual offline is on', () => {
    localStorage.setItem('singtags.manualOffline', '1')
    expect(isSingTagsOffline()).toBe(true)
  })

  it('is true when the browser reports offline', () => {
    Object.defineProperty(navigator, 'onLine', {
      configurable: true,
      get: () => false,
    })
    expect(isSingTagsOffline()).toBe(true)
  })
})
