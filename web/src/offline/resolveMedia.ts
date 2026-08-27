/**
 * Resolve media for display: starred IndexedDB → offline pack → network URL.
 * Audio parts follow the quality ladder in audio-storage-cache ADR.
 */

import type { TagDetail } from '../types/tag'
import {
  cachedPathCandidates,
  isMixOnlyTag,
  isPublishedTierPath,
  isUltraSoloPath,
  mixIsDisjoint,
  originalAudioPath,
  playableAudioParts,
  playbackAudioPath,
  tierPath,
  ultraAudioPath,
  usesMonoSolos,
  voiceAudioParts,
} from '../lib/audioTiers'
import { sortPartIds } from '../lib/parts'
import { mediaUrl } from '../lib/mediaUrl'
import { soloSideForPart } from '../lib/audioLayout'
import {
  buildPartLearningStereoObjectUrl,
  buildUltraMixObjectUrl,
  monoSoloToStereoObjectUrl,
} from '../audio/partLeftReconstruct'
import { blobUrlFromCached, getStarred, type StarredTagRecord } from './starredDb'
import { audioPack, sheetsPack } from './libraryPack'

export type ResolvedMedia =
  | { kind: 'blob'; url: string; source: 'star' | 'pack' | 'reconstruct'; tier?: string }
  | { kind: 'network'; url: string; source: 'network'; path: string; tier?: string }

/** Session cache of reconstructed learning-track stereo blob URLs (tagId:part → blob:). */
const learningStereoCache = new Map<string, string>()

function learningStereoKey(tagId: number, part: string): string {
  return `${tagId}:${part.toLowerCase()}`
}

/** Drop cached reconstruct URLs (does not revoke — caller owns blob lifetime via useObjectUrls). */
export function clearLearningStereoCache(tagId?: number): void {
  if (tagId == null) {
    learningStereoCache.clear()
    return
  }
  const prefix = `${tagId}:`
  for (const k of [...learningStereoCache.keys()]) {
    if (k.startsWith(prefix)) learningStereoCache.delete(k)
  }
}

function isAudioAbsolute(absolute: string): boolean {
  return absolute.includes('/media/') || /\.(m4a|mp3|ogg|opus|wav|aac|webm)(\?|$)/i.test(absolute)
}

async function packGetBlobUrl(absolute: string): Promise<string | null> {
  const pack = isAudioAbsolute(absolute) ? audioPack : sheetsPack
  const res = await pack.get(absolute)
  if (!res) return null
  const buf = await res.arrayBuffer()
  const mime = res.headers.get('Content-Type') || 'application/octet-stream'
  return URL.createObjectURL(new Blob([buf], { type: mime }))
}

async function packHasAbsolute(absolute: string): Promise<boolean> {
  const pack = isAudioAbsolute(absolute) ? audioPack : sheetsPack
  return pack.has(absolute)
}

function accompanimentVoiceParts(detail: TagDetail, activePart: string): string[] {
  const active = activePart.toLowerCase()
  return voiceAudioParts(detail).filter((p) => p.toLowerCase() !== active)
}

/** Case-insensitive lookup into starred audio blobs. */
export function starredAudioEntry(
  starred: StarredTagRecord | null | undefined,
  part: string,
): NonNullable<StarredTagRecord['audioBlobs']>[string] | undefined {
  const blobs = starred?.audioBlobs
  if (!blobs) return undefined
  if (blobs[part]) return blobs[part]
  const lower = part.toLowerCase()
  if (blobs[lower]) return blobs[lower]
  for (const [k, v] of Object.entries(blobs)) {
    if (k.toLowerCase() === lower) return v
  }
  return undefined
}

/** Strict policy: every other voice part must be cached before reconstructing learning stereo. */
function hasAllAccompanimentStems(
  cached: Array<{ part: string; url: string }>,
  required: string[],
): boolean {
  if (!required.length) return false
  const have = new Set(cached.map((c) => c.part.toLowerCase()))
  return required.every((p) => have.has(p.toLowerCase()))
}

