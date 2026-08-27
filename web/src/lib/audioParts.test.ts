import { describe, expect, it } from 'vitest'
import { partFromMediaPath, pathMatchesParts } from './audioParts'

describe('audioParts', () => {
  it('parses part from media path', () => {
    expect(partFromMediaPath('media/42/lead.m4a')).toBe('lead')
    expect(partFromMediaPath('media/42/Mix.m4a')).toBe('mix')
    expect(partFromMediaPath('media/31/lead.playback.opus')).toBe('lead')
    expect(partFromMediaPath('media/31/lead.solo.opus')).toBe('lead')
    expect(partFromMediaPath('media/3/mix.ultra_mix.opus')).toBe('mix')
  })

  it('filters paths by mode', () => {
    expect(pathMatchesParts('media/1/mix.m4a', 'mix', [])).toBe(true)
    expect(pathMatchesParts('media/1/lead.m4a', 'mix', [])).toBe(false)
    expect(pathMatchesParts('media/1/lead.m4a', 'custom', ['lead'])).toBe(true)
    expect(pathMatchesParts('media/1/tenor.m4a', 'custom', ['lead'])).toBe(false)
  })
})
