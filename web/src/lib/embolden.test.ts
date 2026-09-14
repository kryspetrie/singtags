/**
 * @vitest-environment happy-dom
 */
import { afterEach, describe, expect, it } from 'vitest'
import {
  EMBOLDEN_STORAGE_KEY,
  applyEmbolden,
  resolveInitialEmbolden,
  writeStoredEmbolden,
} from './embolden'

describe('embolden', () => {
  afterEach(() => {
    localStorage.removeItem(EMBOLDEN_STORAGE_KEY)
    document.documentElement.removeAttribute('data-embolden')
  })

  it('applies and clears data-embolden', () => {
    applyEmbolden(true)
    expect(document.documentElement.getAttribute('data-embolden')).toBe('1')
    applyEmbolden(false)
    expect(document.documentElement.hasAttribute('data-embolden')).toBe(false)
  })

  it('reads stored preference', () => {
    writeStoredEmbolden(true)
    expect(resolveInitialEmbolden()).toBe(true)
  })
})
