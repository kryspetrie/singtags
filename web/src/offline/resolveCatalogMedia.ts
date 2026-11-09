/**
 * Catalog path and learning-track URL resolution.
 * Pack probes and stereo reconstruction stay in resolveMedia.ts.
 */
import type { TagDetail } from '../types/tag'
import {
  cachedPathCandidates,
  isPublishedTierPath,
  isUltraMonoStemPath,
  needsOnlineVirtualPartLearning,
  originalAudioPath,
  onlinePlayAudioPath,
  tierPath,
  ultraAudioPath,
  usesMonoSolos,
  voiceAudioParts,
} from '../lib/audioTiers'
import { mediaUrl } from '../lib/mediaUrl'
import { soloSideForPart, type PartSide } from '../lib/audioLayout'
import {
  buildPartLearningStereoObjectUrl,
  monoSoloToHardPanObjectUrl,
} from '../audio/partLeftReconstruct'
import { blobUrlFromCached, getStarred, type StarredTagRecord } from './favoritesDb'
import { audioPack } from './libraryPack'
import { isPlausibleMediaBody } from './downloadQueue'
import {
  accompanimentVoiceParts,
  canReconstructLearningStereo,
  collectVoiceStemUrls,
  finalizeBlobUrl,
  firstPackHit,
  hasCachedLearningStereo,
  learningStereoCache,
  learningStereoKey,
  packGetBlobUrl,
  packHasAbsolute,
  playableUrlFromStarEntry,
  starredAudioEntry,
  tryReconstructMix,
  type ResolvedMedia,
} from './resolveMedia'

/**
 * Resolve a catalog-relative path to blob or network media.
 *
 * Checks favorite blobs first, then pack cache, then network (unless `offlineOnly`).
 */
export async function resolvePathUrl(
  path: string,
  opts?: {
    starred?: StarredTagRecord | null
    offlineOnly?: boolean
  },
): Promise<ResolvedMedia | null> {
  const absolute = mediaUrl(path)

  const starred = opts?.starred
  if (starred) {
    const sheetHit = starred.sheetBlobs?.find((b) => b.path === path)
    if (sheetHit) {
      const url = blobUrlFromCached(sheetHit)
      if (url) return { kind: 'blob', url, source: 'star' }
    }
    for (const entry of Object.values(starred.audioBlobs ?? {})) {
      if (entry.path === path) {
        const url = await playableUrlFromStarEntry(entry, `star-path:${path}`)
        if (url) return { kind: 'blob', url, source: 'star' }
      }
    }
  }

  const url = await packGetBlobUrl(absolute)
  if (url) return { kind: 'blob', url, source: 'pack' }

  if (opts?.offlineOnly) return null

  return { kind: 'network', url: absolute, source: 'network', path }
}

/**
 * Resolve one learning-track part via the quality ladder:
 * original cache → online playback → offline ultra / reconstruct.
 * Call on first play of a part (lazy fetch).
 */

/**
 * Online: for mono_downmix tags, synthesize virtual part-left learning stereo from
 * the four mono playback/downmix stems (hosted playback is dual-mono, not part-left).
 */
async function resolveOnlineVirtualPartLearning(
  detail: TagDetail,
  part: string,
  starred?: StarredTagRecord | null,
): Promise<ResolvedMedia | null> {
  if (part.toLowerCase() === 'mix') return null
  if (!needsOnlineVirtualPartLearning(detail)) return null

  const cacheKey = learningStereoKey(detail.tag_id, part)
  const cached = learningStereoCache.get(cacheKey)
  if (cached) {
    return { kind: 'blob', url: cached, source: 'reconstruct', tier: 'playback' }
  }

  const activePath =
    onlinePlayAudioPath(detail, part) ?? ultraAudioPath(detail, part)
  if (!activePath) return null

  let activeUrl: string | null = null
  let activeOwned = false
  const packHit = await firstPackHit([activePath], { skipFinalize: true, starred })
  if (packHit) {
    activeUrl = packHit.url
    activeOwned = true
  }
  if (!activeUrl) {
    const starEntry = starredAudioEntry(starred, part)
    if (starEntry) {
      activeUrl = await playableUrlFromStarEntry(
        starEntry,
        `star:${detail.tag_id}:${part}:${starEntry.path}`,
      )
      activeOwned = !!activeUrl
    }
  }
  if (!activeUrl) activeUrl = mediaUrl(activePath)

  const others: Array<{ part: string; url: string }> = []
  const owned: string[] = []
  for (const voice of voiceAudioParts(detail)) {
    if (voice.toLowerCase() === part.toLowerCase()) continue
    const path =
      onlinePlayAudioPath(detail, voice) ?? ultraAudioPath(detail, voice)
    if (!path) continue
    const hit = await firstPackHit([path], { skipFinalize: true, starred })
    if (hit) {
      others.push({ part: voice, url: hit.url })
      owned.push(hit.url)
      continue
    }
    const starEntry = starredAudioEntry(starred, voice)
    if (starEntry) {
      const u = await playableUrlFromStarEntry(
        starEntry,
        `star:${detail.tag_id}:${voice}:${starEntry.path}`,
      )
      if (u) {
        others.push({ part: voice, url: u })
        owned.push(u)
        continue
      }
    }
    others.push({ part: voice, url: mediaUrl(path) })
  }

  if (!others.length) {
    for (const u of owned) URL.revokeObjectURL(u)
    if (activeOwned) URL.revokeObjectURL(activeUrl)
    return null
  }

  try {
    const stereo = await buildPartLearningStereoObjectUrl({
      activePart: part,
      activeUrl,
      otherParts: others,
      soloSide: 'left',
    })
    for (const u of owned) URL.revokeObjectURL(u)
    if (activeOwned) URL.revokeObjectURL(activeUrl)
    learningStereoCache.set(cacheKey, stereo.url)
    return { kind: 'blob', url: stereo.url, source: 'reconstruct', tier: 'playback' }
  } catch (err) {
    console.warn('[singtags] online virtual part-left failed', detail.tag_id, part, err)
    for (const u of owned) URL.revokeObjectURL(u)
    if (activeOwned) URL.revokeObjectURL(activeUrl)
    return null
  }
}

