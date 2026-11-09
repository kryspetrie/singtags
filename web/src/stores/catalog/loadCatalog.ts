/** Catalog and lyrics fetch, snapshot, and IndexedDB hydrate. */

import { type StoreDeps } from './deps'

import { SearchEngine } from '../../search/engine'

import type { ExpansionMap } from '../../search/expansions'

import type { CoreIndex, LyricsIndex, TagSummary } from '../../types/tag'

import {
  loadCatalogSnapshotAsync,
  loadCatalogSnapshotSync,
  saveCatalogSnapshot,
  type CatalogSnapshot,
} from '../../lib/catalogSnapshot'

import {
  browseUrlLooksDefault,
  loadCatalogFirstPaint,
  saveCatalogFirstPaint,
} from '../../lib/catalogFirstPaint'

import { loadLyricsSnapshotMeta, saveLyricsSnapshot } from '../../lib/lyricsSnapshot'

import { putCatalogSnapshotIdb, setCatalogSnapshotSourceHash } from '../../offline/indexSnapshotDb'

import {
  digestSha1Hex,
  fetchGzipArrayBuffer,
  fetchJsonCached,
  parseGzipJsonBuffer,
} from '../../lib/gunzipJson'

import { indexesUrl, mediaUrl } from '../../lib/mediaUrl'

import { useOfflineLibraryStore } from '../offlineLibrary'

import { useOfflineModeStore } from '../offlineMode'

