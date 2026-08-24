import { computed, ref, type Ref } from 'vue'
import type { PartId, TagDetail, TagSummary } from '../types/tag'
import { mediaUrl, tagDetailUrl } from '../lib/mediaUrl'
import { resolveSheetAssets } from '../lib/sheetAssets'
import { prepareDefaultSheet, revokePreparedSheet, type PreparedSheet } from '../lib/prepareSheet'
import { getStarred, blobUrlFromCached, type StarredTagRecord } from '../offline/starredDb'
import { resolvePathUrl } from '../offline/resolveMedia'
import { sheetsPack } from '../offline/libraryPack'
import { useStarsStore } from '../stores/stars'
import { useObjectUrls } from './useObjectUrls'

export function useTagDetail(id: Ref<string> | string) {
  const stars = useStarsStore()
  const { track, revokeAll } = useObjectUrls()
  const detail = ref<TagDetail | null>(null)
  const error = ref<string | null>(null)
  const fromCache = ref(false)
  const audioParts = ref<Record<string, string>>({})
  /** Catalog relative paths from tag metadata (hosted originals). */
  const catalogAudio = ref<Record<string, string>>({})
  /** True when starred cache has at least one non-original audio part. */
  const hasLowerQualityAudio = ref(false)
  /** Offline blob URLs for raster pages (starred or pack). */
  const cachedSheetPages = ref<string[] | null>(null)
  const mediaSource = ref<'network' | 'star' | 'pack' | 'mixed'>('network')
  /** Default sheet pages prepared (cropped) before content below Pitch is revealed. */
  const preparedSheet = ref<PreparedSheet | null>(null)
  /** True while fetching tag JSON (header/Pitch not ready yet). */
  const loading = ref(false)
  /** True while cropping/rendering the default sheet (below-Pitch content gated). */
  const sheetPreparing = ref(false)
  let fetchAbort: AbortController | null = null
  let loadSeq = 0

  function idStr(): string {
    return typeof id === 'string' ? id : id.value
  }

  function clearPreparedSheet(): void {
    revokePreparedSheet(preparedSheet.value)
    preparedSheet.value = null
  }

  function clearMedia(): void {
    revokeAll()
    audioParts.value = {}
    catalogAudio.value = {}
    hasLowerQualityAudio.value = false
    cachedSheetPages.value = null
    mediaSource.value = 'network'
    clearPreparedSheet()
  }

  async function resolveSheetsAndAudio(
    d: TagDetail,
    cached: StarredTagRecord | undefined,
    offlineOnly: boolean,
  ): Promise<void> {
    const sources = new Set<'star' | 'pack' | 'network'>()

    // Sheets — prefer path match; fall back to ordered starred sheetBlobs (legacy cache)
    const sheetPaths = d.sheet_pages?.length ? d.sheet_pages : []
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
      if (pages.length === sheetPaths.length) {
        cachedSheetPages.value = pages
      } else {
        cachedSheetPages.value = null
      }
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
        sources.add(resolved.source)
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

    // Audio — prefer part blobs from starred record, else resolve by path
    const audioEntries = Object.entries(d.audio) as Array<[PartId, string]>
    catalogAudio.value = { ...d.audio }
    const parts: Record<string, string> = {}
    let lowerQuality = false
    if (cached?.audioBlobs && Object.keys(cached.audioBlobs).length) {
      for (const [part, entry] of Object.entries(cached.audioBlobs) as Array<
        [PartId, { mime: string; data: ArrayBuffer; path: string; quality?: string }]
      >) {
        const url = blobUrlFromCached(entry)
        if (url) {
          parts[part] = track(url)
          sources.add('star')
          if (entry.quality && entry.quality !== 'original') lowerQuality = true
          // Legacy blobs without quality were typically re-encoded at star time.
          if (!entry.quality) lowerQuality = true
        }
      }
    }
    if (!Object.keys(parts).length) {
      for (const [part, path] of audioEntries) {
        const resolved = await resolvePathUrl(path, {
          starred: cached ?? null,
          offlineOnly,
        })
        if (resolved?.kind === 'blob') {
          parts[part] = track(resolved.url)
          sources.add(resolved.source)
        } else if (resolved?.kind === 'network' && !offlineOnly) {
          parts[part] = path
          sources.add('network')
        }
      }
    }
    hasLowerQualityAudio.value = lowerQuality
    if (Object.keys(parts).length) {
      audioParts.value = parts
    } else if (!offlineOnly) {
      audioParts.value = { ...d.audio }
    } else {
      audioParts.value = {}
    }

    if (sources.size === 0) mediaSource.value = 'network'
    else if (sources.size === 1) mediaSource.value = [...sources][0]!
    else mediaSource.value = 'mixed'
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

  /** Flat image paths for the default/first image set (tests + simple callers). */
  const sheetPages = computed(() => sheetAssets.value.imageSets[0]?.paths ?? [])

  async function loadDetailJson(
    wantedId: string,
    signal: AbortSignal,
    cached: StarredTagRecord | undefined,
  ): Promise<TagDetail | null> {
    try {
      const res = await fetch(tagDetailUrl(wantedId), { signal })
      if (!res.ok) throw new Error(`Missing tag (${res.status})`)
      return (await res.json()) as TagDetail
    } catch (e) {
      if (signal.aborted) return null
      if (cached?.detail) {
        fromCache.value = true
        return cached.detail
      }
      // Offline pack may have cached metadata.json
      const metaUrl = mediaUrl(`tags/${wantedId}/metadata.json`)
      const packed = await sheetsPack.get(metaUrl)
      if (packed) {
        fromCache.value = true
        return (await packed.json()) as TagDetail
      }
      const offline = typeof navigator !== 'undefined' && !navigator.onLine
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
      const offlineOnly = typeof navigator !== 'undefined' && !navigator.onLine
      await resolveSheetsAndAudio(d, cached ?? undefined, offlineOnly)
      if (seq !== loadSeq) return

      // Header + Pitch can render now; keep below-Pitch gated until sheet is ready.
      loading.value = false

      try {
        const assets = sheetAssets.value
        const hasSheet = assets.imageSets.length > 0 || assets.pdfs.length > 0
        if (hasSheet) {
          const prepared = await prepareDefaultSheet(assets, {
            crop: true,
            signal,
            allowPdf: !cachedSheetPages.value?.length && !offlineOnly,
          })
          if (signal.aborted || seq !== loadSeq) {
            revokePreparedSheet(prepared)
            return
          }
          preparedSheet.value = prepared
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
      audioParts: Object.keys(d.audio) as PartId[],
      sheet: d.sheet ?? null,
      sheetPages: d.sheet_pages,
    }
  }

  return {
    detail,
    error,
    fromCache,
    audioParts,
    catalogAudio,
    hasLowerQualityAudio,
    sheetPages,
    sheetAssets,
    preparedSheet,
    loading,
    sheetPreparing,
    mediaSource,
    load,
    toSummary,
  }
}