/** True when a cached blob is original/playback (not ultra/lofi mono stem). */
function isHighQualityAudioBlob(path: string, quality?: string): boolean {
  if (quality === 'lofi') return false
  if (isUltraMonoStemPath(path)) return false
  return true
}

/** Best-effort: store a network playback/original response in the audio pack for later offline use. */
function warmAudioPackFromNetwork(catalogPath: string): void {
  void (async () => {
    try {
      const absolute = mediaUrl(catalogPath)
      if (await packHasAbsolute(absolute)) return
      const res = await fetch(absolute)
      if (!res.ok) return
      const buf = await res.arrayBuffer()
      const mime = res.headers.get('Content-Type') || 'application/octet-stream'
      if (!isPlausibleMediaBody(buf, mime)) return
      await audioPack.put(
        absolute,
        new Response(buf, { status: 200, headers: { 'Content-Type': mime } }),
      )
    } catch {
      /* ignore — warm is an optimization */
    }
  })()
}

/**
 * Rebuild learning-stereo using a caller-provided active stem URL (HQ playback/original)
 * and ultra/lofi stems for accompaniment. Accompaniment stays on the ultra ladder.
 */
async function rebuildLearningStereoWithActive(
  detail: TagDetail,
  part: string,
  activeUrl: string,
  starred: StarredTagRecord | null | undefined,
  tier: string,
): Promise<ResolvedMedia | null> {
  const cacheKey = learningStereoKey(detail.tag_id, part)
  const cached = learningStereoCache.get(cacheKey)
  if (cached) {
    URL.revokeObjectURL(activeUrl)
    return { kind: 'blob', url: cached, source: 'reconstruct', tier }
  }
  if (typeof AudioContext === 'undefined') return null

  const summary = detail.audio_layout_summary
  const soloSide: PartSide | null =
    usesMonoSolos(detail) ? 'left' : soloSideForPart(part, detail.audio_layouts, summary)
  if (!soloSide) return null

  const required = accompanimentVoiceParts(detail, part)
  const others = await collectVoiceStemUrls(detail, {
    excludePart: part,
    starred: starred ?? null,
  })

  if (canReconstructLearningStereo(others, required)) {
    try {
      const stereo = await buildPartLearningStereoObjectUrl({
        activePart: part,
        activeUrl,
        otherParts: others,
        soloSide,
      })
      URL.revokeObjectURL(activeUrl)
      for (const o of others) URL.revokeObjectURL(o.url)
      learningStereoCache.set(cacheKey, stereo.url)
      return { kind: 'blob', url: stereo.url, source: 'reconstruct', tier }
    } catch (err) {
      console.warn('[singtags] HQ-active learning-stereo rebuild failed', detail.tag_id, part, err)
      for (const o of others) URL.revokeObjectURL(o.url)
    }
  } else {
    for (const o of others) URL.revokeObjectURL(o.url)
  }

  try {
    const hard = await monoSoloToHardPanObjectUrl(activeUrl, soloSide)
    URL.revokeObjectURL(activeUrl)
    learningStereoCache.set(cacheKey, hard.url)
    return { kind: 'blob', url: hard.url, source: 'reconstruct', tier }
  } catch {
    return null
  }
}

