import { resolveAudioPart } from '../../offline/resolveMedia'
import type { CatalogAudioSource } from '../../ports/CatalogAudio'

/** Production catalog-audio adapter. Tag Studio import must not call `offline/` itself. */
export function createCatalogAudioSource(): CatalogAudioSource {
  return {
    async resolvePart(detail, part, opts) {
      const resolved = await resolveAudioPart(detail, part, { offlineOnly: opts?.offlineOnly })
      if (!resolved?.url) return null
      return { url: resolved.url, tier: resolved.tier }
    },
  }
}
