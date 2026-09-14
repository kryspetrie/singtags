/**
 * @vitest-environment happy-dom
 */
import { afterEach, describe, expect, it } from 'vitest'
import {
  APP_THEME_DEFAULT,
  APP_THEME_STORAGE_KEY,
  applyAppTheme,
  normalizeAppTheme,
  resolveInitialAppTheme,
} from './theme'

describe('theme', () => {
  afterEach(() => {
    localStorage.removeItem(APP_THEME_STORAGE_KEY)
    document.documentElement.removeAttribute('data-theme')
    document.documentElement.style.colorScheme = ''
  })

  it('normalizes unknown values to light default', () => {
    expect(normalizeAppTheme('nope')).toBe(APP_THEME_DEFAULT)
    expect(normalizeAppTheme('dark')).toBe('dark')
    expect(normalizeAppTheme('hc-light')).toBe('hc-light')
  })

  it('applies data-theme and color-scheme', () => {
    applyAppTheme('dark')
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
    expect(document.documentElement.style.colorScheme).toBe('dark')

    applyAppTheme('light')
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false)
    expect(document.documentElement.style.colorScheme).toBe('light')
  })

  it('reads stored theme for initial resolve', () => {
    localStorage.setItem(APP_THEME_STORAGE_KEY, 'hc-dark')
    expect(resolveInitialAppTheme()).toBe('hc-dark')
  })
})
