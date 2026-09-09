import { describe, expect, it } from 'vitest'
import {
  FULLSCREEN_QUERY_FLAG,
  fullscreenQuery,
  hasFullscreenQuery,
  isFullscreenQueryFlag,
  searchParamsHaveFullscreen,
} from './fullscreenQuery'

describe('fullscreenQuery', () => {
  it('uses null so Vue Router emits bare ?fullscreen', () => {
    expect(FULLSCREEN_QUERY_FLAG).toBeNull()
    expect(fullscreenQuery(true)).toEqual({ fullscreen: null })
    expect(fullscreenQuery(false)).toEqual({})
  })

  it('detects bare and legacy values', () => {
    expect(isFullscreenQueryFlag(null)).toBe(true)
    expect(isFullscreenQueryFlag('')).toBe(true)
    expect(isFullscreenQueryFlag('1')).toBe(true)
    expect(isFullscreenQueryFlag('true')).toBe(true)
    expect(isFullscreenQueryFlag(true)).toBe(true)
    expect(isFullscreenQueryFlag('0')).toBe(false)
    expect(isFullscreenQueryFlag(undefined)).toBe(false)
    expect(hasFullscreenQuery({ fullscreen: null })).toBe(true)
    expect(hasFullscreenQuery({})).toBe(false)
  })

  it('reads URLSearchParams bare and =1 forms', () => {
    expect(searchParamsHaveFullscreen('?fullscreen')).toBe(true)
    expect(searchParamsHaveFullscreen('?fullscreen=1')).toBe(true)
    expect(searchParamsHaveFullscreen('?fullscreen=true')).toBe(true)
    expect(searchParamsHaveFullscreen('?fullscreen=0')).toBe(false)
    expect(searchParamsHaveFullscreen('')).toBe(false)
  })
})
