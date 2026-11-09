/**
 * @vitest-environment happy-dom
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  NARROW_VIEWPORT_MQ,
  readIsNarrowViewport,
  syncNarrowViewportDataset,
} from './narrowViewport'

function stubMatchMedia(matches: boolean) {
  vi.stubGlobal('matchMedia', () => ({
    matches,
    media: NARROW_VIEWPORT_MQ,
    addEventListener: () => {},
    removeEventListener: () => {},
  }))
}

describe('narrowViewport', () => {
  afterEach(() => {
    delete document.documentElement.dataset.narrow
    vi.unstubAllGlobals()
  })

  it('syncNarrowViewportDataset stamps html[data-narrow]', () => {
    stubMatchMedia(true)
    expect(syncNarrowViewportDataset()).toBe('1')
    expect(document.documentElement.dataset.narrow).toBe('1')
    expect(syncNarrowViewportDataset(false)).toBe('0')
    expect(document.documentElement.dataset.narrow).toBe('0')
  })

  it('readIsNarrowViewport prefers the data-narrow stamp over matchMedia', () => {
    stubMatchMedia(false)
    document.documentElement.dataset.narrow = '1'
    expect(readIsNarrowViewport()).toBe(true)
    document.documentElement.dataset.narrow = '0'
    stubMatchMedia(true)
    expect(readIsNarrowViewport()).toBe(false)
  })

  it('readIsNarrowViewport falls back to matchMedia when unstamped', () => {
    stubMatchMedia(true)
    expect(readIsNarrowViewport()).toBe(true)
    stubMatchMedia(false)
    expect(readIsNarrowViewport()).toBe(false)
  })
})