/**
 * Prefer cached original/playback for a voice part.
 * For mono_downmix (dual-mono hosts), rebuild learning-stereo with the HQ file as the
 * active stem and ultra solos for accompaniment.
 */
async function resolveCachedHighQualityVoice(
  detail: TagDetail,
  part: string,
  starred?: StarredTagRecord | null,
): Promise<ResolvedMedia | null> {
  const cacheKey = learningStereoKey(detail.tag_id, part)
  const cached = learningStereoCache.get(cacheKey)
  if (cached) {
    return { kind: 'blob', url: cached, source: 'reconstruct', tier: 'playback' }
  }

  const needsVirtual = needsOnlineVirtualPartLearning(detail)

  const starEntry = starredAudioEntry(starred, part)
  if (starEntry && isHighQualityAudioBlob(starEntry.path, starEntry.quality)) {
    const raw = await playableUrlFromStarEntry(
      starEntry,
      `star:${detail.tag_id}:${part}:${starEntry.path}`,
    )
    if (raw) {
      const tier =
        starEntry.quality === 'original' ? 'original' : starEntry.quality || 'cached'
      if (!needsVirtual) {
        return { kind: 'blob', url: raw, source: 'star', tier }
      }
      const rebuilt = await rebuildLearningStereoWithActive(
        detail,
        part,
        raw,
        starred,
        tier,
      )
      if (rebuilt) return rebuilt
    }
  }

  const hqPaths: Array<{ path: string; tier: string }> = []
  const original = originalAudioPath(detail, part)
  if (original) hqPaths.push({ path: original, tier: 'original' })
  const playbackOnly = tierPath(detail, part, 'playback')
  if (playbackOnly && playbackOnly !== original) {
    hqPaths.push({ path: playbackOnly, tier: 'playback' })
  }

  for (const { path: catalogPath, tier } of hqPaths) {
    const hit = await firstPackHit([catalogPath], { skipFinalize: true, starred })
    if (!hit) continue
    if (!needsVirtual) {
      return { kind: 'blob', url: hit.url, source: 'pack', tier }
    }
    const rebuilt = await rebuildLearningStereoWithActive(
      detail,
      part,
      hit.url,
      starred,
      tier,
    )
    if (rebuilt) return rebuilt
  }

  return null
}

export async function resolveAudioPart(
  detail: TagDetail,
  part: string,
  opts?: {
    starred?: StarredTagRecord | null
    offlineOnly?: boolean
  },
): Promise<ResolvedMedia | null> {
  const offlineOnly = opts?.offlineOnly === true
  const starred = opts?.starred
  const partKey = part.toLowerCase()
  const offlineVoiceMonoSolos =
    offlineOnly && partKey !== 'mix' && usesMonoSolos(detail)

  // Offline learning tracks: prefer cached original/playback for this part when present;
  // otherwise rebuild from ultra solos (accompaniment stems stay on the ultra ladder).
  if (offlineVoiceMonoSolos) {
    const fromHq = await resolveCachedHighQualityVoice(detail, part, starred)
    if (fromHq) return fromHq
    const fromUltra = await resolveOfflineUltraVoice(detail, part, starred)
    if (fromUltra) return fromUltra
  }

  const starEntry = starredAudioEntry(starred, part)
  if (starEntry) {
    const degraded =
      partKey !== 'mix' &&
      (starEntry.quality === 'lofi' || isUltraMonoStemPath(starEntry.path))
    // Online: skip degraded star blobs so pack/network HQ can upgrade.
    if (!(degraded && !offlineOnly)) {
      const raw = await playableUrlFromStarEntry(
        starEntry,
        `star:${detail.tag_id}:${part}:${starEntry.path}`,
      )
      if (raw) {
        const tier = starEntry.quality === 'original' ? 'original' : starEntry.quality || 'cached'
        const url = await finalizeBlobUrl(raw, starEntry.path, {
          detail,
          part,
          starred: starred ?? null,
        })
        const reconstructed = hasCachedLearningStereo(detail.tag_id, part, url)
        return {
          kind: 'blob',
          url,
          source: reconstructed ? 'reconstruct' : 'star',
          tier,
        }
      }
    }
  }

  const original = originalAudioPath(detail, part)
  if (original) {
    const hit = await firstPackHit([original], {
      starred,
      detail: offlineVoiceMonoSolos ? detail : undefined,
      part: offlineVoiceMonoSolos ? part : undefined,
    })
    if (hit) {
      return { kind: 'blob', url: hit.url, source: 'pack', tier: 'original' }
    }
  }

  if (!offlineOnly) {
    // Prefer pack-cached original/playback before hitting the network.
    if (partKey !== 'mix' && !needsOnlineVirtualPartLearning(detail)) {
      const fromHq = await resolveCachedHighQualityVoice(detail, part, starred)
      if (fromHq) return fromHq
    }
    // mono_downmix: hosted playback is dual-mono — rebuild virtual part-left online.
    if (partKey !== 'mix' && needsOnlineVirtualPartLearning(detail)) {
      const virtual = await resolveOnlineVirtualPartLearning(detail, part, starred)
      if (virtual) return virtual
    }
    const playback = onlinePlayAudioPath(detail, part)
    if (playback) {
      const packPlayback = await firstPackHit([playback], { skipFinalize: true, starred })
      if (packPlayback && !needsOnlineVirtualPartLearning(detail)) {
        return {
          kind: 'blob',
          url: packPlayback.url,
          source: 'pack',
          tier: isPublishedTierPath(playback) ? 'playback' : 'original',
        }
      }
      if (packPlayback) URL.revokeObjectURL(packPlayback.url)
      warmAudioPackFromNetwork(playback)
      return {
        kind: 'network',
        url: mediaUrl(playback),
        source: 'network',
        path: playback,
        tier: isPublishedTierPath(playback) ? 'playback' : 'original',
      }
    }
    return null
  }

  if (partKey === 'mix') {
    const reconstructed = await tryReconstructMix(detail, starred)
    if (reconstructed) return reconstructed
  }

  if (!offlineVoiceMonoSolos) {
    const fromUltra = await resolveOfflineUltraVoice(detail, part, starred)
    if (fromUltra) return fromUltra
  }

  const hit = await firstPackHit(cachedPathCandidates(detail, part), { detail, part, starred })
  if (hit) {
    const reconstructed = hasCachedLearningStereo(detail.tag_id, part, hit.url)
    return {
      kind: 'blob',
      url: hit.url,
      source: reconstructed ? 'reconstruct' : 'pack',
      tier: 'cached',
    }
  }

  return null
}


