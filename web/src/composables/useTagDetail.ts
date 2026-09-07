/**
 * Tag detail page composable: load metadata, resolve offline/online media, prepare sheets.
 *
 * Orchestrates favorites (IndexedDB `starred` records), tier-2 packs, and network fetches.
 * Audio parts resolve lazily on first play; sheets are prepared for display when possible.
 */

import { computed, nextTick, onUnmounted, ref, watch, type Ref } from 'vue'
import type { PartId, TagDetail, TagSummary } from '../types/tag'
import {
  inferLowerQualityFromStarred,
  isUltraMonoStemPath,
  isUltraSoloPath,
  listAudioParts,
  needsOnlineVirtualPartLearning,
  usesMonoSolos,
} from '../lib/audioTiers'
import { preferredDefaultPart, sortPartIds } from '../lib/parts'
import { mediaUrl, tagDetailUrl } from '../lib/mediaUrl'
import { resolveSheetAssets } from '../lib/sheetAssets'
import { sheetDisplayPages } from '../lib/sheetPaths'
import { revokePreparedSheet, type PreparedSheet } from '../lib/prepareSheet'
import { getStarred, blobUrlFromCached, type StarredTagRecord } from '../offline/favoritesDb'
import { getTransferredTag } from '../offline/transferredDb'
import { fetchCached } from '../lib/manualOfflineFetch'
import { probeTagAudioAvailability, resolveAudioPart, resolvePathUrl, clearLearningStereoCache, hasCachedLearningStereo } from '../offline/resolveMedia'
import { sheetsPack } from '../offline/libraryPack'
import { useFavoritesStore } from '../stores/favorites'
import { useOfflineModeStore } from '../stores/offlineMode'
import { useObjectUrls } from './useObjectUrls'

/**
 * Reactive state and loaders for a single tag detail view.
 *
 * @param id Tag id as a ref or plain string (watched when a ref).
 * @returns Detail JSON, resolved media URLs, sheet assets, and load/resolve helpers.
 */
