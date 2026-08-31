/**
 * Resolve media for display: favorites IndexedDB → offline pack → network URL.
 *
 * Audio parts follow the quality ladder in the audio-storage-cache ADR.
 * Product UI refers to favorites; code uses `star` source labels and `starred*` DB names.
 */

import type { TagDetail } from '../types/tag'
import {
  cachedPathCandidates,
  isMixOnlyTag,
  isPublishedTierPath,
  isUltraMonoStemPath,
  mixIsDisjoint,
  needsOnlineVirtualPartLearning,
  originalAudioPath,
  partsAreRecombinable,
  playableAudioParts,
  playbackAudioPath,
  listAudioParts,
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
import { blobUrlFromCached, getStarred, type StarredTagRecord } from './favoritesDb'
import { audioPack, sheetsPack } from './libraryPack'
import { isPlausibleMediaBody } from './downloadQueue'

/** Result of resolving a sheet path or audio part to a playable URL. */
export type ResolvedMedia =
  | { kind: 'blob'; url: string; source: 'star' | 'pack' | 'reconstruct'; tier?: string }
  | { kind: 'network'; url: string; source: 'network'; path: string; tier?: string }

/** Session cache of reconstructed learning-track stereo blob URLs (tagId:part → blob:). */
const learningStereoCache = new Map<string, string>()
/** In-flight reconstructs so warmDefaultAudio + TagPlayer don't double-build. */
const learningStereoInflight = new Map<string, Promise<string>>()

function learningStereoKey(tagId: number, part: string): string {
  return `${tagId}:${part.toLowerCase()}`
}

/** Drop cached reconstruct URLs (does not revoke — caller owns blob lifetime via useObjectUrls). */
export function clearLearningStereoCache(tagId?: number): void {
  if (tagId == null) {
    learningStereoCache.clear()
    learningStereoInflight.clear()
    return
  }
  const prefix = `${tagId}:`
  for (const k of [...learningStereoCache.keys()]) {
    if (k.startsWith(prefix)) learningStereoCache.delete(k)
  }
  for (const k of [...learningStereoInflight.keys()]) {
    if (k.startsWith(prefix)) learningStereoInflight.delete(k)
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

async function packBlobFromResponse(
  pack: typeof audioPack,
  key: string,
  res: Response,
): Promise<string | null> {
  const buf = await res.arrayBuffer()
  const mime = res.headers.get('Content-Type') || 'application/octet-stream'
  // Drop SPA HTML that was cached when missing /library files returned index.html.
  if (!isPlausibleMediaBody(buf, mime)) {
    await pack.delete(key)
    return null
  }
  return URL.createObjectURL(new Blob([buf], { type: mime }))
}

async function packGetBlobUrl(absolute: string): Promise<string | null> {
  const pack = isAudioAbsolute(absolute) ? audioPack : sheetsPack
  for (const key of packLookupKeys(absolute)) {
    const res = await pack.get(key)
    if (!res) continue
    const url = await packBlobFromResponse(pack, key, res)
    if (url) return url
  }
  return null
}

async function packHasAbsolute(absolute: string): Promise<boolean> {
  const pack = isAudioAbsolute(absolute) ? audioPack : sheetsPack
  for (const key of packLookupKeys(absolute)) {
    if (await pack.has(key)) return true
  }
  return false
}

function accompanimentVoiceParts(detail: TagDetail, activePart: string): string[] {
  const active = activePart.toLowerCase()
  return voiceAudioParts(detail).filter((p) => p.toLowerCase() !== active)
}

/**
 * Case-insensitive lookup into a favorite tag's cached audio blobs.
 *
 * @param starred Favorite record from IndexedDB (`StarredTagRecord`), or null.
 * @param part Learning-track part id (any casing).
 */
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
  // Rewrite ultra mono stems (solo *or* downmix) and lofi-starred solos.
  // Leave hosted originals / part-left playback alone.
  const starredEntry = ctx ? starredAudioEntry(ctx.starred, ctx.part) : undefined
  const lofiSolo =
    !!starredEntry &&
    starredEntry.quality === 'lofi' &&
    !!ctx &&
    ctx.part.toLowerCase() !== 'mix' &&
    usesMonoSolos(ctx.detail)
  if (
    (!isUltraMonoStemPath(catalogPath) && !lofiSolo) ||
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
    const pending = learningStereoInflight.get(cacheKey)
    if (pending) {
      URL.revokeObjectURL(url)
      return pending
    }

    const build = (async (): Promise<string> => {
      const summary = detail.audio_layout_summary
      // Virtual part-left: solo hard L, accompaniment hard R (mono_solos + mono_downmix).
      // Published part_right originals are not used for stem reconstruct.
      const soloSide: PartSide | null =
        usesMonoSolos(detail) ? 'left' : soloSideForPart(part, detail.audio_layouts, summary)

      // Per-part mono/dual-mono stems still recombine: each file is one voice, not a finished
      // learning track. Only skip multi-stem rebuild when we lack a solo side and aren't
      // in the mono-stem ultra policies.
      if (soloSide) {
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

      const hard = await monoSoloToHardPanObjectUrl(url, 'left')
      URL.revokeObjectURL(url)
      learningStereoCache.set(cacheKey, hard.url)
      return hard.url
    })()

    learningStereoInflight.set(cacheKey, build)
    try {
      return await build
    } finally {
      learningStereoInflight.delete(cacheKey)
    }
  }

  // Missing solo side / no ctx: hard-pan left vs dual-mono.
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
    // One get() — pack store resolves relative/absolute/pathname variants.
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
      (isUltraMonoStemPath(starEntry.path) || starEntry.quality === 'lofi')
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
      if (isPublishedTierPath(p) && isUltraMonoStemPath(p)) add(p)
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
  if (mixIsDisjoint(detail) || !partsAreRecombinable(detail)) return null
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

async function packPathsPresent(paths: string[]): Promise<Set<string>> {
  const unique = [...new Set(paths.filter(Boolean))]
  const present = new Set<string>()
  if (!unique.length) return present
  await Promise.all(
    unique.map(async (path) => {
      if (await packHasPath(path)) present.add(path)
    }),
  )
  return present
}

function partHasPackHit(detail: TagDetail, part: string, present: Set<string>): boolean {
  return cachedPathCandidates(detail, part).some((p) => present.has(p))
}

function offlineMixAvailableFromPresence(detail: TagDetail, present: Set<string>): boolean {
  if (isMixOnlyTag(detail)) return partHasPackHit(detail, 'mix', present)
  let stems = 0
  for (const part of voiceAudioParts(detail)) {
    if (partHasPackHit(detail, part, present)) stems++
    if (stems >= 2) return true
  }
  return partHasPackHit(detail, 'mix', present)
}

/**
 * Offline (and online) availability for player tabs + whether any audio pack hit exists.
 * Offline path batches pack existence checks in parallel instead of sequential walks.
 */
export async function probeTagAudioAvailability(
  detail: TagDetail,
  opts?: {
    starred?: StarredTagRecord | null
    offlineOnly?: boolean
  },
): Promise<{ parts: string[]; hasPackAudio: boolean }> {
  const offlineOnly = opts?.offlineOnly === true
  const starred = opts?.starred
  const candidates = sortPartIds([
    ...new Set([
      ...playableAudioParts(detail, offlineOnly ? 'offline' : 'online'),
      ...(offlineOnly
        ? [...playableAudioParts(detail, 'online'), ...Object.keys(starred?.audioBlobs ?? {})]
        : []),
    ]),
  ])

  if (!offlineOnly) {
    const parts: string[] = []
    let hasPackAudio = false
    const packCheckPaths: string[] = []
    for (const part of candidates) {
      const starEntry = starredAudioEntry(starred, part)
      if (starEntry?.data) {
        parts.push(part)
        continue
      }
      if (playbackAudioPath(detail, part) || originalAudioPath(detail, part)) {
        parts.push(part)
      }
      for (const p of cachedPathCandidates(detail, part)) packCheckPaths.push(p)
    }
    // Soft signal for UI: any pack hit for this tag (does not block tabs).
    const present = await packPathsPresent(packCheckPaths)
    hasPackAudio = present.size > 0
    return { parts: sortPartIds(parts), hasPackAudio }
  }

  const packCheckPaths: string[] = []
  for (const part of candidates) {
    const starEntry = starredAudioEntry(starred, part)
    if (starEntry?.data) continue
    for (const p of cachedPathCandidates(detail, part)) packCheckPaths.push(p)
    // Mix reconstruct may need any voice stem — include all voice candidates once.
    if (part.toLowerCase() === 'mix' && !isMixOnlyTag(detail)) {
      for (const voice of voiceAudioParts(detail)) {
        for (const p of cachedPathCandidates(detail, voice)) packCheckPaths.push(p)
      }
    }
  }
  const present = await packPathsPresent(packCheckPaths)
  const hasPackAudio = present.size > 0
  const out: string[] = []

  for (const part of candidates) {
    const starEntry = starredAudioEntry(starred, part)
    if (starEntry?.data) {
      out.push(part)
      continue
    }
    if (part.toLowerCase() === 'mix') {
      if (offlineMixAvailableFromPresence(detail, present)) out.push(part)
    } else if (partHasPackHit(detail, part, present)) {
      out.push(part)
    }
  }

  return { parts: sortPartIds(out), hasPackAudio }
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
  const { parts } = await probeTagAudioAvailability(detail, opts)
  return parts
}

/** True when any learning-track path for this tag is present in the audio pack. */
export async function probePackAudioPresence(detail: TagDetail): Promise<boolean> {
  const paths: string[] = []
  for (const part of listAudioParts(detail)) {
    for (const p of cachedPathCandidates(detail, part)) paths.push(p)
  }
  const present = await packPathsPresent(paths)
  return present.size > 0
}

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
    playbackAudioPath(detail, part) ?? originalAudioPath(detail, part) ?? ultraAudioPath(detail, part)
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
      activeUrl = blobUrlFromCached(starEntry)
      activeOwned = !!activeUrl
    }
  }
  if (!activeUrl) activeUrl = mediaUrl(activePath)

  const others: Array<{ part: string; url: string }> = []
  const owned: string[] = []
  for (const voice of voiceAudioParts(detail)) {
    if (voice.toLowerCase() === part.toLowerCase()) continue
    const path =
      playbackAudioPath(detail, voice) ??
      originalAudioPath(detail, voice) ??
      ultraAudioPath(detail, voice)
    if (!path) continue
    const hit = await firstPackHit([path], { skipFinalize: true, starred })
    if (hit) {
      others.push({ part: voice, url: hit.url })
      owned.push(hit.url)
      continue
    }
    const starEntry = starredAudioEntry(starred, voice)
    if (starEntry) {
      const u = blobUrlFromCached(starEntry)
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
    const raw = blobUrlFromCached(starEntry)
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
    const playback = playbackAudioPath(detail, part)
    if (playback) {
      const packPlayback = await firstPackHit([playback], { skipFinalize: true, starred })
      if (packPlayback && !needsOnlineVirtualPartLearning(detail)) {
        return { kind: 'blob', url: packPlayback.url, source: 'pack', tier: 'playback' }
      }
      if (packPlayback) URL.revokeObjectURL(packPlayback.url)
      warmAudioPackFromNetwork(playback)
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
export async function packHasPath(path: string): Promise<boolean> {
  return packHasAbsolute(mediaUrl(path))
}

/** True when any of the given sheet paths is present in the sheets pack. */
export async function packHasAnySheets(paths: string[]): Promise<boolean> {
  for (const p of paths) {
    if (await packHasPath(p)) return true
  }
  return false
}