export function createCatalogLoadActions(deps: StoreDeps) {

  const catalogTotalHint = deps.catalogTotalHint
  const engine = deps.engine
  const error = deps.error
  const expansions = deps.expansions
  const firstPaintJumpKeys = deps.firstPaintJumpKeys
  const loaded = deps.loaded
  const loading = deps.loading
  const lyricsById = deps.lyricsById
  const lyricsEpoch = deps.lyricsEpoch
  const lyricsLoaded = deps.lyricsLoaded
  const lyricsLoading = deps.lyricsLoading
  const partialCatalog = deps.partialCatalog
  const tags = deps.tags

  /** In-flight lyrics prefetch so callers can await the same load. */
  let lyricsPrefetch: Promise<void> | null = null
  /** True after a successful online lyrics.json.gz fetch this session. */
  let lyricsRevalidatedOnline = false
  /** Dedupes boot IDB hydrate so HomeView `load()` waits instead of racing the network. */
  let idbHydratePromise: Promise<boolean> | null = null
  /** SHA-1 of the core index bytes already applied this session. */
  let lastCatalogSourceHash: string | null = null
  /** SHA-1 of the lyrics index bytes already applied this session. */
  let lastLyricsSourceHash: string | null = null

  function mixStr(h: number, s: string | null | undefined): number {
    if (!s) return Math.imul(h, 33)
    let x = h
    for (let i = 0; i < s.length; i++) x = Math.imul(x, 33) + s.charCodeAt(i)
    return x
  }

  /** Cheap fingerprint of browse fields so an unchanged refresh can skip SearchEngine. */
  function stampTags(list: readonly TagSummary[]): number {
    let h = list.length
    for (const t of list) {
      h = Math.imul(h, 33) + t.id
      h = mixStr(h, t.title)
      h = mixStr(h, t.altTitle)
      h = mixStr(h, t.arranger)
      h = mixStr(h, t.key)
      h = mixStr(h, t.writKey)
      h = mixStr(h, t.type)
      h = mixStr(h, t.collection)
      h = mixStr(h, t.classic == null ? '' : String(t.classic))
      h = mixStr(h, t.year == null ? '' : String(t.year))
      h = Math.imul(h, 33) + (t.rating ?? 0)
      h = Math.imul(h, 33) + (t.ratingCount ?? 0)
      h = Math.imul(h, 33) + (t.downloads ?? 0)
      h = Math.imul(h, 33) + (t.parts ?? 0)
      h = Math.imul(h, 33) + (t.hasSheet ? 1 : 0)
      h = Math.imul(h, 33) + (t.hasLyrics === false ? 0 : 1)
      h = mixStr(h, t.audioParts.join('\n'))
      h = mixStr(h, t.audioTiers?.join('\n'))
      h = mixStr(h, t.sheet)
      h = mixStr(h, t.sheetPreview)
      h = mixStr(h, t.sheetPages?.join('\n'))
      h = mixStr(h, t.ultraLow)
    }
    return h
  }

  /**
   * Apply fetched catalog tags and expansions; rebuild search engine.
   * Side effects: optional IndexedDB catalog snapshot, offline library `markCatalogCached`.
   *
   * @param opts.persist - Write snapshot (default true). False on IDB hydrate (already stored).
   * @param opts.deferEngine - When a first-paint slice is already on screen, yield once
   *   before swapping in the full index so that slice can paint.
   * @param opts.sourceHash - SHA-1 of the published core file, stored with the snapshot.
   */
  async function applyCatalogData(
    list: TagSummary[],
    exp: ExpansionMap,
    opts?: { persist?: boolean; deferEngine?: boolean; sourceHash?: string | null },
  ): Promise<void> {
    // A first-paint slice is already showing. Yield so it paints, then publish
    // tags and the search index in one turn (two updates sorted the full catalog twice).
    if (opts?.deferEngine && partialCatalog.value) {
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 0)
      })
    }

    const eng = new SearchEngine({
      tags: list,
      expansions: exp,
    })
    if (lyricsById.value.size) {
      eng.setLyrics(
        [...lyricsById.value.entries()].map(([id, lyrics]) => ({ id, lyrics })),
      )
      lyricsEpoch.value++
    }
    if (opts?.sourceHash) lastCatalogSourceHash = opts.sourceHash
    expansions.value = exp
    tags.value = list
    loaded.value = true
    partialCatalog.value = false
    catalogTotalHint.value = null
    firstPaintJumpKeys.value = null
    error.value = null
    engine.value = eng

    if (opts?.persist !== false) {
      await saveCatalogSnapshot(list, exp, opts?.sourceHash ?? lastCatalogSourceHash)
      saveCatalogFirstPaint(list)
      try {
        useOfflineLibraryStore().markCatalogCached()
      } catch {
        /* pinia may not be ready in unit tests */
      }
    }
  }

  /**
   * Load catalog from network (or manifest / IDB fallback).
   * Side effects: network, IndexedDB snapshot, prefetches lyrics when online.
   *
   * @param opts.refresh - Force re-fetch even when already loaded.
   *   When the catalog is already painted from a snapshot, refresh does not
   *   set `loading` (stale-while-revalidate — Browse stays interactive).
   */
  async function load(opts?: { refresh?: boolean }): Promise<void> {
    // Let boot IDB finish first so we paint cache before any network refresh.
    if (idbHydratePromise) await idbHydratePromise
    if (loading.value) return
    if (opts?.refresh) lyricsRevalidatedOnline = false
    if (loaded.value && !opts?.refresh) {
      // First-paint slice: wait one tick for boot hydrate to start, then await it.
      if (partialCatalog.value) {
        if (!idbHydratePromise) await Promise.resolve()
        if (idbHydratePromise) await idbHydratePromise
        if (!partialCatalog.value) {
          if (!lyricsLoading.value) void prefetchLyrics()
          return
        }
      } else {
        // Revalidate lyrics once per online session even if IDB already hydrated them.
        if (!lyricsLoading.value) void prefetchLyrics()
        return
      }
    }
    // Initial fetch shows the loading gate; background refresh must not.
    const showLoading = !loaded.value
    if (showLoading) {
      loading.value = true
      error.value = null
    }
    try {
      const [coreBuf, exp] = await Promise.all([
        fetchGzipArrayBuffer(indexesUrl('core.json.gz')),
        fetchJsonCached(indexesUrl('expansions.json'), { map: {} as ExpansionMap }),
      ])
      const sourceHash = await digestSha1Hex(coreBuf)
      const unchangedHash =
        !!sourceHash &&
        sourceHash === lastCatalogSourceHash &&
        loaded.value &&
        !partialCatalog.value
      // Refresh of an unchanged catalog: the list is already on screen.
      if (unchangedHash) {
        void prefetchLyrics()
        return
      }
      const core = await parseGzipJsonBuffer<CoreIndex>(coreBuf)
      const list = core.tags ?? []
      const sameCatalog =
        loaded.value &&
        !partialCatalog.value &&
        list.length === tags.value.length &&
        stampTags(list) === stampTags(tags.value) &&
        JSON.stringify(exp.map ?? {}) === JSON.stringify(expansions.value)
      if (sameCatalog) {
        if (sourceHash) {
          lastCatalogSourceHash = sourceHash
          void setCatalogSnapshotSourceHash(sourceHash).catch(() => {
            /* quota or private mode */
          })
        }
        void prefetchLyrics()
        return
      }
      await applyCatalogData(list, exp.map ?? {}, { sourceHash })
      void prefetchLyrics()
    } catch (e) {
      try {
        const res = await fetch(mediaUrl('manifest.json'))
        const data = (await res.json()) as { tags: TagSummary[] }
        const list = data.tags ?? []
        await applyCatalogData(list, {})
      } catch {
        const snap = await loadCatalogSnapshotAsync()
        if (snap?.tags.length) {
          await applyCatalogData(snap.tags, snap.expansions, {
            persist: false,
            deferEngine: true,
          })
          void hydrateLyricsFromIndexedDb()
          return
        }
        const offlineMode = useOfflineModeStore()
        if (offlineMode.manualOffline) {
          error.value =
            'Offline mode is on — browse needs the catalog in memory or cache. Go online once, then try again.'
        } else if (offlineMode.offline) {
          error.value =
            'Connect once to download the catalog, then SingTags works offline.'
        } else {
          error.value = e instanceof Error ? e.message : String(e)
        }
      }
    } finally {
      if (showLoading) loading.value = false
    }
  }

  /**
   * Instant Browse paint from a tiny sync cache (one viewport of collection order).
   * Skipped when the URL already has search/filters (would flash the wrong list).
   */
  function hydrateFirstPaint(): boolean {
    if (loaded.value) return true
    if (!browseUrlLooksDefault()) return false
    const fp = loadCatalogFirstPaint()
    if (!fp?.tags.length) return false
    tags.value = fp.tags
    loaded.value = true
    partialCatalog.value = true
    catalogTotalHint.value = fp.totalCount
    firstPaintJumpKeys.value = fp.jumpKeys?.length ? [...fp.jumpKeys] : null
    error.value = null
    engine.value = null
    return true
  }

  /**
   * Jump-rail chrome only (no tag rows). Used for `?at=` reloads so mid-list
   * layout can size the collection strip before IDB returns.
   */
  function hydrateFirstPaintChrome(): boolean {
    if (firstPaintJumpKeys.value?.length) return true
    const fp = loadCatalogFirstPaint()
    if (!fp?.jumpKeys?.length) return false
    firstPaintJumpKeys.value = [...fp.jumpKeys]
    if (catalogTotalHint.value == null && fp.totalCount > 0) {
      catalogTotalHint.value = fp.totalCount
    }
    return true
  }

  /** Sync restore from localStorage mirror (instant boot). */
  function hydrateFromSnapshot(): boolean {
    if (loaded.value && !partialCatalog.value) return true
    const snap = loadCatalogSnapshotSync()
    if (!snap?.tags.length) return false
    // Sync path: defer engine so the first frame can clear “Loading catalog…”.
    void applyCatalogData(snap.tags, snap.expansions, { persist: false, deferEngine: true })
    return true
  }

  /** Merge lyrics into search engine and in-memory map; does not persist alone. */
  function applyLyricsDocs(docs: Array<{ id: number; lyrics: string }>): void {
    engine.value?.setLyrics(docs)
    lyricsEpoch.value++
    const map = new Map<number, string>()
    for (const d of docs) {
      if (d.lyrics?.trim()) map.set(d.id, d.lyrics.trim())
    }
    lyricsById.value = map
    lyricsLoaded.value = map.size > 0
  }

  function trackHydrate(work: Promise<boolean>): Promise<boolean> {
    if (idbHydratePromise) return idbHydratePromise
    idbHydratePromise = work
    void work.finally(() => {
      if (idbHydratePromise === work) idbHydratePromise = null
    })
    return work
  }

  /** Apply an IDB/preloaded snapshot. Gzip rows are not rewritten on every refresh. */
  async function finishIdbSnap(snap: CatalogSnapshot | null): Promise<boolean> {
    if (loaded.value && !partialCatalog.value) return true
    if (!snap?.tags.length) return false
    if (snap.sourceHash) lastCatalogSourceHash = snap.sourceHash
    await applyCatalogData(snap.tags, snap.expansions, {
      persist: false,
      deferEngine: true,
    })
    if (snap.storageFormat !== 'gzip') {
      void putCatalogSnapshotIdb(snap.tags, snap.expansions, snap.sourceHash).catch(() => {
        /* quota */
      })
    }
    return true
  }

  /**
   * Register the boot IndexedDB read before Vue mounts so `load()` waits for it
   * instead of starting a second catalog fetch.
   */
  function beginIndexedDbHydrate(preloaded: Promise<CatalogSnapshot | null>): Promise<boolean> {
    return trackHydrate(
      (async () => {
        if (loaded.value && !partialCatalog.value) return true
        return finishIdbSnap(await preloaded)
      })(),
    )
  }

  /** Restore catalog from IndexedDB — lyrics hydrate separately after first paint. */
  async function hydrateFromIndexedDb(
    preloaded?: { tags: TagSummary[]; expansions?: ExpansionMap } | null,
  ): Promise<boolean> {
    if (idbHydratePromise) return idbHydratePromise
    return trackHydrate(
      (async () => {
        if (loaded.value && !partialCatalog.value) return true
        const snap = preloaded?.tags?.length
          ? {
              tags: preloaded.tags,
              expansions: preloaded.expansions ?? {},
              sourceHash: null,
              storageFormat: 'legacy' as const,
            }
          : await loadCatalogSnapshotAsync()
        return finishIdbSnap(snap)
      })(),
    )
  }

  /** Load lyrics index only from IndexedDB (when catalog already in memory). */
  async function hydrateLyricsFromIndexedDb(): Promise<boolean> {
    if (lyricsLoaded.value) return true
    const meta = await loadLyricsSnapshotMeta()
    if (!meta?.docs.length) return false
    if (meta.sourceHash) lastLyricsSourceHash = meta.sourceHash
    applyLyricsDocs(meta.docs)
    return true
  }

  /**
   * Background-fetch lyrics index when online.
   * Uses IndexedDB for instant paint, then revalidates from the network so
   * published lyric edits show up without clearing site data.
   */
  async function prefetchLyrics(): Promise<void> {
    if (lyricsPrefetch) return lyricsPrefetch
    if (lyricsLoaded.value && lyricsRevalidatedOnline) return
    lyricsPrefetch = (async () => {
      lyricsLoading.value = true
      try {
        const offlineMode = useOfflineModeStore()
        const cached = await loadLyricsSnapshotMeta()
        if (cached?.docs.length && !lyricsLoaded.value) {
          if (cached.sourceHash) lastLyricsSourceHash = cached.sourceHash
          applyLyricsDocs(cached.docs)
        }
        if (offlineMode.offline) return

        const lyricsBuf = await fetchGzipArrayBuffer(indexesUrl('lyrics.json.gz'))
        const lyricsHash = await digestSha1Hex(lyricsBuf)
        if (lyricsHash && lyricsHash === lastLyricsSourceHash && lyricsLoaded.value) {
          lyricsRevalidatedOnline = true
          return
        }
        const idx = await parseGzipJsonBuffer<LyricsIndex>(lyricsBuf)
        const docs = idx.docs ?? []
        if (!docs.length) return
        if (lyricsHash) lastLyricsSourceHash = lyricsHash
        applyLyricsDocs(docs)
        saveLyricsSnapshot(docs, lyricsHash)
        lyricsRevalidatedOnline = true
      } catch {
        /* optional — keep IDB lyrics if network fails */
      } finally {
        lyricsLoading.value = false
        lyricsPrefetch = null
      }
    })()
    return lyricsPrefetch
  }

  /**
   * Lyrics preview for browse rows (whitespace collapsed to one line).
   * Visual truncation is left to CSS line-clamp so wide cards can show more.
   *
   * @param id - Tag id.
   */
  function lyricsSnippet(id: number): string | null {
    const raw = lyricsById.value.get(id)
    if (!raw) return null
    const oneLine = raw.replace(/\s+/g, ' ').trim()
    return oneLine || null
  }

  /** Ensure lyrics index is loaded (revalidates from network when online). */
  async function ensureLyrics(): Promise<void> {
    await prefetchLyrics()
  }

  const actions = {
    applyCatalogData,
    load,
    hydrateFirstPaint,
    hydrateFirstPaintChrome,
    hydrateFromSnapshot,
    applyLyricsDocs,
    beginIndexedDbHydrate,
    hydrateFromIndexedDb,
    hydrateLyricsFromIndexedDb,
    prefetchLyrics,
    lyricsSnippet,
    ensureLyrics,
  }
  Object.assign(deps, actions)

  function bindWatches(): void {}

  return { actions, bindWatches }

}