/** Present ultra mono solos as learning-track stereo when all stems allow (else dual-mono). */
async function finalizeBlobUrl(
  url: string,
  catalogPath: string,
  ctx?: { detail: TagDetail; part: string },
): Promise<string> {
  if (!isUltraSoloPath(catalogPath) || typeof AudioContext === 'undefined') return url

  if (ctx) {
    const { detail, part } = ctx
    const cacheKey = learningStereoKey(detail.tag_id, part)
    const cached = learningStereoCache.get(cacheKey)
    if (cached) {
      URL.revokeObjectURL(url)
      return cached
    }

    const summary = detail.audio_layout_summary
    if (summary?.parts !== 'mono' && summary?.parts !== 'near_mono') {
      let soloSide = soloSideForPart(part, detail.audio_layouts, summary)
      // Classic learning-track layout when metadata omits side but ultra solos exist.
      if (!soloSide && usesMonoSolos(detail)) soloSide = 'left'
      if (soloSide) {
        const required = accompanimentVoiceParts(detail, part)
        const others = await collectVoiceStemUrls(detail, { excludePart: part })
        if (hasAllAccompanimentStems(others, required)) {
          try {
            const stereo = await buildPartLearningStereoObjectUrl({
              activePart: part,
              activeUrl: url,
              otherParts: others,
              soloSide,
            })
            URL.revokeObjectURL(url)
            for (const o of others) URL.revokeObjectURL(o.url)
            learningStereoCache.set(cacheKey, stereo.url)
            return stereo.url
          } catch {
            for (const o of others) URL.revokeObjectURL(o.url)
          }
        } else {
          for (const o of others) URL.revokeObjectURL(o.url)
        }
      }
    }
  }

  const stereo = await monoSoloToStereoObjectUrl(url)
  URL.revokeObjectURL(url)
  return stereo.url
}

async function firstPackHit(
  paths: string[],
  opts?: { skipFinalize?: boolean; detail?: TagDetail; part?: string },
): Promise<{ path: string; url: string } | null> {
  for (const path of paths) {
    const absolute = mediaUrl(path)
    if (!(await packHasAbsolute(absolute))) continue
    const raw = await packGetBlobUrl(absolute)
    if (!raw) continue
    const url = opts?.skipFinalize
      ? raw
      : await finalizeBlobUrl(
          raw,
          path,
          opts?.detail && opts?.part ? { detail: opts.detail, part: opts.part } : undefined,
        )
    return { path, url }
  }
  return null
}

async function collectVoiceStemUrls(
  detail: TagDetail,
  opts?: { excludePart?: string },
): Promise<Array<{ part: string; url: string }>> {
  const exclude = opts?.excludePart?.toLowerCase()
  const inputs: Array<{ part: string; url: string }> = []
  for (const part of voiceAudioParts(detail)) {
    if (exclude && part.toLowerCase() === exclude) continue
    const paths: string[] = []
    const add = (p: string | null) => {
      if (p && !paths.includes(p)) paths.push(p)
    }
    add(tierPath(detail, part, 'ultra_solo'))
    add(tierPath(detail, part, 'ultra_downmix'))
    add(ultraAudioPath(detail, part))
    for (const p of cachedPathCandidates(detail, part)) {
      if (isPublishedTierPath(p)) add(p)
    }
    const hit = await firstPackHit(paths, { skipFinalize: true })
    if (hit) inputs.push({ part, url: hit.url })
  }
  return inputs
}

async function tryReconstructMix(detail: TagDetail): Promise<ResolvedMedia | null> {
  if (mixIsDisjoint(detail)) return null
  const inputs = await collectVoiceStemUrls(detail)
  if (inputs.length < 2) {
    for (const i of inputs) URL.revokeObjectURL(i.url)
    return null
  }
  try {
    const mix = await buildUltraMixObjectUrl(inputs)
    for (const i of inputs) URL.revokeObjectURL(i.url)
    return { kind: 'blob', url: mix.url, source: 'reconstruct', tier: 'ultra_mix' }
  } catch {
    for (const i of inputs) URL.revokeObjectURL(i.url)
    return null
  }
}

async function voicePartInPack(detail: TagDetail, part: string): Promise<boolean> {
  for (const path of cachedPathCandidates(detail, part)) {
    if (await packHasPath(path)) return true
  }
  return false
}

