import { describe, expect, it, vi } from 'vitest'
import {
  BARBERSHOP_TAGS_API,
  normalizeRatingStars,
  publishBarbershopTagRating,
} from './barbershopTagsRate'

describe('normalizeRatingStars', () => {
  it('accepts integers 1–5', () => {
    expect(normalizeRatingStars(1)).toBe(1)
    expect(normalizeRatingStars(5)).toBe(5)
    expect(normalizeRatingStars('3')).toBe(3)
  })

  it('rejects invalid values', () => {
    expect(normalizeRatingStars(0)).toBeNull()
    expect(normalizeRatingStars(3.5)).toBeNull()
    expect(normalizeRatingStars(6)).toBeNull()
    expect(normalizeRatingStars('x')).toBeNull()
  })
})

describe('publishBarbershopTagRating', () => {
  it('calls the documented rate API with no-cors and accepts opaque ok', async () => {
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toContain(BARBERSHOP_TAGS_API)
      expect(url).toContain('action=rate')
      expect(url).toContain('id=110')
      expect(url).toContain('rating=4')
      expect(url).toContain('client=SingTags')
      expect(init?.mode).toBe('no-cors')
      return { type: 'opaque', ok: false, status: 0, text: async () => '' } as Response
    })
    await expect(publishBarbershopTagRating(110, 4, fetchImpl as typeof fetch)).resolves.toEqual({
      ok: true,
    })
  })

  it('surfaces readable origin error text when CORS is available', async () => {
    const fetchImpl = vi.fn(async () => new Response('Tag 999 does not exist', { status: 200 }))
    await expect(publishBarbershopTagRating(999, 2, fetchImpl as typeof fetch)).resolves.toEqual({
      ok: false,
      error: 'Tag 999 does not exist',
    })
  })
})
