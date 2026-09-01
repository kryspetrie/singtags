import { describe, expect, it } from 'vitest'
import { isTagFullscreenQuery, tagOpenLocation } from './tagOpen'

describe('tagOpen', () => {
  it('builds normal tag links without fullscreen', () => {
    expect(tagOpenLocation(31)).toEqual({ path: '/tag/31', query: {} })
  })

  it('adds fullscreen=1 for sing mode', () => {
    expect(tagOpenLocation(31, { fullscreen: true, shift: 2 })).toEqual({
      path: '/tag/31',
      query: { fullscreen: '1', shift: '2' },
    })
  })

  it('includes session detune cents when non-zero', () => {
    expect(tagOpenLocation(31, { detuneCents: -32 })).toEqual({
      path: '/tag/31',
      query: { detune: '-32' },
    })
  })

  it('detects fullscreen query and legacy aliases', () => {
    expect(isTagFullscreenQuery({ fullscreen: '1' })).toBe(true)
    expect(isTagFullscreenQuery({ fullscreen: 'true' })).toBe(true)
    expect(isTagFullscreenQuery({ sheet: '1' })).toBe(true)
    expect(isTagFullscreenQuery({ sing: '1' })).toBe(true)
    expect(isTagFullscreenQuery({})).toBe(false)
    expect(isTagFullscreenQuery({ sheet: '1', /* browse hasSheet filter is separate */ })).toBe(true)
  })
})
