/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import { parseTagQrPayload } from './tagQrScan'

describe('parseTagQrPayload', () => {
  it('parses absolute tag URLs and preserves session query', () => {
    expect(
      parseTagQrPayload(
        'https://example.com/tag/31?fullscreen=1&shift=2&detune=-32&set=practice',
        {
          baseOrigin: 'https://app.test',
        },
      ),
    ).toEqual({
      path: '/tag/31',
      query: { fullscreen: '1', shift: '2', detune: '-32', set: 'practice' },
    })
  })

  it('parses relative /tag/:id paths against the app origin', () => {
    expect(parseTagQrPayload('/tag/9', { baseOrigin: 'https://app.test' })).toEqual({
      path: '/tag/9',
      query: {},
    })
  })

  it('accepts foreign origins when the path is a SingTags tag link', () => {
    expect(
      parseTagQrPayload('https://other.host/tag/12?sheet=1', { baseOrigin: 'https://app.test' }),
    ).toEqual({
      path: '/tag/12',
      query: { sheet: '1' },
    })
  })

  it('rejects non-tag payloads', () => {
    expect(parseTagQrPayload('https://example.com/favorites', { baseOrigin: 'https://app.test' })).toBeNull()
    expect(parseTagQrPayload('hello', { baseOrigin: 'https://app.test' })).toBeNull()
    expect(parseTagQrPayload('', { baseOrigin: 'https://app.test' })).toBeNull()
  })
})
