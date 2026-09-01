import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import {
  buildTagSharePath,
  readDetuneFromQuery,
  shareOrCopyUrl,
  shouldPreferWebShare,
} from './tagShare'

describe('buildTagSharePath', () => {
  it('omits zero shift and optional flags', () => {
    expect(buildTagSharePath(31)).toEqual({ path: '/tag/31', query: {} })
    expect(buildTagSharePath(31, { shift: 0 })).toEqual({ path: '/tag/31', query: {} })
  })

  it('includes shift, practice, and optional fullscreen', () => {
    expect(buildTagSharePath(31, { shift: 2, practice: true })).toEqual({
      path: '/tag/31',
      query: { shift: '2', set: 'practice' },
    })
    expect(buildTagSharePath(31, { fullscreen: true })).toEqual({
      path: '/tag/31',
      query: { fullscreen: '1' },
    })
  })

  it('includes non-zero detune cents and clamps to ±50', () => {
    expect(buildTagSharePath(31, { detuneCents: -32 })).toEqual({
      path: '/tag/31',
      query: { detune: '-32' },
    })
    expect(buildTagSharePath(31, { shift: 1, detuneCents: 99 })).toEqual({
      path: '/tag/31',
      query: { shift: '1', detune: '50' },
    })
    expect(buildTagSharePath(31, { detuneCents: 0 }).query.detune).toBeUndefined()
  })
})

describe('readDetuneFromQuery', () => {
  it('returns null when absent and clamped cents when present', () => {
    expect(readDetuneFromQuery({})).toBeNull()
    expect(readDetuneFromQuery({ detune: '-32' })).toBe(-32)
    expect(readDetuneFromQuery({ detune: '0' })).toBe(0)
    expect(readDetuneFromQuery({ detune: '99' })).toBe(50)
  })
})

describe('shareOrCopyUrl', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('copies when Web Share is unavailable', async () => {
    const writeText = vi.fn(async () => undefined)
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    await expect(shareOrCopyUrl('https://example.com/tag/1')).resolves.toBe('copied')
    expect(writeText).toHaveBeenCalledWith('https://example.com/tag/1')
  })

  it('shares when canShare accepts the payload', async () => {
    const share = vi.fn(async () => undefined)
    const canShare = vi.fn(() => true)
    vi.stubGlobal('navigator', { share, canShare, clipboard: { writeText: vi.fn() } })
    await expect(shareOrCopyUrl('https://example.com/tag/1', { title: 'Hello' })).resolves.toBe(
      'shared',
    )
    expect(share).toHaveBeenCalled()
    expect(canShare).toHaveBeenCalled()
  })

  it('falls back to clipboard when share rejects (non-cancel)', async () => {
    const writeText = vi.fn(async () => undefined)
    const share = vi.fn(async () => {
      throw new DOMException('denied', 'NotAllowedError')
    })
    vi.stubGlobal('navigator', {
      share,
      canShare: () => true,
      clipboard: { writeText },
    })
    await expect(shareOrCopyUrl('https://example.com/tag/2')).resolves.toBe('copied')
    expect(writeText).toHaveBeenCalledWith('https://example.com/tag/2')
  })

  it('returns cancelled when the user dismisses the share sheet', async () => {
    vi.stubGlobal('navigator', {
      share: vi.fn(async () => {
        throw new DOMException('AbortError', 'AbortError')
      }),
      canShare: () => true,
      clipboard: { writeText: vi.fn() },
    })
    await expect(shareOrCopyUrl('https://example.com/tag/3')).resolves.toBe('cancelled')
  })

  it('shouldPreferWebShare is false without share API', () => {
    vi.stubGlobal('navigator', {})
    expect(shouldPreferWebShare({ url: 'https://x' })).toBe(false)
  })
})