export function useTagDetail(id: Ref<string> | string) {
  const favorites = useFavoritesStore()
  const { track, revokeAll, take } = useObjectUrls()
  const detail = ref<TagDetail | null>(null)
  const error = ref<string | null>(null)
  const fromCache = ref(false)
  /** Resolved playable paths/URLs — populated lazily per part. */
  const audioParts = ref<Record<string, string>>({})
  /** All learning parts from tag metadata (for tabs before lazy resolve). */
  const availableAudioParts = ref<string[]>([])
  const hasLowerQualityAudio = ref(false)
  /** True when any learning-track tier for this tag is in the offline audio pack. */
  const hasPackAudio = ref(false)
  const cachedSheetPages = ref<string[] | null>(null)
  /** Where sheet/audio bytes came from after the last resolve pass. */
  const mediaSource = ref<'network' | 'star' | 'pack' | 'mixed'>('network')
  const preparedSheet = ref<PreparedSheet | null>(null)
  /** True until the first `load()` finishes — avoids flashing “Could not load full tag”
   * when the catalog summary hydrates before tag detail has been fetched. */
  const loading = ref(true)
  const sheetPreparing = ref(false)
  /** True while post-load default-part warm is in flight (online/offline). */
  const audioWarming = ref(false)

  /** Favorites IndexedDB record for this tag, when loaded (legacy `StarredTagRecord` type). */
  let starredRecord: StarredTagRecord | undefined
  let fetchAbort: AbortController | null = null
  let loadSeq = 0

  function isBlobPlaybackUrl(url: string): boolean {
    return url.startsWith('blob:')
  }

  function dropNonBlobAudioParts(): void {
    const next: Record<string, string> = {}
    let changed = false
    for (const [part, url] of Object.entries(audioParts.value)) {
      if (isBlobPlaybackUrl(url)) next[part] = url
      else changed = true
    }
    if (changed) audioParts.value = next
  }

  /** Coming online via TagView load(): clear resolved blobs so HQ can replace ultra/lofi. */
  function dropResolvedAudioForOnlineUpgrade(): void {
    const tagId = detail.value?.tag_id
    audioParts.value = {}
    hasLowerQualityAudio.value = false
    if (tagId != null) clearLearningStereoCache(tagId)
  }

  watch(
    () => useOfflineModeStore().offline,
    (now, prev) => {
      const d = detail.value
      if (!d) return
      // Coming online: TagView calls load() for a full upgrade pass — avoid duplicating work here.
      if (now && !prev) {
        dropNonBlobAudioParts()
        void (async () => {
          await resolveSheets(d, starredRecord, true)
          if (detail.value !== d) return
          if (cachedSheetPages.value?.length) {
            preparedSheet.value = { pages: [...cachedSheetPages.value], owned: [] }
          }
          const { parts, hasPackAudio: packHit } = await probeTagAudioAvailability(d, {
            starred: starredRecord ?? null,
            offlineOnly: true,
          })
          if (detail.value !== d) return
          availableAudioParts.value = parts
          hasPackAudio.value = packHit
          void warmDefaultAudio(d, starredRecord, true, loadSeq)
        })()
      }
    },
  )

  function idStr(): string {
    return typeof id === 'string' ? id : id.value
  }

  function clearPreparedSheet(): void {
    revokePreparedSheet(preparedSheet.value)
    preparedSheet.value = null
  }

  function clearMedia(tagId?: number): void {
    // Prefer explicit id — callers often null `detail` before clearing.
    const id = tagId ?? detail.value?.tag_id
    revokeAll()
    clearLearningStereoCache(id)
    audioParts.value = {}
    availableAudioParts.value = []
    hasLowerQualityAudio.value = false
    cachedSheetPages.value = null
    hasPackAudio.value = false
    mediaSource.value = 'network'
    starredRecord = undefined
    clearPreparedSheet()
  }

  /**
   * Resolve sheet display URLs from favorites / pack blobs when possible.
   * Returns untracked blob URLs — caller must {@link track} (or revoke) them.
   */
  async function collectSheetBlobPages(
    d: TagDetail,
    cached: StarredTagRecord | undefined,
    offlineOnly: boolean,
    signal?: AbortSignal,
  ): Promise<{ pages: string[] | null; sources: Set<'star' | 'pack' | 'network'> }> {
    const sources = new Set<'star' | 'pack' | 'network'>()
    const sheetPaths = sheetDisplayPages(d)

    if (cached?.sheetBlobs?.length && sheetPaths.length) {
      const pages: string[] = []
      for (let i = 0; i < sheetPaths.length; i++) {
        if (signal?.aborted) {
          for (const u of pages) URL.revokeObjectURL(u)
          return { pages: null, sources }
        }
        const path = sheetPaths[i]!
        const byPath = cached.sheetBlobs.find((b) => b.path === path)
        const entry = byPath ?? cached.sheetBlobs[i]
        if (!entry) break
        const url = blobUrlFromCached(entry)
        if (!url) break
        pages.push(url)
        sources.add('star')
      }
      return {
        pages: pages.length === sheetPaths.length ? pages : null,
        sources,
      }
    }

    if (sheetPaths.length) {
      const pages: string[] = []
      let allBlob = true
      for (const path of sheetPaths) {
        if (signal?.aborted) {
          for (const u of pages) URL.revokeObjectURL(u)
          return { pages: null, sources }
        }
        const resolved = await resolvePathUrl(path, {
          starred: cached ?? null,
          offlineOnly,
        })
        if (!resolved || resolved.kind !== 'blob') {
          allBlob = false
          for (const u of pages) URL.revokeObjectURL(u)
          return { pages: null, sources }
        }
        sources.add(resolved.source === 'reconstruct' ? 'pack' : resolved.source)
        pages.push(resolved.url)
      }
      return { pages: allBlob && pages.length ? pages : null, sources }
    }

    if (cached?.sheetBlobs?.length) {
      const pages: string[] = []
      for (const b of cached.sheetBlobs) {
        if (signal?.aborted) {
          for (const u of pages) URL.revokeObjectURL(u)
          return { pages: null, sources }
        }
        const url = blobUrlFromCached(b)
        if (url) pages.push(url)
      }
      if (pages.length) sources.add('star')
      return { pages: pages.length ? pages : null, sources }
    }

    return { pages: null, sources }
  }

  async function resolveSheets(
    d: TagDetail,
    cached: StarredTagRecord | undefined,
    offlineOnly: boolean,
  ): Promise<Set<'star' | 'pack' | 'network'>> {
    const { pages, sources } = await collectSheetBlobPages(d, cached, offlineOnly)
    cachedSheetPages.value = pages?.map((u) => track(u)) ?? null
    return sources
  }

  /**
   * Seed audio from favorite-tag blobs only — no network/pack/mix work at tag load.
   * Skips ultra/lofi voice stems offline (mono_solos rebuild) and online (so HQ pack/network can win).
   */
  function seedStarredAudio(
    cached: StarredTagRecord | undefined,
    d: TagDetail | undefined,
    offlineOnly: boolean,
  ): Set<'star' | 'pack' | 'network'> {
    const sources = new Set<'star' | 'pack' | 'network'>()
    const parts: Record<string, string> = {}

    if (cached?.audioBlobs) {
      for (const [part, entry] of Object.entries(cached.audioBlobs)) {
        const degraded =
          part.toLowerCase() !== 'mix' &&
          (isUltraSoloPath(entry.path) || entry.quality === 'lofi')
        if (degraded) {
          // Online: leave room for pack/network HQ. Offline mono_solos: rebuild via resolveAudioPart.
          if (!offlineOnly || (d && usesMonoSolos(d))) continue
        }
        const url = blobUrlFromCached(entry)
        if (url) {
          parts[part] = track(url)
          sources.add('star')
        }
      }
    }

    audioParts.value = parts
    hasLowerQualityAudio.value = inferLowerQualityFromStarred(cached?.audioBlobs)
    return sources
  }


  /** Offline: force re-resolve only when the blob still needs learning-stereo rebuild. */
  function needsOfflineVoiceRebuild(d: TagDetail, part: string, existingUrl: string): boolean {
    if (part.toLowerCase() === 'mix' || !usesMonoSolos(d)) return false
    if (hasCachedLearningStereo(d.tag_id, part, existingUrl)) return false
    // Dual-mono hosts always need a learning-stereo rebuild (unless already cached above).
    if (needsOnlineVirtualPartLearning(d)) return true
    const blobs = starredRecord?.audioBlobs
    const entry =
      blobs?.[part] ??
      (blobs
        ? Object.entries(blobs).find(([k]) => k.toLowerCase() === part.toLowerCase())?.[1]
        : undefined)
    if (
      entry &&
      entry.quality !== 'lofi' &&
      !isUltraSoloPath(entry.path) &&
      !isUltraMonoStemPath(entry.path)
    ) {
      // Cached original/playback for mono_solos is already a learning track.
      return false
    }
    return true
  }

  async function warmPreferredPart(
    d: TagDetail,
    preferred: string,
    cached: StarredTagRecord | undefined,
    offlineOnly: boolean,
    seq: number,
  ): Promise<'star' | 'pack' | 'network' | 'reconstruct' | null> {
    if (seq !== loadSeq || detail.value?.tag_id !== d.tag_id) return null
    const existing = audioParts.value[preferred]
    const forceOfflineRebuild =
      offlineOnly && needsOfflineVoiceRebuild(d, preferred, existing ?? '')
    if (existing && !(forceOfflineRebuild && isBlobPlaybackUrl(existing))) {
      if (isBlobPlaybackUrl(existing)) {
        return hasCachedLearningStereo(d.tag_id, preferred, existing) ? 'reconstruct' : 'star'
      }
      return 'network'
    }
    try {
      const resolved = await resolveAudioPart(d, preferred, {
        starred: cached ?? null,
        offlineOnly,
      })
      if (seq !== loadSeq || detail.value?.tag_id !== d.tag_id) return null
      if (!resolved) return null
      if (resolved.kind === 'blob') {
        audioParts.value = { ...audioParts.value, [preferred]: track(resolved.url) }
        if (resolved.source === 'star') {
          const entry = cached?.audioBlobs?.[preferred]
          if (entry?.quality && entry.quality !== 'original') {
            hasLowerQualityAudio.value = true
          }
        } else if (resolved.tier && resolved.tier !== 'original') {
          hasLowerQualityAudio.value = true
        }
        return resolved.source
      }
      audioParts.value = { ...audioParts.value, [preferred]: resolved.path }
      return 'network'
    } catch {
      return null
    }
  }

  /** Warm the default learning track after sheets are on screen. */
  async function warmDefaultAudio(
    d: TagDetail,
    cached: StarredTagRecord | undefined,
    offlineOnly: boolean,
    seq: number,
  ): Promise<void> {
    if (seq !== loadSeq || detail.value?.tag_id !== d.tag_id) return
    // Tags with no catalog/starred audio must not inherit a prior tag's tabs.
    if (!listAudioParts(d).length && !cached?.audioBlobs) return
    const preferred = preferredDefaultPart(availableAudioParts.value)
    if (!preferred) return
    const src = await warmPreferredPart(d, preferred, cached, offlineOnly, seq)
    if (seq !== loadSeq || detail.value?.tag_id !== d.tag_id) return
    if (!src) return
    const sources = new Set<string>([mediaSource.value === 'mixed' ? 'star' : mediaSource.value])
    if (src === 'reconstruct') sources.add('pack')
    else sources.add(src)
    if (hasPackAudio.value) sources.add('pack')
    if (sources.size <= 1) mediaSource.value = (src === 'reconstruct' ? 'pack' : src) as typeof mediaSource.value
    else mediaSource.value = 'mixed'
    availableAudioParts.value = sortPartIds([
      ...new Set([...availableAudioParts.value, ...Object.keys(audioParts.value)]),
    ])
  }

  /**
   * Lazy-resolve one part on first play / tab switch.
   * Returns a URL suitable for fetch/decode (absolute or blob).
   */
  async function resolvePart(part: string): Promise<string | null> {
    const d = detail.value
    if (!d) return null

    const offlineOnly = useOfflineModeStore().offline
    const partKeys = new Set(listAudioParts(d).map((p) => p.toLowerCase()))
    const starredKeys = new Set(
      Object.keys(starredRecord?.audioBlobs ?? {}).map((p) => p.toLowerCase()),
    )
    if (!partKeys.has(part.toLowerCase()) && !starredKeys.has(part.toLowerCase())) {
      return null
    }

    const existing = audioParts.value[part]
    if (existing) {
      if (isBlobPlaybackUrl(existing)) {
        // Offline: keep HQ playback/original; only rebuild when still on ultra/lofi or dual-mono.
        if (!offlineOnly || !needsOfflineVoiceRebuild(d, part, existing)) {
          return existing
        }
      } else if (!offlineOnly) {
        if (
          existing.startsWith('http://') ||
          existing.startsWith('https://') ||
          existing.startsWith('/')
        ) {
          return existing
        }
        return mediaUrl(existing)
      }
    }

    const resolved = await resolveAudioPart(d, part, {
      starred: starredRecord ?? null,
      offlineOnly,
    })
    if (!resolved) return null

    if (resolved.kind === 'blob') {
      const url = track(resolved.url)
      audioParts.value = { ...audioParts.value, [part]: url }
      if (resolved.source === 'star') {
        const entry = starredRecord?.audioBlobs?.[part]
        if (entry?.quality && entry.quality !== 'original') {
          hasLowerQualityAudio.value = true
        }
      } else if (resolved.tier && resolved.tier !== 'original') {
        hasLowerQualityAudio.value = true
      }
      // Warm sibling voice URLs offline so part switches keep the playhead (no long first-resolve).
      if (offlineOnly && part.toLowerCase() !== 'mix') {
        void prefetchOfflineVoiceParts(d, part)
      }
      return url
    }

    audioParts.value = { ...audioParts.value, [part]: resolved.path }
    return resolved.url
  }

  /** Background-resolve other voice parts so tab switches don't stall mid-playback. */
  async function prefetchOfflineVoiceParts(d: TagDetail, exceptPart: string): Promise<void> {
    const except = exceptPart.toLowerCase()
    const seq = loadSeq
    for (const p of availableAudioParts.value) {
      if (seq !== loadSeq || detail.value !== d) return
      if (p.toLowerCase() === except || p.toLowerCase() === 'mix') continue
      if (audioParts.value[p]) continue
      try {
        const resolved = await resolveAudioPart(d, p, {
          starred: starredRecord ?? null,
          offlineOnly: true,
        })
        if (seq !== loadSeq || detail.value !== d) {
          if (resolved?.kind === 'blob' && !hasCachedLearningStereo(d.tag_id, p, resolved.url)) {
            URL.revokeObjectURL(resolved.url)
          }
          return
        }
        if (!resolved || resolved.kind !== 'blob') continue
        // Never revoke a shared learning-stereo URL — finalizeBlobUrl may return
        // the same session-cached blob that audioParts / the player still hold.
        const sharedStereo = hasCachedLearningStereo(d.tag_id, p, resolved.url)
        if (audioParts.value[p]) {
          if (!sharedStereo) URL.revokeObjectURL(resolved.url)
          continue
        }
        audioParts.value = { ...audioParts.value, [p]: track(resolved.url) }
      } catch {
        /* best-effort prefetch */
      }
    }
  }

  const sheetAssets = computed(() => {
    const d = detail.value
    if (!d) return resolveSheetAssets({})
    // Always classify from catalog paths. Feeding blob: URLs as sheet_pages breaks
    // redundancy checks and resurrects the bogus “Image file → Pages” picker.
    const assets = resolveSheetAssets(d)
    const cached = cachedSheetPages.value
    if (!cached?.length) return assets
    // Keep offline/blob display on the primary image set only.
    const primary = assets.imageSets[0]
    if (!primary || cached.length !== primary.paths.length) return assets
    return {
      ...assets,
      imageSets: [{ ...primary, paths: cached }, ...assets.imageSets.slice(1)],
    }
  })

  const sheetPages = computed(() => sheetAssets.value.imageSets[0]?.paths ?? [])

  /** Fetch tag JSON from network, favorites fallback, or sheets pack cache. */
  async function loadDetailJson(
    wantedId: string,
    signal: AbortSignal,
    cached: StarredTagRecord | undefined,
  ): Promise<TagDetail | null> {
    const offlineMode = useOfflineModeStore()
    const offline = offlineMode.offline

    async function fromLocal(): Promise<TagDetail | null> {
      if (cached?.detail) {
        fromCache.value = true
        return cached.detail
      }
      const metaUrl = tagDetailUrl(wantedId)
      const packed = await sheetsPack.get(metaUrl)
      if (packed) {
        fromCache.value = true
        return (await packed.json()) as TagDetail
      }
      const transferred = await getTransferredTag(Number(wantedId))
      if (transferred?.detail) {
        fromCache.value = true
        // Reuse starred sheet resolution path with the peer-received blob.
        starredRecord = {
          tagId: transferred.tagId,
          starredAt: transferred.receivedAt,
          summary: transferred.summary,
          detail: transferred.detail,
          sheetBlobs: [transferred.sheet],
          offlineMedia: true,
        }
        return transferred.detail
      }
      return null
    }

    // Offline: prefer local blobs/packs. When Offline *mode* is on but the
    // browser still has a network, allow tag metadata JSON so the normal tag
    // page can render with Load Sheet / Load Tracks placeholders.
    if (offline) {
      const local = await fromLocal()
      if (local) return local
      if (!offlineMode.browserOffline) {
        try {
          const res = await fetchCached(tagDetailUrl(wantedId), { signal })
          if (signal.aborted) return null
          if (res.ok) return (await res.json()) as TagDetail
        } catch {
          /* stay on unavailable */
        }
      }
      if (signal.aborted) return null
      error.value = 'This tag isn’t cached on this device yet.'
      return null
    }

    // Online: prefer pack/favorite metadata when present so WebP can paint without
    // waiting on a network round-trip (prev/next through a cached library).
    const local = await fromLocal()
    if (local) return local

    try {
      const res = await fetchCached(tagDetailUrl(wantedId), { signal })
      if (!res.ok) throw new Error(`Missing tag (${res.status})`)
      return (await res.json()) as TagDetail
    } catch (e) {
      if (signal.aborted) return null
      error.value =
        e instanceof Error
          ? e.message
          : String(e)
      return null
    }
  }

  /** Load or reload tag detail and prepare display-ready sheet pages. */
  async function load(): Promise<void> {
    fetchAbort?.abort()
    fetchAbort = new AbortController()
    const { signal } = fetchAbort
    const seq = ++loadSeq
    const wantedId = idStr()
    const prevDetail = detail.value
    const sameTag = prevDetail != null && String(prevDetail.tag_id) === wantedId
    const hadPaintedSheet =
      !!prevDetail &&
      (() => {
        const a = resolveSheetAssets(prevDetail)
        return a.imageSets.length > 0 || a.pdfs.length > 0
      })()

    // Soft prev/next keeps the prior tag painted — do not flip into a loading
    // shell that would unmount the pager. Same-tag reload / cold start still load.
    loading.value = sameTag || !prevDetail
    error.value = null
    fromCache.value = false
    // Reserve empty-slot height only when nothing is on screen yet. Cross-tag
    // nav keeps the previous sheet painted until the next one is ready.
    if (!hadPaintedSheet) sheetPreparing.value = true

    if (sameTag) {
      // Online reconnect / same-tag reload: drop degraded session audio so HQ can win.
      if (!useOfflineModeStore().offline) {
        dropResolvedAudioForOnlineUpgrade()
      }
    }
    // Soft cross-tag nav: leave detail / sheets / audio alone until this load
    // commits (or is aborted). Clearing them mid-flight empties Tracks/Sheets
    // while the user is still mashing prev/next.

    const numericId = Number(wantedId)
    let cached: StarredTagRecord | undefined
    try {
      await favorites.ensureLoaded()
      if (seq !== loadSeq) return
      cached = (await favorites.get(numericId)) ?? (await getStarred(numericId))
      if (seq !== loadSeq) return

      const d = await loadDetailJson(wantedId, signal, cached)
      if (seq !== loadSeq || idStr() !== wantedId) return
      if (!d) {
        sheetPreparing.value = false
        // Aborted / superseded loads return null — keep prior detail so prev/next
        // chrome stays mounted while the user clicks ahead.
        if (signal.aborted || seq !== loadSeq) return
        if (!sameTag && prevDetail) {
          detail.value = null
          clearMedia(prevDetail.tag_id)
        }
        return
      }

      const offlineMode = useOfflineModeStore()
      const offlineOnly = offlineMode.offline
      const assets = resolveSheetAssets(d)
      const hasSheet = assets.imageSets.length > 0 || assets.pdfs.length > 0

      // Resolve sheet blobs before swapping UI so the first paint is final WebP
      // (blob or network) — not network → blob → crop. Check abort between paths
      // so rapid prev/next does not pile up IDB/network work on the main thread.
      const { pages: nextBlobPages } = await collectSheetBlobPages(
        d,
        cached ?? undefined,
        offlineOnly,
        signal,
      )
      if (seq !== loadSeq || idStr() !== wantedId || signal.aborted) {
        if (nextBlobPages) for (const u of nextBlobPages) URL.revokeObjectURL(u)
        return
      }

      // Probe + seed before paint so Tracks does not flash empty on commit.
      starredRecord = cached
      const { parts: probed, hasPackAudio: packHit } = await probeTagAudioAvailability(d, {
        starred: cached ?? null,
        offlineOnly,
      })
      if (seq !== loadSeq || idStr() !== wantedId) {
        if (nextBlobPages) for (const u of nextBlobPages) URL.revokeObjectURL(u)
        return
      }

      const staleUrls = take()
      const stalePrepared = preparedSheet.value
      if (prevDetail && !sameTag) {
        clearLearningStereoCache(prevDetail.tag_id)
      }

      const trackedPages = nextBlobPages?.map((u) => track(u)) ?? null
      let nextPrepared: PreparedSheet | null
      if (trackedPages?.length) {
        nextPrepared = { pages: [...trackedPages], owned: [] }
      } else if (!hasSheet) {
        nextPrepared = { pages: [], owned: [] }
      } else {
        // Let SheetViewer paint catalog WebP paths and upgrade to PDF itself.
        nextPrepared = null
      }

      // Single commit: title/sheets/tracks swap together — skipped tags never paint.
      // Replace audio in the same turn as detail so TagPlayer never mounts with a
      // previous tag’s URLs (that caused 404s on sheet-only tags like #214).
      const audioSources = seedStarredAudio(cached, d, offlineOnly)
      // Offline: only parts that probe as playable (pack/star). Do not merge raw
      // catalog keys — that showed Lead/Tenor tabs with no resolvable offline bytes.
      // Online: include catalog parts so tabs appear before network warm finishes.
      const nextAvailable = sortPartIds([
        ...new Set([
          ...probed,
          ...Object.keys(audioParts.value),
          ...(offlineOnly ? [] : listAudioParts(d)),
        ]),
      ])
      detail.value = d
      cachedSheetPages.value = trackedPages
      preparedSheet.value = nextPrepared
      hasPackAudio.value = packHit
      availableAudioParts.value = nextAvailable
      const sources = new Set<'star' | 'pack' | 'network'>([...audioSources])
      if (trackedPages?.length) sources.add(cached?.sheetBlobs?.length ? 'star' : 'pack')
      if (packHit) sources.add('pack')
      if (sources.size === 0) mediaSource.value = 'network'
      else if (sources.size === 1) mediaSource.value = [...sources][0]!
      else mediaSource.value = 'mixed'
      sheetPreparing.value = false

      await nextTick()
      revokePreparedSheet(stalePrepared)
      for (const u of staleUrls) URL.revokeObjectURL(u)
    } finally {
      if (seq === loadSeq) {
        loading.value = false
        sheetPreparing.value = false
      }
    }

    // Warm default audio after sheets are shown — do not block load() on reconstruct.
    if (seq === loadSeq && detail.value) {
      const warmDetail = detail.value
      const warmCached = cached ?? undefined
      const warmOffline = useOfflineModeStore().offline
      audioWarming.value = true
      void warmDefaultAudio(warmDetail, warmCached, warmOffline, seq)
        .catch(() => {
          /* warm is best-effort */
        })
        .finally(() => {
          if (seq === loadSeq) audioWarming.value = false
        })
    } else if (seq === loadSeq) {
      audioWarming.value = false
    }
  }

  /** Build a {@link TagSummary} from the loaded detail (for starring / list cards). */
  function toSummary(): TagSummary | null {
    const d = detail.value
    if (!d) return null
    const assets = resolveSheetAssets(d)
    return {
      id: d.tag_id,
      title: d.title,
      altTitle: d.alt_title,
      arranger: d.arranger,
      key: d.key,
      writKey: d.writ_key,
      rating: d.rating ?? null,
      ratingCount: d.rating_count,
      downloads: d.download_count,
      type: d.type ?? null,
      collection: d.collection ?? null,
      classic: d.classic,
      year: d.year,
      parts: d.parts_count,
      hasSheet: !!(assets.imageSets.length || assets.pdfs.length || d.sheet),
      audioParts: listAudioParts(d) as PartId[],
      sheet: d.sheet ?? null,
      sheetPages: d.sheet_pages,
    }
  }

  // useObjectUrls revokes blobs on unmount; drop learning-stereo map entries so
  // a later visit cannot reuse revoked blob: URLs from the session cache.
  onUnmounted(() => {
    clearLearningStereoCache(detail.value?.tag_id)
  })

  return {
    detail,
    error,
    fromCache,
    audioParts,
    availableAudioParts,
    hasLowerQualityAudio,
    hasPackAudio,
    sheetPages,
    sheetAssets,
    preparedSheet,
    loading,
    sheetPreparing,
    audioWarming,
    mediaSource,
    load,
    resolvePart,
    toSummary,
  }
}
