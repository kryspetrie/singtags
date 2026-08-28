import { computed, ref, watch, type Ref } from 'vue'
import type { PartId, TagDetail, TagSummary } from '../types/tag'
import {
  cachedPathCandidates,
  inferLowerQualityFromStarred,
  isUltraSoloPath,
  listAudioParts,
  usesMonoSolos,
} from '../lib/audioTiers'
import { preferredDefaultPart, sortPartIds } from '../lib/parts'
import { mediaUrl, tagDetailUrl } from '../lib/mediaUrl'
import { resolveSheetAssets } from '../lib/sheetAssets'
import { sheetDisplayPages } from '../lib/sheetPaths'
import { prepareDefaultSheet, revokePreparedSheet, type PreparedSheet } from '../lib/prepareSheet'
import { getStarred, blobUrlFromCached, type StarredTagRecord } from '../offline/starredDb'
import { fetchCached } from '../lib/manualOfflineFetch'
import { packHasPath, probeAvailableAudioParts, resolveAudioPart, resolvePathUrl, clearLearningStereoCache, hasCachedLearningStereo } from '../offline/resolveMedia'
import { sheetsPack } from '../offline/libraryPack'
import { useStarsStore } from '../stores/stars'
import { useOfflineModeStore } from '../stores/offlineMode'
import { useObjectUrls } from './useObjectUrls'