async function countVoiceStemsInPack(detail: TagDetail): Promise<number> {
  let count = 0
  for (const part of voiceAudioParts(detail)) {
    if (await voicePartInPack(detail, part)) count++
  }
  return count
}

async function offlineMixAvailable(detail: TagDetail): Promise<boolean> {
  if (isMixOnlyTag(detail)) return voicePartInPack(detail, 'mix')
  if ((await countVoiceStemsInPack(detail)) >= 2) return true
  for (const path of cachedPathCandidates(detail, 'mix')) {
    if (await packHasPath(path)) return true
  }
  return false
}

/**
 * Parts that can actually be played right now (starred blob, pack hit, or network path).
 * Used for player tabs — omit parts with no resolvable source.
 */
export async function probeAvailableAudioParts(
  detail: TagDetail,
  opts?: {
    starred?: StarredTagRecord | null
    offlineOnly?: boolean
  },
): Promise<string[]> {
  const offlineOnly = opts?.offlineOnly === true
  const starred = opts?.starred
  // Offline: also consider online path lists + starred keys so originals-only / starred
  // parts aren't dropped before we check the pack or IndexedDB blobs.
  const candidates = sortPartIds([
    ...new Set([
      ...playableAudioParts(detail, offlineOnly ? 'offline' : 'online'),
      ...(offlineOnly
        ? [...playableAudioParts(detail, 'online'), ...Object.keys(starred?.audioBlobs ?? {})]
        : []),
    ]),
  ])
  const out: string[] = []

  for (const part of candidates) {
    const starEntry = starredAudioEntry(starred, part)
    if (starEntry?.data) {
      out.push(part)
      continue
    }

    if (!offlineOnly) {
      if (playbackAudioPath(detail, part) || originalAudioPath(detail, part)) {
        out.push(part)
      }
      continue
    }

    if (part.toLowerCase() === 'mix') {
      if (await offlineMixAvailable(detail)) out.push(part)
    } else if (await voicePartInPack(detail, part)) {
      out.push(part)
    }
  }

  return sortPartIds(out)
}

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
        const url = blobUrlFromCached(entry)
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

  const starEntry = starredAudioEntry(starred, part)
  if (starEntry) {
    const raw = blobUrlFromCached(starEntry)
    if (raw) {
      const tier = starEntry.quality === 'original' ? 'original' : starEntry.quality || 'cached'
      const url = await finalizeBlobUrl(raw, starEntry.path, { detail, part })
      return { kind: 'blob', url, source: 'star', tier }
    }
  }

  const original = originalAudioPath(detail, part)
  if (original) {
    const hit = await firstPackHit([original])
    if (hit) return { kind: 'blob', url: hit.url, source: 'pack', tier: 'original' }
  }

  if (!offlineOnly) {
    const playback = playbackAudioPath(detail, part)
    if (playback) {
      return {
        kind: 'network',
        url: mediaUrl(playback),
        source: 'network',
        path: playback,
        tier: 'playback',
      }
    }
    return null
  }

  const playback = playbackAudioPath(detail, part)
  if (playback) {
    const hit = await firstPackHit([playback])
    if (hit) return { kind: 'blob', url: hit.url, source: 'pack', tier: 'playback' }
  }

  const ultra = ultraAudioPath(detail, part)
  if (ultra) {
    const hit = await firstPackHit([ultra], { detail, part })
    if (hit) return { kind: 'blob', url: hit.url, source: 'pack', tier: 'ultra' }
  }

  if (part.toLowerCase() === 'mix') {
    const reconstructed = await tryReconstructMix(detail)
    if (reconstructed) return reconstructed
  }

  const hit = await firstPackHit(cachedPathCandidates(detail, part), { detail, part })
  if (hit) return { kind: 'blob', url: hit.url, source: 'pack', tier: 'cached' }

  return null
}

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

export async function packHasPath(path: string): Promise<boolean> {
  return packHasAbsolute(mediaUrl(path))
}

export async function packHasAnySheets(paths: string[]): Promise<boolean> {
  for (const p of paths) {
    if (await packHasPath(p)) return true
  }
  return false
}
