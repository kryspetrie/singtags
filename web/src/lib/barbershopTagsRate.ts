/**
 * Publish a 1–5 star rating to barbershoptags.com (official API).
 * @see https://www.barbershoptags.com/dbpage.php?pg=api
 *
 * Note: `action=rate` does **not** return `Access-Control-Allow-Origin` (browse XML
 * does). Browser calls must use `mode: 'no-cors'` so the GET is still sent; the
 * response is opaque, so success means “request dispatched,” not “body was ok.”
 */

export const BARBERSHOP_TAGS_API = 'https://www.barbershoptags.com/api.php'

export type BarbershopRatingStars = 1 | 2 | 3 | 4 | 5

/** Normalize to a valid API rating, or null. Origin rejects 0. */
export function normalizeRatingStars(n: unknown): BarbershopRatingStars | null {
  const v = typeof n === 'number' ? n : Number(n)
  if (!Number.isInteger(v) || v < 1 || v > 5) return null
  return v as BarbershopRatingStars
}

/** Build the documented rate URL (1–5 only; there is no unrate / 0). */
export function barbershopTagRateUrl(
  tagId: number,
  stars: BarbershopRatingStars,
): string {
  const url = new URL(BARBERSHOP_TAGS_API)
  url.searchParams.set('action', 'rate')
  url.searchParams.set('id', String(Math.trunc(tagId)))
  url.searchParams.set('rating', String(stars))
  url.searchParams.set('client', 'SingTags')
  return url.toString()
}

/**
 * Fire the rate GET. Uses no-cors because origin omits ACAO on this action.
 * Resolves ok when the request is sent; cannot verify the “ok” body in-browser.
 */
export async function publishBarbershopTagRating(
  tagId: number,
  stars: BarbershopRatingStars,
  fetchImpl: typeof fetch = fetch,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!Number.isFinite(tagId) || tagId <= 0) {
    return { ok: false, error: 'Invalid tag id' }
  }
  const url = barbershopTagRateUrl(tagId, stars)

  try {
    const res = await fetchImpl(url, {
      method: 'GET',
      mode: 'no-cors',
      credentials: 'omit',
      cache: 'no-store',
    })
    // Opaque success (status 0) or a rare CORS-enabled 200 with body.
    if (res.type === 'opaque' || res.type === 'opaqueredirect') return { ok: true }
    if (res.ok) {
      const text = (await res.text()).trim()
      if (!text || text.toLowerCase() === 'ok') return { ok: true }
      return { ok: false, error: text }
    }
    return { ok: false, error: `HTTP ${res.status}` }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Network error'
    return { ok: false, error: msg }
  }
}
