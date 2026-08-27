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
import { soloSideForPart, type PartSide } from '../lib/audioLayout'
import {
  buildPartLearningStereoObjectUrl,
  buildUltraMixObjectUrl,
  monoSoloToHardPanObjectUrl,
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

/** True when this part already has a reconstructed learning-stereo blob in-session. */
export function hasCachedLearningStereo(tagId: number, part: string, url?: string): boolean {
  const cached = learningStereoCache.get(learningStereoKey(tagId, part))
  if (!cached) return false
  return url == null || cached === url
}

function isAudioAbsolute(absolute: string): boolean {
  return absolute.includes('/media/') || /\.(m4a|mp3|ogg|opus|wav|aac|webm)(\?|$)/i.test(absolute)
}

/** Cache keys may differ by origin (localhost vs 127.0.0.1); try pathname variants. */
function packLookupKeys(absolute: string): string[] {
  const keys = [absolute]
  try {
    const base =
      typeof window !== 'undefined' ? window.location.href : 'http://127.0.0.1/'
    const u = new URL(absolute, base)
    if (u.pathname && u.pathname !== absolute) keys.push(u.pathname)
  } catch {
    /* ignore */
  }
  return [...new Set(keys)]
}

async function packGetBlobUrl(absolute: string): Promise<string | null> {
  const pack = isAudioAbsolute(absolute) ? audioPack : sheetsPack
  for (const key of packLookupKeys(absolute)) {
    const res = await pack.get(key)
    if (!res) continue
    const buf = await res.arrayBuffer()
    const mime = res.headers.get('Content-Type') || 'application/octet-stream'
    return URL.createObjectURL(new Blob([buf], { type: mime }))
  }
  // Origin mismatch fallback: match by pathname suffix.
  try {
    const base =
      typeof window !== 'undefined' ? window.location.href : 'http://127.0.0.1/'
    const want = new URL(absolute, base).pathname
    for (const stored of await pack.listUrls()) {
      try {
        const sp = new URL(stored, base).pathname
        if (sp === want || stored.endsWith(want)) {
          const res = await pack.get(stored)
          if (!res) continue
          const buf = await res.arrayBuffer()
          const mime = res.headers.get('Content-Type') || 'application/octet-stream'
          return URL.createObjectURL(new Blob([buf], { type: mime }))
        }
      } catch {
        /* ignore */
      }
    }
  } catch {
    /* ignore */
  }
  return null
}

async function packHasAbsolute(absolute: string): Promise<boolean> {
  const pack = isAudioAbsolute(absolute) ? audioPack : sheetsPack
  for (const key of packLookupKeys(absolute)) {
    if (await pack.has(key)) return true
  }
  try {
    const base =
      typeof window !== 'undefined' ? window.location.href : 'http://127.0.0.1/'
    const want = new URL(absolute, base).pathname
    for (const stored of await pack.listUrls()) {
      try {
        const sp = new URL(stored, base).pathname
        if (sp === want || stored.endsWith(want)) return true
      } catch {
        /* ignore */
      }
    }
  } catch {
    /* ignore */
  }
  return false
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

/** Prefer full accompaniment; allow partial (≥1) so incomplete packs still get stereo. */
function canReconstructLearningStereo(
  cached: Array<{ part: string; url: string }>,
  required: string[],
): boolean {
  if (!cached.length) return false
  if (!required.length) return false
  return cached.length >= 1
}

/** Present ultra mono solos as learning-track stereo when stems allow (else hard-pan solo). */
async function finalizeBlobUrl(
  url: string,
  catalogPath: string,
  ctx?: { detail: TagDetail; part: string; starred?: StarredTagRecord | null },
): Promise<string> {
  // Only rewrite ultra mono stems (and lofi-starred solos). Leave originals / playback alone.
  const starredEntry = ctx ? starredAudioEntry(ctx.starred, ctx.part) : undefined
  const lofiSolo =
    !!starredEntry &&
    starredEntry.quality === 'lofi' &&
    !!ctx &&
    ctx.part.toLowerCase() !== 'mix' &&
    usesMonoSolos(ctx.detail)
  if (
    (!isUltraSoloPath(catalogPath) && !lofiSolo) ||
    typeof AudioContext === 'undefined'
  ) {
    return url
  }

  if (ctx) {
    const { detail, part, starred } = ctx
    const cacheKey = learningStereoKey(detail.tag_id, part)
    const cached = learningStereoCache.get(cacheKey)
    if (cached) {
      URL.revokeObjectURL(url)
      return cached
    }

    const summary = detail.audio_layout_summary
    // Offline mono_solos rebuild is always part-left: solo hard L, accompaniment hard R.
    // (Published originals may be part_right; that layout is not used for stem reconstruct.)
    const soloSide: PartSide =
      usesMonoSolos(detail) ? 'left' : soloSideForPart(part, detail.audio_layouts, summary)

    const trueMono = summary?.parts === 'mono' || summary?.parts === 'near_mono'

    if (!trueMono && soloSide) {
      const required = accompanimentVoiceParts(detail, part)
      const others = await collectVoiceStemUrls(detail, {
        excludePart: part,
        starred: starred ?? null,
      })
      if (canReconstructLearningStereo(others, required)) {
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
        } catch (err) {
          console.warn('[singtags] learning-stereo reconstruct failed', detail.tag_id, part, err)
          for (const o of others) URL.revokeObjectURL(o.url)
        }
      } else {
        for (const o of others) URL.revokeObjectURL(o.url)
      }

      // Never dual-mono for learning tracks — hard-pan solo so it is only in one speaker.
      const hard = await monoSoloToHardPanObjectUrl(url, soloSide)
      URL.revokeObjectURL(url)
      learningStereoCache.set(cacheKey, hard.url)
      return hard.url
    }
  }

  // True mono tags (or missing layout): hard-pan left (part-left) vs dual-mono.
  const hard = await monoSoloToHardPanObjectUrl(url, 'left')
  URL.revokeObjectURL(url)
  return hard.url
}

async function firstPackHit(
  paths: string[],
  opts?: {
    skipFinalize?: boolean
    detail?: TagDetail
    part?: string
    starred?: StarredTagRecord | null
  },
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
          opts?.detail && opts?.part
            ? { detail: opts.detail, part: opts.part, starred: opts.starred ?? null }
            : undefined,
        )
    return { path, url }
  }
  return null
}

