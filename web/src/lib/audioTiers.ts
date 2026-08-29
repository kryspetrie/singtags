/**
 * Published audio quality ladder (see docs/decisions/audio-storage-cache.md).
 * Paths are catalog-relative (e.g. media/31/lead.playback.opus).
 */

import type { AudioEncodeQuality } from '../types/audio'
import type { AudioTierId, TagDetail } from '../types/tag'
import { sortPartIds } from './parts'

const TIER_ORDER: AudioTierId[] = [
  'original',
  'playback',
  'ultra_solo',
  'ultra_downmix',
  'ultra_stereo',
  'ultra_mix',
]

export type PlayablePartsContext = 'online' | 'offline'

/** Voice parts only (excludes mix). */
export function voiceAudioParts(detail: TagDetail): string[] {
  return listAudioParts(detail).filter((p) => p.toLowerCase() !== 'mix')
}

/** True when metadata includes an offline-pack tier for this voice part. */
export function hasOfflineVoiceTier(detail: TagDetail, part: string): boolean {
  return cachedPathCandidates(detail, part).some(
    (p) => isPublishedTierPath(p) || isUltraSoloPath(p) || /\.downmix\.opus/i.test(p),
  )
}

/** Mix track is unrelated to voice learning parts — use hosted mix, not reconstruct. */
export function mixIsDisjoint(detail: TagDetail): boolean {
  const layout = detail.audio_layout_summary
  if (layout?.mix_disjoint === true) return true
  if (layout?.mix_cache === 'hosted') return true
  return detail.audio_tiers_summary?.mix_disjoint === true
}

/**
 * Voice parts can safely be mono-solo extracted and client-reconstructed.
 * False for piano/misaligned stems — play hosted ultra_stereo / playback instead.
 */
export function partsAreRecombinable(detail: TagDetail): boolean {
  const layout = detail.audio_layout_summary
  if (layout?.parts_recombinable === false) return false
  if (layout?.ultra_low === 'stereo_fallback') return false
  if (detail.audio_tiers_summary?.parts_recombinable === false) return false
  const policy = detail.audio_tiers_summary?.ultra_policy ?? layout?.ultra_low
  if (policy === 'stereo_fallback') return false
  return true
}

/** Mix can be rebuilt offline from ≥2 cached voice stems. */
export function canOfferReconstructedMix(detail: TagDetail): boolean {
  if (isMixOnlyTag(detail)) return false
  if (mixIsDisjoint(detail)) return false
  if (!partsAreRecombinable(detail)) return false
  const voices = voiceAudioParts(detail).filter((p) => hasOfflineVoiceTier(detail, p))
  return voices.length >= 2
}

/**
 * Parts to show in the player and per-tag download list.
 * Offline omits hosted mix on mono_solo tags when mix must be reconstructed.
 */
export function playableAudioParts(
  detail: TagDetail,
  ctx: PlayablePartsContext = 'online',
): string[] {
  if (isMixOnlyTag(detail)) {
    const mixPath =
      ultraAudioPath(detail, 'mix') ??
      playbackAudioPath(detail, 'mix') ??
      originalAudioPath(detail, 'mix')
    return mixPath ? ['mix'] : []
  }

  const voices: string[] = []
  for (const part of voiceAudioParts(detail)) {
    if (ctx === 'online') {
      if (playbackAudioPath(detail, part) || originalAudioPath(detail, part)) {
        voices.push(part)
      }
    } else if (hasOfflineVoiceTier(detail, part)) {
      voices.push(part)
    }
  }

  const parts = [...voices]
  if (ctx === 'online') {
    if (playbackAudioPath(detail, 'mix') || originalAudioPath(detail, 'mix')) {
      parts.push('mix')
    }
  } else if (canOfferReconstructedMix(detail)) {
    parts.push('mix')
  } else if (cachedPathCandidates(detail, 'mix').length > 0) {
    parts.push('mix')
  }

  return sortPartIds(parts)
}

/** Parts that have an original (or any tier) path. */
export function listAudioParts(detail: TagDetail): string[] {
  const keys = new Set<string>()
  for (const k of Object.keys(detail.audio ?? {})) keys.add(k)
  for (const k of Object.keys(detail.audio_tiers ?? {})) keys.add(k)
  return [...keys]
}

export function tierPath(
  detail: TagDetail,
  part: string,
  tier: AudioTierId,
): string | null {
  const fromTiers = detail.audio_tiers?.[part]?.[tier] ?? detail.audio_tiers?.[part.toLowerCase()]?.[tier]
  if (typeof fromTiers === 'string' && fromTiers) return fromTiers
  if (tier === 'original') {
    const legacy = detail.audio?.[part] ?? detail.audio?.[part.toLowerCase()]
    if (typeof legacy === 'string' && legacy) return legacy
  }
  return null
}

/** Hosted original for download / cache upgrade. */
export function originalAudioPath(detail: TagDetail, part: string): string | null {
  return tierPath(detail, part, 'original')
}

/**
 * Default online play path: 64 kbps Opus when published, else original.
 */
export function playbackAudioPath(detail: TagDetail, part: string): string | null {
  return tierPath(detail, part, 'playback') ?? originalAudioPath(detail, part)
}

