/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it } from 'vitest'
import {
  canCrossfadePageUrls,
  isOwnedPagesLoadStale,
  revokeObjectUrls,
} from './pageTransition'

describe('sheetViewer/pageTransition', () => {
  it('canCrossfadePageUrls requires matching lengths and changed urls', () => {
    expect(canCrossfadePageUrls(['a'], ['b'], true)).toBe(true)
    expect(canCrossfadePageUrls(['a'], ['a'], true)).toBe(false)
    expect(canCrossfadePageUrls(['a'], ['a', 'b'], true)).toBe(false)
  })

  it('isOwnedPagesLoadStale respects abort, seq, and fade token', () => {
    expect(isOwnedPagesLoadStale(undefined, 1, 1, 2, 2)).toBe(false)
    expect(isOwnedPagesLoadStale({ aborted: true } as AbortSignal, 1, 1, 2, 2)).toBe(true)
    expect(isOwnedPagesLoadStale(undefined, 1, 2, 2, 2)).toBe(true)
    expect(isOwnedPagesLoadStale(undefined, undefined, 1, 2, 3)).toBe(true)
  })

  it('revokeObjectUrls swallows revoke errors', () => {
    const bad = 'not-a-blob' as string
    expect(() => revokeObjectUrls([bad])).not.toThrow()
  })
})