export function useTagDetail(id: Ref<string> | string) {
  const stars = useStarsStore()
  const { track, revokeAll } = useObjectUrls()
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
  const mediaSource = ref<'network' | 'star' | 'pack' | 'mixed'>('network')
  const preparedSheet = ref<PreparedSheet | null>(null)
  const loading = ref(false)
  const sheetPreparing = ref(false)

  let starredRecord: StarredTagRecord | undefined
  let fetchAbort: AbortController | null = null
  let loadSeq = 0

  function isBlobPlaybackUrl(url: string): boolean {
    return url.startsWith('blob:')
  }

  async function probePackAudio(d: TagDetail): Promise<boolean> {
    for (const part of listAudioParts(d)) {
      for (const path of cachedPathCandidates(d, part)) {
        if (await packHasPath(path)) return true
      }
    }
    return false
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

  watch(
    () => useOfflineModeStore().offline,
    (now, prev) => {
      if (now && !prev) dropNonBlobAudioParts()
      const d = detail.value
      if (d) {
        void probeAvailableAudioParts(d, {
          starred: starredRecord ?? null,
          offlineOnly: now,
        }).then((parts) => {
          if (detail.value === d) availableAudioParts.value = parts
        })
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

  function clearMedia(): void {
    const tagId = detail.value?.tag_id
    revokeAll()
    clearLearningStereoCache(tagId)
    audioParts.value = {}
    availableAudioParts.value = []
    hasLowerQualityAudio.value = false
    cachedSheetPages.value = null
    hasPackAudio.value = false
    mediaSource.value = 'network'
    starredRecord = undefined
    clearPreparedSheet()
  }

  async function resolveSheets(
    d: TagDetail,
    cached: StarredTagRecord | undefined,
    offlineOnly: boolean,
  ): Promise<Set<'star' | 'pack' | 'network'>> {
    const sources = new Set<'star' | 'pack' | 'network'>()
    const sheetPaths = sheetDisplayPages(d)

    if (cached?.sheetBlobs?.length && sheetPaths.length) {
      const pages: string[] = []
      for (let i = 0; i < sheetPaths.length; i++) {
        const path = sheetPaths[i]!
        const byPath = cached.sheetBlobs.find((b) => b.path === path)
        const entry = byPath ?? cached.sheetBlobs[i]
        if (!entry) break
        const url = blobUrlFromCached(entry)
        if (!url) break
        pages.push(track(url))
        sources.add('star')
      }
      cachedSheetPages.value = pages.length === sheetPaths.length ? pages : null
    } else if (sheetPaths.length) {
      const pages: string[] = []
      let allBlob = true
      for (const path of sheetPaths) {
        const resolved = await resolvePathUrl(path, {
          starred: cached ?? null,
          offlineOnly,
        })
        if (!resolved || resolved.kind !== 'blob') {
          allBlob = false
          break
        }
        sources.add(resolved.source === 'reconstruct' ? 'pack' : resolved.source)
        pages.push(track(resolved.url))
      }
      cachedSheetPages.value = allBlob && pages.length ? pages : null
    } else if (cached?.sheetBlobs?.length) {
      const pages: string[] = []
      for (const b of cached.sheetBlobs) {
        const url = blobUrlFromCached(b)
        if (url) pages.push(track(url))
      }
      cachedSheetPages.value = pages.length ? pages : null
      if (pages.length) sources.add('star')
    } else {
      cachedSheetPages.value = null
    }

    return sources
  }

  /**
   * Seed audio from starred blobs only — no network/pack/mix work at tag load.
   * Offline mono_solos voice stems are skipped so resolveAudioPart can rebuild
   * learning-track stereo (solo hard on one side, accompaniment on the other).
   */
  function seedStarredAudio(
    cached: StarredTagRecord | undefined,
    d: TagDetail | undefined,
    offlineOnly: boolean,
  ): Set<'star' | 'pack' | 'network'> {
    const sources = new Set<'star' | 'pack' | 'network'>()
    const parts: Record<string, string> = {}
    const skipUltraVoiceSeed = offlineOnly && !!d && usesMonoSolos(d)

    if (cached?.audioBlobs) {
      for (const [part, entry] of Object.entries(cached.audioBlobs)) {
        if (
          skipUltraVoiceSeed &&
          part.toLowerCase() !== 'mix' &&
          (isUltraSoloPath(entry.path) || entry.quality === 'lofi')
        ) {
          continue
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

  async function warmPreferredPart(
    d: TagDetail,
    preferred: string,
    cached: StarredTagRecord | undefined,
    offlineOnly: boolean,
  ): Promise<'star' | 'pack' | 'network' | 'reconstruct' | null> {
    const existing = audioParts.value[preferred]
    const needsOfflineVoiceReconstruct =
      offlineOnly &&
      usesMonoSolos(d) &&
      preferred.toLowerCase() !== 'mix'
    if (existing && !(needsOfflineVoiceReconstruct && isBlobPlaybackUrl(existing) && !hasCachedLearningStereo(d.tag_id, preferred, existing))) {
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

  async function resolveSheetsAndAudio(
    d: TagDetail,
    cached: StarredTagRecord | undefined,
    offlineOnly: boolean,
  ): Promise<void> {
    starredRecord = cached
    const probed = await probeAvailableAudioParts(d, {
      starred: cached ?? null,
      offlineOnly,
    })

    const sheetSources = await resolveSheets(d, cached, offlineOnly)
    const audioSources = seedStarredAudio(cached, d, offlineOnly)

    // Publish tabs immediately so a slow/hung Mix reconstruct cannot leave "No audio".
    availableAudioParts.value = sortPartIds([
      ...new Set([...probed, ...Object.keys(audioParts.value)]),
    ])
    hasPackAudio.value = await probePackAudio(d)

    const preferred = preferredDefaultPart(probed)
    if (preferred) {
      const src = await warmPreferredPart(d, preferred, cached, offlineOnly)
      if (src) audioSources.add(src === 'reconstruct' ? 'pack' : src)
    }

    availableAudioParts.value = sortPartIds([
      ...new Set([...probed, ...Object.keys(audioParts.value)]),
    ])

    const sources = new Set([...sheetSources, ...audioSources])
    if (hasPackAudio.value) sources.add('pack')

    if (sources.size === 0) mediaSource.value = 'network'
    else if (sources.size === 1) mediaSource.value = [...sources][0]!
    else mediaSource.value = 'mixed'
  }

  /**
   * Lazy-resolve one part on first play / tab switch.
   * Returns a URL suitable for fetch/decode (absolute or blob).
   */
  async function resolvePart(part: string): Promise<string | null> {
    const d = detail.value
    if (!d) return null

    const offlineOnly = useOfflineModeStore().offline
    const existing = audioParts.value[part]
    const needsOfflineVoiceReconstruct =
      offlineOnly && usesMonoSolos(d) && part.toLowerCase() !== 'mix'

    if (existing) {
      if (isBlobPlaybackUrl(existing)) {
        // Offline voice parts must be learning-stereo (solo vs accompaniment), not raw dual-mono.
        if (
          !needsOfflineVoiceReconstruct ||
          hasCachedLearningStereo(d.tag_id, part, existing)
        ) {
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
    for (const p of availableAudioParts.value) {
      if (p.toLowerCase() === except || p.toLowerCase() === 'mix') continue
      if (audioParts.value[p]) continue
      try {
        const resolved = await resolveAudioPart(d, p, {
          starred: starredRecord ?? null,
          offlineOnly: true,
        })
        if (!resolved || resolved.kind !== 'blob') continue
        if (detail.value !== d) {
          URL.revokeObjectURL(resolved.url)
          return
        }
        if (audioParts.value[p]) {
          URL.revokeObjectURL(resolved.url)
          continue
        }
        audioParts.value = { ...audioParts.value, [p]: track(resolved.url) }
      } catch {
        /* best-effort prefetch */
      }
    }
  }

  function applyDetailSync(d: TagDetail): void {
    detail.value = d
  }

  const sheetAssets = computed(() => {
    const d = detail.value
    if (!d) return resolveSheetAssets({})
    if (cachedSheetPages.value?.length) {
      return resolveSheetAssets({
        sheet: d.sheet,
        sheets: d.sheets,
        sheet_pages: cachedSheetPages.value,
      })
    }
    return resolveSheetAssets(d)
  })

  const sheetPages = computed(() => sheetAssets.value.imageSets[0]?.paths ?? [])

  async function loadDetailJson(
    wantedId: string,
    signal: AbortSignal,
    cached: StarredTagRecord | undefined,
  ): Promise<TagDetail | null> {
    try {
      const res = await fetchCached(tagDetailUrl(wantedId), { signal })
      if (!res.ok) throw new Error(`Missing tag (${res.status})`)
      return (await res.json()) as TagDetail
    } catch (e) {
      if (signal.aborted) return null
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
      const offlineMode = useOfflineModeStore()
      const offline = offlineMode.offline
      error.value = offline
        ? 'This tag isn’t cached on this device yet.'
        : e instanceof Error
          ? e.message
          : String(e)
      return null
    }
  }

  async function load(): Promise<void> {
    fetchAbort?.abort()
    fetchAbort = new AbortController()
    const { signal } = fetchAbort
    const seq = ++loadSeq
    const wantedId = idStr()

    loading.value = true
    sheetPreparing.value = true
    error.value = null
    fromCache.value = false
    detail.value = null
    clearMedia()

    const numericId = Number(wantedId)
    try {
      await stars.ensureLoaded()
      if (seq !== loadSeq) return
      const cached = (await stars.get(numericId)) ?? (await getStarred(numericId))
      if (seq !== loadSeq) return

      const d = await loadDetailJson(wantedId, signal, cached)
      if (seq !== loadSeq || idStr() !== wantedId) return
      if (!d) {
        sheetPreparing.value = false
        return
      }

      applyDetailSync(d)
      sheetPreparing.value = false

      const offlineMode = useOfflineModeStore()
      const offlineOnly = offlineMode.offline
      await resolveSheetsAndAudio(d, cached ?? undefined, offlineOnly)
      if (seq !== loadSeq) return

      loading.value = false

      try {
        const assets = sheetAssets.value
        const hasSheet = assets.imageSets.length > 0 || assets.pdfs.length > 0
        if (hasSheet) {
          // Blob pages from star/pack resolve are already display-ready — skip re-crop.
          if (cachedSheetPages.value?.length) {
            preparedSheet.value = { pages: [...cachedSheetPages.value], owned: [] }
          } else {
            const prepared = await prepareDefaultSheet(assets, {
              crop: true,
              signal,
              allowPdf: !offlineOnly,
            })
            if (signal.aborted || seq !== loadSeq) {
              revokePreparedSheet(prepared)
              return
            }
            preparedSheet.value = prepared
          }
        } else {
          preparedSheet.value = { pages: [], owned: [] }
        }
      } catch (e) {
        if (signal.aborted || seq !== loadSeq) return
        if (!(e instanceof DOMException && e.name === 'AbortError')) {
          preparedSheet.value = { pages: [], owned: [] }
        }
      }
    } finally {
      if (seq === loadSeq) {
        loading.value = false
        sheetPreparing.value = false
      }
    }
  }

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
    mediaSource,
    load,
    resolvePart,
    toSummary,
  }
}
