/**
 * Per-tag "My Rating" (1–5), localStorage-backed, with publish to barbershoptags.com.
 */
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import {
  normalizeRatingStars,
  publishBarbershopTagRating,
  type BarbershopRatingStars,
} from '../lib/barbershopTagsRate'

export const MY_RATINGS_KEY = 'singtags.myRatings.v1'

export type MyRatingRecord = {
  stars: BarbershopRatingStars
  updatedAt: string
  /** Last stars successfully sent to origin; null if never published. */
  publishedStars: BarbershopRatingStars | null
}

type RatingsMap = Record<string, MyRatingRecord>

function parseRecord(raw: unknown): MyRatingRecord | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const stars = normalizeRatingStars(o.stars)
  if (stars == null || typeof o.updatedAt !== 'string') return null
  const published =
    o.publishedStars == null ? null : normalizeRatingStars(o.publishedStars)
  return {
    stars,
    updatedAt: o.updatedAt,
    publishedStars: published,
  }
}

function loadMap(): RatingsMap {
  try {
    const raw = localStorage.getItem(MY_RATINGS_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Record<string, unknown>
    const out: RatingsMap = {}
    for (const [k, v] of Object.entries(parsed)) {
      const id = Number(k)
      if (!Number.isFinite(id)) continue
      const rec = parseRecord(v)
      if (rec) out[String(Math.trunc(id))] = rec
    }
    return out
  } catch {
    return {}
  }
}

/** Pinia store for the user's own tag ratings. */
export const useRatingsStore = defineStore('ratings', () => {
  const byId = ref<RatingsMap>(loadMap())
  /** Bumps so catalog computed filters re-run when ratings change. */
  const revision = ref(0)
  const publishingId = ref<number | null>(null)

  function persist(): void {
    try {
      localStorage.setItem(MY_RATINGS_KEY, JSON.stringify(byId.value))
    } catch {
      /* private mode */
    }
    revision.value++
  }

  function reload(): void {
    byId.value = loadMap()
    revision.value++
  }

  const ratedIds = computed(() => {
    void revision.value
    return new Set(
      Object.keys(byId.value)
        .map((k) => Number(k))
        .filter((n) => Number.isFinite(n)),
    )
  })

  const ratedCount = computed(() => ratedIds.value.size)

  function get(tagId: number): MyRatingRecord | null {
    return byId.value[String(tagId)] ?? null
  }

  function starsFor(tagId: number): BarbershopRatingStars | null {
    return get(tagId)?.stars ?? null
  }

  function has(tagId: number): boolean {
    return starsFor(tagId) != null
  }

  /**
   * Save locally and publish to barbershoptags.com when stars changed vs last publish.
   * Clearing is local-only (origin has no unrate API).
   */
  async function setRating(
    tagId: number,
    stars: BarbershopRatingStars,
  ): Promise<{ published: boolean; error?: string }> {
    const id = Math.trunc(tagId)
    if (!Number.isFinite(id) || id <= 0) {
      return { published: false, error: 'Invalid tag id' }
    }
    const prev = get(id)
    const next: MyRatingRecord = {
      stars,
      updatedAt: new Date().toISOString(),
      publishedStars: prev?.publishedStars ?? null,
    }
    byId.value = { ...byId.value, [String(id)]: next }
    persist()

    if (prev?.publishedStars === stars) {
      return { published: true }
    }

    publishingId.value = id
    try {
      const result = await publishBarbershopTagRating(id, stars)
      if (result.ok) {
        const cur = get(id)
        if (cur && cur.stars === stars) {
          byId.value = {
            ...byId.value,
            [String(id)]: { ...cur, publishedStars: stars },
          }
          persist()
        }
        return { published: true }
      }
      return { published: false, error: result.error }
    } finally {
      if (publishingId.value === id) publishingId.value = null
    }
  }

  /** Remove local rating (does not contact origin). */
  function clearRating(tagId: number): void {
    const key = String(Math.trunc(tagId))
    if (!(key in byId.value)) return
    const next = { ...byId.value }
    delete next[key]
    byId.value = next
    persist()
  }

  /** Wipe all local ratings (e.g. clear offline data). */
  function clearAll(): void {
    byId.value = {}
    persist()
  }

  return {
    byId,
    revision,
    publishingId,
    ratedIds,
    ratedCount,
    get,
    starsFor,
    has,
    setRating,
    clearRating,
    clearAll,
    reload,
  }
})