/** Ultra-low offline pack path for a part (policy-aware). */
export function ultraAudioPath(detail: TagDetail, part: string): string | null {
  const policy =
    detail.audio_layout_summary?.ultra_low ??
    detail.audio_tiers_summary?.ultra_policy ??
    null
  const key = part.toLowerCase()

  if (policy === 'mono_solos') {
    if (key === 'mix') {
      if (mixIsDisjoint(detail) || !partsAreRecombinable(detail)) {
        return (
          tierPath(detail, part, 'ultra_mix') ??
          tierPath(detail, part, 'ultra_stereo') ??
          tierPath(detail, part, 'playback')
        )
      }
      return null // reconstructed client-side
    }
    if (!partsAreRecombinable(detail)) {
      return (
        tierPath(detail, part, 'ultra_stereo') ??
        tierPath(detail, part, 'playback') ??
        tierPath(detail, part, 'ultra_solo')
      )
    }
    return tierPath(detail, part, 'ultra_solo')
  }
  if (policy === 'mono_downmix') {
    return tierPath(detail, part, 'ultra_downmix') ?? tierPath(detail, part, 'ultra_solo')
  }
  if (key === 'mix') {
    return (
      tierPath(detail, part, 'ultra_mix') ??
      tierPath(detail, part, 'ultra_stereo') ??
      tierPath(detail, part, 'playback')
    )
  }
  if (policy === 'stereo_fallback') {
    return tierPath(detail, part, 'ultra_stereo') ?? tierPath(detail, part, 'playback')
  }
  return (
    tierPath(detail, part, 'ultra_solo') ??
    tierPath(detail, part, 'ultra_mix') ??
    tierPath(detail, part, 'ultra_stereo') ??
    tierPath(detail, part, 'ultra_downmix')
  )
}

export function isMixOnlyTag(detail: TagDetail): boolean {
  if (detail.audio_tiers_summary?.mix_only === true) return true
  const parts = listAudioParts(detail).map((p) => p.toLowerCase())
  return parts.length === 1 && parts[0] === 'mix'
}

export function usesMonoSolos(detail: TagDetail): boolean {
  if (!partsAreRecombinable(detail)) return false
  const policy =
    detail.audio_layout_summary?.ultra_low ?? detail.audio_tiers_summary?.ultra_policy
  return policy === 'mono_solos'
}

/** Original paths keyed by part (for downloads / catalogPaths). */
export function catalogOriginalPaths(detail: TagDetail): Record<string, string> {
  const out: Record<string, string> = {}
  for (const part of listAudioParts(detail)) {
    const p = originalAudioPath(detail, part)
    if (p) out[part] = p
  }
  return out
}

/** Online play paths keyed by part (playback tier, lazy network). */
export function onlinePlaybackPaths(detail: TagDetail): Record<string, string> {
  const out: Record<string, string> = {}
  for (const part of listAudioParts(detail)) {
    const p = playbackAudioPath(detail, part)
    if (p) out[part] = p
  }
  return out
}

/** True when a catalog path is a pre-published Opus tier (not a hosted M4A). */
export function isPublishedTierPath(path: string): boolean {
  return /\.(opus|ogg)(\?|$)/i.test(path)
}

export function hasPublishedTiers(detail: TagDetail): boolean {
  const tiers = detail.audio_tiers
  return !!tiers && typeof tiers === 'object' && Object.keys(tiers).length > 0
}

/** True when path is an ultra-low mono solo stem. */
export function isUltraSoloPath(path: string): boolean {
  let p = path
  try {
    p = decodeURIComponent(path)
  } catch {
    /* keep raw */
  }
  return (
    /\.solo\.opus(\?|$)/i.test(p) ||
    /\.ultra_solo\./i.test(p) ||
    /(?:^|[\s\-_/])solo\.opus(\?|$)/i.test(p)
  )
}

/**
 * Path to fetch when starring at a storage-quality setting.
 * Uses publish pipeline tiers when available; falls back to original + on-device re-encode.
 * Mix on mono_solos tags is omitted at lofi — reconstructed at play time.
 */
export function storageAudioPath(
  detail: TagDetail,
  part: string,
  quality: AudioEncodeQuality,
): string | null {
  if (quality === 'original') return originalAudioPath(detail, part)
  if (!hasPublishedTiers(detail)) return originalAudioPath(detail, part)
  if (quality === 'lofi') {
    if (part.toLowerCase() === 'mix' && usesMonoSolos(detail) && !mixIsDisjoint(detail)) {
      return null
    }
    return ultraAudioPath(detail, part) ?? playbackAudioPath(detail, part)
  }
  // standard / compact → published 64 kbps playback
  return playbackAudioPath(detail, part)
}

/** Infer whether starred blobs are below original quality (no byte fetch). */
export function inferLowerQualityFromStarred(
  audioBlobs: Record<string, { quality?: string }> | undefined,
): boolean {
  if (!audioBlobs) return false
  for (const entry of Object.values(audioBlobs)) {
    if (!entry.quality || entry.quality !== 'original') return true
  }
  return false
}

/** Candidate paths to probe in Cache API for a part, best → smallest. */
export function cachedPathCandidates(detail: TagDetail, part: string): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  const add = (p: string | null) => {
    if (p && !seen.has(p)) {
      seen.add(p)
      out.push(p)
    }
  }
  add(originalAudioPath(detail, part))
  add(tierPath(detail, part, 'playback'))
  add(ultraAudioPath(detail, part))
  for (const tier of TIER_ORDER) {
    add(tierPath(detail, part, tier))
  }
  return out
}