async function resolveOfflineUltraVoice(
  detail: TagDetail,
  part: string,
  starred?: StarredTagRecord | null,
): Promise<ResolvedMedia | null> {
  const ultra = ultraAudioPath(detail, part)
  if (ultra) {
    const hit = await firstPackHit([ultra], { detail, part, starred })
    if (hit) {
      const reconstructed = hasCachedLearningStereo(detail.tag_id, part, hit.url)
      return {
        kind: 'blob',
        url: hit.url,
        source: reconstructed ? 'reconstruct' : 'pack',
        tier: 'ultra',
      }
    }
  }

  const soloPaths = cachedPathCandidates(detail, part).filter(isUltraMonoStemPath)
  if (soloPaths.length) {
    const hit = await firstPackHit(soloPaths, { detail, part, starred })
    if (hit) {
      const reconstructed = hasCachedLearningStereo(detail.tag_id, part, hit.url)
      return {
        kind: 'blob',
        url: hit.url,
        source: reconstructed ? 'reconstruct' : 'pack',
        tier: 'ultra',
      }
    }
  }

  // Starred ultra/lofi solos (no pack hit): finalize still rebuilds learning stereo.
  const starEntry = starredAudioEntry(starred, part)
  if (
    starEntry &&
    (isUltraMonoStemPath(starEntry.path) || starEntry.quality === 'lofi')
  ) {
    const raw = await playableUrlFromStarEntry(
      starEntry,
      `star:${detail.tag_id}:${part}:${starEntry.path}`,
    )
    if (raw) {
      const url = await finalizeBlobUrl(raw, starEntry.path, {
        detail,
        part,
        starred: starred ?? null,
      })
      return {
        kind: 'blob',
        url,
        source: hasCachedLearningStereo(detail.tag_id, part, url) ? 'reconstruct' : 'star',
        tier: starEntry.quality || 'lofi',
      }
    }
  }

  return null
}

/**
 * Resolve many paths for a tag, optionally loading its favorite record by id.
 *
 * @param paths Catalog-relative paths.
 * @param opts.tagId When set, loads favorites from IndexedDB for blob hits.
 */
export async function resolvePaths(
  paths: string[],
  opts?: { tagId?: number; offlineOnly?: boolean },
): Promise<Array<{ path: string; resolved: ResolvedMedia | null }>> {
  let starred: StarredTagRecord | undefined
  if (opts?.tagId != null) {
    starred = await getStarred(opts.tagId)
  }
  const out: Array<{ path: string; resolved: ResolvedMedia | null }> = []
  for (const path of paths) {
    out.push({
      path,
      resolved: await resolvePathUrl(path, {
        starred: starred ?? null,
        offlineOnly: opts?.offlineOnly,
      }),
    })
  }
  return out
}

/** Whether a catalog-relative path exists in either sheets or audio pack. */
