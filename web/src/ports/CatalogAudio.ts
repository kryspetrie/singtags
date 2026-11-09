import type { TagDetail } from '../types/tag'

/** A learning-track URL this device can fetch (pack, cache, or network). */
export type CatalogAudioHit = {
  url: string
  tier?: string
}

/** Port: resolve one catalog voice to bytes-ready audio. Adapter reads the offline cache. */
export interface CatalogAudioSource {
  resolvePart(
    detail: TagDetail,
    part: string,
    opts?: { offlineOnly?: boolean },
  ): Promise<CatalogAudioHit | null>
}