async function collectVoiceStemUrls(
  detail: TagDetail,
  opts?: { excludePart?: string; starred?: StarredTagRecord | null },
): Promise<Array<{ part: string; url: string }>> {
  const exclude = opts?.excludePart?.toLowerCase()
  const starred = opts?.starred
  const inputs: Array<{ part: string; url: string }> = []
  for (const part of voiceAudioParts(detail)) {
    if (exclude && part.toLowerCase() === exclude) continue

    // Starred ultra/lofi solos (IndexedDB) — needed when offline pack isn't the stem source.
    const starEntry = starredAudioEntry(starred, part)
    if (
      starEntry &&
      (isUltraSoloPath(starEntry.path) || starEntry.quality === 'lofi')
    ) {
      const url = blobUrlFromCached(starEntry)
      if (url) {
        inputs.push({ part, url })
        continue
      }
    }

    const paths: string[] = []
    const add = (p: string | null) => {
      if (p && !paths.includes(p)) paths.push(p)
    }
    add(tierPath(detail, part, 'ultra_solo'))
    add(tierPath(detail, part, 'ultra_downmix'))
    add(ultraAudioPath(detail, part))
    for (const p of cachedPathCandidates(detail, part)) {
      if (isPublishedTierPath(p) && isUltraSoloPath(p)) add(p)
    }
    const hit = await firstPackHit(paths, { skipFinalize: true })
    if (hit) inputs.push({ part, url: hit.url })
  }
  return inputs
}

async function tryReconstructMix(
  detail: TagDetail,
  starred?: StarredTagRecord | null,
): Promise<ResolvedMedia | null> {
  if (mixIsDisjoint(detail)) return null
  const inputs = await collectVoiceStemUrls(detail, { starred: starred ?? null })
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
  const partKey = part.toLowerCase()
  const offlineVoiceMonoSolos =
    offlineOnly && partKey !== 'mix' && usesMonoSolos(detail)

  // Offline learning tracks: rebuild hard L/R from ultra solos first (not dual-mono /
  // soft-balanced originals or playback that may be cached from starring).
  if (offlineVoiceMonoSolos) {
    const fromUltra = await resolveOfflineUltraVoice(detail, part, starred)
    if (fromUltra) return fromUltra
  }

  const starEntry = starredAudioEntry(starred, part)
  if (starEntry) {
    const raw = blobUrlFromCached(starEntry)
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

  const original = originalAudioPath(detail, part)
  if (original) {
    const hit = await firstPackHit([original], {
      starred,
      detail: offlineVoiceMonoSolos ? detail : undefined,
      part: offlineVoiceMonoSolos ? part : undefined,
    })
    if (hit) {
      // Offline mono_solos must not play raw originals when we can rebuild; if we
      // reached here, ultra stems were missing — still return the original hit.
      return { kind: 'blob', url: hit.url, source: 'pack', tier: 'original' }
    }
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

/** Offline ultra solo → learning-stereo blob (or hard-pan fallback). */
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

  const soloPaths = cachedPathCandidates(detail, part).filter(isUltraSoloPath)
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
    (isUltraSoloPath(starEntry.path) || starEntry.quality === 'lofi')
  ) {
    const raw = blobUrlFromCached(starEntry)
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
